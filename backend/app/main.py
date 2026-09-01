import hashlib
import hmac
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import bleach
import httpx

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .ai_projects_router import router as ai_projects_router
from .config import get_settings
from .database import get_db
from .models import AdminSession, AdminUser, Attachment, AuditLog, AuthIdentity, Bookmark, Comment, OAuthState, Post, PostLike, utcnow
from .schemas import CommentInput, DisplayNameInput, LoginRequest, PostInput
from .security import create_session, get_current_session, get_optional_session, hash_password, require_admin, require_admin_csrf, require_confirmed, require_confirmed_csrf, require_csrf, token_digest, verify_password
from .webdav import safe_filename, storage


settings = get_settings()
app = FastAPI(title=settings.app_name, docs_url="/api/docs" if settings.environment != "production" else None, openapi_url="/api/openapi.json" if settings.environment != "production" else None)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.include_router(ai_projects_router)
if settings.origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"])

login_attempts: dict[str, deque[float]] = defaultdict(deque)
dummy_password_hash = hash_password("not-the-real-password")


def auth_payload(session: AdminSession, db: Session | None = None) -> dict:
    identity = None
    if db:
        identity = db.scalar(select(AuthIdentity).where(AuthIdentity.user_id == session.user.id, AuthIdentity.provider == "kakao"))
    suggested = identity.provider_nickname if identity and identity.provider_nickname else None
    return {"user": {"id": session.user.id, "username": session.user.username, "display_name": session.user.display_name, "display_name_confirmed": session.user.display_name_confirmed, "role": session.user.role}, "csrf_token": session.csrf_token, "requires_display_name": not session.user.display_name_confirmed, "suggested_display_name": suggested, "kakao": {"connected": identity is not None, "nickname": identity.provider_nickname if identity else None, "connected_at": identity.created_at if identity else None}}


def attachment_payload(item: Attachment) -> dict:
    return {
        "id": str(item.id), "filename": item.filename, "content_type": item.content_type, "size": item.size,
        "download_url": f"/api/attachments/{item.id}/download",
    }


def post_payload(item: Post, admin: bool = False, owned_by_current_user: bool = False) -> dict:
    thumbnail_url = None
    if item.thumbnail_type == "webdav" and item.thumbnail_path:
        thumbnail_url = f"/api/admin/posts/{item.id}/thumbnail" if admin else f"/api/posts/{quote(item.slug)}/thumbnail"
    return {
        "id": str(item.id), "slug": item.slug, "category": item.category, "title": item.title, "summary": item.summary,
        "body_markdown": item.body_markdown, "content_format": item.content_format, "content_density": item.content_density or "normal", "topics": item.topics or [], "key_points": item.key_points or [], "status": item.status, "owned_by_current_user": owned_by_current_user,
        "is_featured": item.is_featured, "show_on_home": item.show_on_home, "thumbnail_type": item.thumbnail_type, "thumbnail_url": thumbnail_url,
        "service_status": item.service_status, "service_audience": item.service_audience, "service_url": item.service_url,
        "author_name": item.author.display_name, "created_at": item.created_at, "updated_at": item.updated_at,
        "published_at": item.published_at, "attachments": [attachment_payload(file) for file in item.attachments],
    }


def post_summary_payload(item: Post, owned_by_current_user: bool = False) -> dict:
    thumbnail_url = None
    if item.thumbnail_type == "webdav" and item.thumbnail_path:
        thumbnail_url = f"/api/posts/{quote(item.slug)}/thumbnail"
    return {
        "id": str(item.id), "slug": item.slug, "category": item.category, "title": item.title, "summary": item.summary,
        "content_format": item.content_format, "content_density": item.content_density or "normal", "topics": item.topics or [], "key_points": item.key_points or [], "status": item.status, "owned_by_current_user": owned_by_current_user,
        "is_featured": item.is_featured, "show_on_home": item.show_on_home, "thumbnail_type": item.thumbnail_type, "thumbnail_url": thumbnail_url,
        "service_status": item.service_status, "service_audience": item.service_audience, "service_url": item.service_url,
        "author_name": item.author.display_name, "created_at": item.created_at, "updated_at": item.updated_at, "published_at": item.published_at,
    }


def add_audit(db: Session, user_id: int | None, action: str, target_type: str, target_id: str, detail: dict | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, target_type=target_type, target_id=target_id, detail=detail or {}))


def sanitize_html(value: str) -> str:
    return bleach.clean(value, tags={"p", "br", "h2", "h3", "strong", "em", "u", "s", "ul", "ol", "li", "blockquote", "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td", "pre", "code", "hr"}, attributes={"a": ["href"], "img": ["src", "alt", "width", "height"], "figure": ["class"]}, protocols={"http", "https"}, strip=True)


def apply_post_input(item: Post, data: PostInput) -> None:
    was_published = item.status == "published"
    if data.slug is not None:
        item.slug = data.slug
    item.category = data.category
    item.title = data.title.strip()
    item.summary = data.summary.strip()
    item.body_markdown = sanitize_html(data.body_markdown.strip()) if data.content_format == "html" else data.body_markdown.strip()
    item.content_format = data.content_format
    item.content_density = data.content_density
    item.topics = data.topics
    item.key_points = [point.strip()[:160] for point in data.key_points if point.strip()][:3]
    item.status = "published"
    item.is_featured = data.is_featured and data.show_on_home
    item.show_on_home = data.show_on_home
    if not was_published:
        item.published_at = utcnow()
    item.thumbnail_type = data.thumbnail_type
    item.service_status = data.service_status.strip() if data.service_status else None
    item.service_audience = data.service_audience.strip() if data.service_audience else None
    item.service_url = str(data.service_url) if data.service_url else None


def get_active_post(db: Session, post_id: uuid.UUID) -> Post:
    item = db.scalar(select(Post).options(selectinload(Post.attachments), selectinload(Post.author)).where(Post.id == post_id, Post.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없습니다.")
    return item


def ensure_featured_unique(db: Session, item: Post) -> None:
    if not item.show_on_home:
        item.is_featured = False
    elif item.is_featured:
        db.execute(update(Post).where(Post.id != item.id, Post.deleted_at.is_(None)).values(is_featured=False))


def file_size(file: UploadFile) -> int:
    position = file.file.tell()
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(position)
    return size


def assert_upload_size(file: UploadFile, maximum_mb: int) -> int:
    size = file_size(file)
    if size <= 0:
        raise HTTPException(status_code=400, detail=f"{file.filename or '파일'}이 비어 있습니다.")
    if size > maximum_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"{file.filename or '파일'}은 {maximum_mb}MB를 초과할 수 없습니다.")
    return size


def file_response(storage_path: str, content_type: str, filename: str | None = None) -> StreamingResponse:
    headers = {"Cache-Control": "private, max-age=300"}
    if filename:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(safe_filename(filename))}"
    return StreamingResponse(storage.stream(storage_path), media_type=content_type, headers=headers)


def kakao_state_signature(value: str) -> str:
    secret = settings.kakao_state_secret or settings.kakao_client_secret or settings.kakao_rest_api_key
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def kakao_error(path: str, reason: str) -> Response:
    response = RedirectResponse(f"{path}?kakao_error={quote(reason)}", status_code=303)
    response.delete_cookie("kakao_oauth_state", path="/api/auth/kakao")
    return response


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/public-config")
def public_config() -> dict:
    return {"kakao_javascript_key": settings.kakao_javascript_key}


@app.get("/api/auth/kakao/login")
def kakao_login(request: Request, db: Session = Depends(get_db)) -> Response:
    if not settings.kakao_login_enabled or not settings.kakao_rest_api_key:
        return kakao_error("/admin/login", "kakao_unavailable")
    intent = request.query_params.get("intent", "login")
    user_id = None
    if intent == "link":
        try:
            user_id = get_current_session(request, Response(), db).user_id
        except HTTPException:
            return kakao_error("/admin/login", "login_required")
    elif intent != "login":
        return kakao_error("/admin/login", "invalid_request")
    requested_prompt = request.query_params.get("prompt")
    prompt = requested_prompt if requested_prompt in {"select_account", "login"} else "select_account"
    state_value = f"{secrets.token_urlsafe(32)}.{intent}.{user_id or 0}.{prompt}"
    state = f"{state_value}.{kakao_state_signature(state_value)}"
    params = "&".join((f"client_id={quote(settings.kakao_rest_api_key)}", "redirect_uri=" + quote(settings.kakao_callback_uri, safe=""), "response_type=code", f"state={quote(state, safe='')}", f"prompt={prompt}"))
    db.add(OAuthState(state_hash=hashlib.sha256(state.encode()).hexdigest(), intent=intent, user_id=user_id, expires_at=utcnow() + timedelta(minutes=10)))
    db.commit()
    response = RedirectResponse(f"https://kauth.kakao.com/oauth/authorize?{params}", status_code=307)
    response.set_cookie("kakao_oauth_state", state, max_age=600, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/api/auth/kakao")
    return response


@app.get("/api/auth/kakao/callback")
def kakao_callback(request: Request, db: Session = Depends(get_db)) -> Response:
    if not settings.kakao_login_enabled:
        return kakao_error("/admin/login", "kakao_unavailable")
    if request.query_params.get("error") == "access_denied":
        return kakao_error("/admin/login", "cancelled")
    state = request.query_params.get("state", "")
    code = request.query_params.get("code", "")
    raw_state = request.cookies.get("kakao_oauth_state", "")
    if not state or not code or not raw_state or not hmac.compare_digest(state, raw_state):
        return kakao_error("/admin/login", "invalid_state")
    try:
        state_value, signature = state.rsplit(".", 1)
    except ValueError:
        return kakao_error("/admin/login", "invalid_state")
    if not hmac.compare_digest(signature, kakao_state_signature(state_value)):
        return kakao_error("/admin/login", "invalid_state")
    oauth_state = db.scalar(select(OAuthState).where(OAuthState.state_hash == hashlib.sha256(state.encode()).hexdigest(), OAuthState.used_at.is_(None), OAuthState.expires_at > utcnow()))
    if not oauth_state:
        return kakao_error("/admin/login", "invalid_state")
    oauth_state.used_at = utcnow()
    db.commit()
    intent, user_id_text = oauth_state.intent, str(oauth_state.user_id or 0)
    try:
        token_data = {"grant_type": "authorization_code", "client_id": settings.kakao_rest_api_key, "redirect_uri": settings.kakao_callback_uri, "code": code}
        if settings.kakao_client_secret:
            token_data["client_secret"] = settings.kakao_client_secret
        with httpx.Client(timeout=10.0) as client:
            token_response = client.post("https://kauth.kakao.com/oauth/token", data=token_data)
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not access_token:
                raise RuntimeError("missing token")
            user_response = client.get("https://kapi.kakao.com/v2/user/me", headers={"Authorization": f"Bearer {access_token}"})
            user_response.raise_for_status()
            kakao_user = user_response.json()
    except Exception as exc:
        import logging
        logging.getLogger("uvicorn.error").exception("Kakao token exchange or user fetch failed: %s", exc)
        return kakao_error("/admin/login", "kakao_failed")
    subject = str(kakao_user.get("id", ""))
    if not subject:
        return kakao_error("/admin/login", "kakao_failed")
    properties = kakao_user.get("properties") or {}
    kakao_nickname = properties.get("nickname") if isinstance(properties.get("nickname"), str) else None
    profile_image = properties.get("profile_image") if isinstance(properties.get("profile_image"), str) else None
    kakao_account = kakao_user.get("kakao_account") or {}
    kakao_email = kakao_account.get("email") if isinstance(kakao_account.get("email"), str) else None
    admin_emails = {item.strip().lower() for item in settings.kakao_admin_emails.split(",") if item.strip()}
    is_admin_email = bool(kakao_email and kakao_email.lower() in admin_emails)
    identity = db.scalar(select(AuthIdentity).where(AuthIdentity.provider == "kakao", AuthIdentity.provider_subject == subject))
    if intent == "link":
        try:
            current = get_current_session(request, Response(), db)
        except HTTPException:
            return kakao_error("/admin/login", "login_required")
        if current.user_id != oauth_state.user_id:
            return kakao_error("/admin/login", "invalid_state")
        if identity and identity.user_id != current.user_id:
            return kakao_error("/admin", "already_linked")
        if not identity:
            identity = AuthIdentity(user_id=current.user_id, provider="kakao", provider_subject=subject, provider_nickname=kakao_nickname, profile_image_url=profile_image)
            db.add(identity)
        else:
            identity.provider_nickname = kakao_nickname
            identity.profile_image_url = profile_image
        identity.updated_at = utcnow()
        db.commit()
        return kakao_error("/admin", "linked")
    if not identity:
        if intent != "login":
            return kakao_error("/admin/login", "not_linked")
        user = AdminUser(username=f"kakao_{subject}", display_name="Kakao 사용자", display_name_confirmed=False, password_hash=hash_password(secrets.token_urlsafe(32)), role="admin" if is_admin_email else "user")
        db.add(user); db.flush()
        identity = AuthIdentity(user_id=user.id, provider="kakao", provider_subject=subject, provider_nickname=kakao_nickname, profile_image_url=profile_image, last_login_at=utcnow())
        db.add(identity); db.commit()
    else:
        identity.provider_nickname = kakao_nickname
        identity.profile_image_url = profile_image
        identity.last_login_at = utcnow()
        identity.updated_at = utcnow()
        if is_admin_email:
            account = db.get(AdminUser, identity.user_id)
            if account and account.role != "admin":
                account.role = "admin"
        db.commit()
    session, raw_token = create_session(db, identity.user_id, persistent=True)
    account = db.get(AdminUser, identity.user_id)
    requires_name = account is not None and not account.display_name_confirmed
    destination = "/admin" if account and account.role == "admin" else "/"
    if requires_name:
        destination = f"/account/setup-name?suggested={quote(kakao_nickname or '', safe='')}"
    response = RedirectResponse(destination, status_code=303)
    response.delete_cookie("kakao_oauth_state", path="/api/auth/kakao")
    response.set_cookie(settings.session_cookie_name, raw_token, max_age=settings.persistent_session_days * 86400, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
    return response


@app.post("/api/auth/kakao/link")
def kakao_link(session: AdminSession = Depends(require_csrf)) -> dict:
    return {"detail": "GET /api/auth/kakao/login?intent=link으로 연결을 시작하세요."}


@app.delete("/api/auth/kakao/link", status_code=204)
def kakao_unlink(session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> None:
    identity = db.scalar(select(AuthIdentity).where(AuthIdentity.user_id == session.user_id, AuthIdentity.provider == "kakao"))
    if identity:
        db.delete(identity)
        db.commit()


@app.post("/api/auth/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)) -> Response:
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    client_key = forwarded or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    attempts = login_attempts[client_key]
    while attempts and attempts[0] < now - 300:
        attempts.popleft()
    if len(attempts) >= 8:
        raise HTTPException(status_code=429, detail="로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.")

    user = db.scalar(select(AdminUser).where(AdminUser.username == data.username.strip(), AdminUser.is_active.is_(True)))
    valid = verify_password(data.password, user.password_hash if user else dummy_password_hash)
    if not user or not valid:
        attempts.append(now)
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    attempts.clear()
    session, raw_token = create_session(db, user.id)
    add_audit(db, user.id, "auth.login", "admin_user", str(user.id), {"ip": client_key})
    db.commit()
    response = JSONResponse(auth_payload(session, db))
    response.set_cookie(
        key=settings.session_cookie_name, value=raw_token, max_age=settings.session_days * 86400,
        httponly=True, secure=settings.cookie_secure, samesite="lax", path="/",
    )
    return response


@app.get("/api/auth/me")
def me(session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> dict:
    return auth_payload(session, db)


@app.patch("/api/auth/display-name")
def update_display_name(data: DisplayNameInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    session.user.display_name = data.display_name
    session.user.display_name_confirmed = True
    session.user.display_name_updated_at = utcnow()
    db.commit()
    return auth_payload(session, db)


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    db.delete(session)
    db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")


@app.delete("/api/admin/users/{user_id}/sessions", status_code=204)
def revoke_user_sessions(user_id: int, _: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> None:
    for session in db.scalars(select(AdminSession).where(AdminSession.user_id == user_id)).all():
        db.delete(session)
    db.commit()


@app.get("/api/posts")
def public_posts(
    category: str | None = Query(default=None), q: str | None = Query(default=None, max_length=100),
    home: bool = Query(default=False), db: Session = Depends(get_db),
) -> dict:
    statement = select(Post).options(selectinload(Post.author)).where(Post.status == "published", Post.deleted_at.is_(None))
    if home:
        statement = statement.where(Post.show_on_home.is_(True))
    if category:
        if category not in {"news", "learn", "use", "together"}:
            raise HTTPException(status_code=400, detail="지원하지 않는 카테고리입니다.")
        statement = statement.where(Post.category == category)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        statement = statement.where(or_(Post.title.ilike(pattern), Post.summary.ilike(pattern), Post.body_markdown.ilike(pattern)))
    statement = statement.order_by(Post.published_at.desc().nullslast(), Post.created_at.desc()).limit(200)
    return {"items": [post_summary_payload(item) for item in db.scalars(statement).all()]}


@app.get("/api/posts/{slug}")
def public_post(slug: str, session: AdminSession | None = Depends(get_optional_session), db: Session = Depends(get_db)) -> dict:
    item = db.scalar(select(Post).options(selectinload(Post.attachments), selectinload(Post.author)).where(Post.slug == slug, Post.status == "published", Post.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없습니다.")
    return post_payload(item, owned_by_current_user=bool(session and session.user_id == item.author_id))


def get_public_post_by_id(post_id: uuid.UUID, db: Session) -> Post:
    item = db.scalar(select(Post).where(Post.id == post_id, Post.status == "published", Post.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없습니다.")
    return item


@app.get("/api/posts/{slug}/community")
def community_status(slug: str, session: AdminSession | None = Depends(get_optional_session), db: Session = Depends(get_db)) -> dict:
    post = db.scalar(select(Post).where(Post.slug == slug, Post.status == "published", Post.deleted_at.is_(None)))
    if not post:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없습니다.")
    return {"likes": db.scalar(select(func.count()).select_from(PostLike).where(PostLike.post_id == post.id)) or 0, "liked": bool(session and db.get(PostLike, (post.id, session.user_id))), "bookmarked": bool(session and db.get(Bookmark, (post.id, session.user_id)))}


@app.post("/api/posts/{post_id}/like")
def like_post(post_id: uuid.UUID, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    get_public_post_by_id(post_id, db)
    if not db.get(PostLike, (post_id, session.user_id)):
        db.add(PostLike(post_id=post_id, user_id=session.user_id)); db.commit()
    return {"liked": True}


@app.delete("/api/posts/{post_id}/like", status_code=204)
def unlike_post(post_id: uuid.UUID, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> None:
    get_public_post_by_id(post_id, db)
    item = db.get(PostLike, (post_id, session.user_id))
    if item: db.delete(item); db.commit()


@app.post("/api/posts/{post_id}/bookmark")
def bookmark_post(post_id: uuid.UUID, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    get_public_post_by_id(post_id, db)
    if not db.get(Bookmark, (post_id, session.user_id)):
        db.add(Bookmark(post_id=post_id, user_id=session.user_id)); db.commit()
    return {"bookmarked": True}


@app.delete("/api/posts/{post_id}/bookmark", status_code=204)
def unbookmark_post(post_id: uuid.UUID, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> None:
    get_public_post_by_id(post_id, db)
    item = db.get(Bookmark, (post_id, session.user_id))
    if item: db.delete(item); db.commit()


@app.get("/api/posts/{post_id}/comments")
def list_comments(post_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    get_public_post_by_id(post_id, db)
    items = db.scalars(select(Comment).options(selectinload(Comment.user)).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())).all()
    return {"items": [{"id": str(item.id), "body": item.body, "author_name": item.user.display_name, "created_at": item.created_at} for item in items]}


@app.post("/api/posts/{post_id}/comments", status_code=201)
def create_comment(post_id: uuid.UUID, data: CommentInput, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    get_public_post_by_id(post_id, db)
    item = Comment(post_id=post_id, user_id=session.user_id, body=data.body.strip())
    db.add(item); db.commit(); db.refresh(item)
    return {"id": str(item.id), "body": item.body, "author_name": session.user.display_name, "created_at": item.created_at}


@app.post("/api/inline-images")
def upload_new_post_inline_image(file: UploadFile = File(...), session: AdminSession = Depends(require_confirmed_csrf)) -> dict:
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="본문 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.")
    assert_upload_size(file, settings.max_thumbnail_mb)
    filename = f"{uuid.uuid4().hex}-{safe_filename(file.filename or 'inline-image')}"
    storage.upload(["inline-images", str(session.user_id)], filename, file.file)
    return {"url": f"/api/inline-images/{session.user_id}/{quote(filename)}"}


@app.get("/api/inline-images/{user_id}/{filename}")
def public_new_post_inline_image(user_id: int, filename: str) -> StreamingResponse:
    safe_name = safe_filename(filename)
    content_type = "image/webp" if safe_name.lower().endswith(".webp") else "image/png" if safe_name.lower().endswith(".png") else "image/jpeg"
    return file_response(f"{settings.webdav_root.strip('/')}/inline-images/{user_id}/{safe_name}", content_type)


@app.post("/api/posts/{post_id}/inline-images")
def upload_inline_image(post_id: uuid.UUID, file: UploadFile = File(...), session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    if item.author_id != session.user_id and session.user.role != "admin":
        raise HTTPException(status_code=403, detail="이 글의 본문 이미지를 업로드할 권한이 없습니다.")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="본문 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.")
    assert_upload_size(file, settings.max_thumbnail_mb)
    filename = f"{uuid.uuid4().hex}-{safe_filename(file.filename or 'inline-image')}"
    path = storage.upload(["posts", str(item.id), "inline-images"], filename, file.file)
    db.commit()
    return {"url": f"/api/posts/{quote(item.slug)}/inline-images/{quote(filename)}"}


@app.get("/api/posts/{slug}/inline-images/{filename}")
def public_inline_image(slug: str, filename: str, db: Session = Depends(get_db)) -> StreamingResponse:
    item = db.scalar(select(Post).where(Post.slug == slug, Post.status == "published", Post.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="글을 찾을 수 없습니다.")
    safe_name = safe_filename(filename)
    content_type = "image/webp" if safe_name.lower().endswith(".webp") else "image/png" if safe_name.lower().endswith(".png") else "image/jpeg"
    return file_response(f"{settings.webdav_root.strip('/')}/posts/{item.id}/inline-images/{safe_name}", content_type)


@app.get("/api/posts/{slug}/thumbnail")
def public_thumbnail(slug: str, db: Session = Depends(get_db)) -> StreamingResponse:
    item = db.scalar(select(Post).where(Post.slug == slug, Post.status == "published", Post.deleted_at.is_(None)))
    if not item or not item.thumbnail_path:
        raise HTTPException(status_code=404, detail="대표 이미지를 찾을 수 없습니다.")
    return file_response(item.thumbnail_path, item.thumbnail_content_type or "image/jpeg")


@app.get("/api/attachments/{attachment_id}/download")
def public_attachment(attachment_id: uuid.UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    item = db.scalar(select(Attachment).join(Post).where(Attachment.id == attachment_id, Post.status == "published", Post.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")
    return file_response(item.storage_path, item.content_type, item.filename)


@app.get("/api/admin/posts")
def admin_posts(_: AdminSession = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    statement = select(Post).options(selectinload(Post.attachments), selectinload(Post.author)).where(Post.deleted_at.is_(None)).order_by(Post.updated_at.desc()).limit(500)
    return {"items": [post_payload(item, admin=True) for item in db.scalars(statement).all()]}


def generated_slug() -> str:
    return f"post-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}"


@app.post("/api/posts", status_code=201)
def create_user_post(data: PostInput, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    item = Post(author_id=session.user_id, slug=data.slug or generated_slug(), category=data.category, title=data.title, summary=data.summary, body_markdown=data.body_markdown)
    apply_post_input(item, data)
    item.is_featured = False
    db.add(item)
    try:
        db.flush()
        add_audit(db, session.user_id, "post.create.user", "post", str(item.id))
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="글을 저장하지 못했습니다.") from error
    return post_payload(get_active_post(db, item.id))


@app.get("/api/posts/{post_id}/edit")
def get_user_post_for_edit(post_id: uuid.UUID, session: AdminSession = Depends(require_confirmed), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    if item.author_id != session.user_id:
        raise HTTPException(status_code=403, detail="자신이 작성한 글만 수정할 수 있습니다.")
    return post_payload(item)


@app.post("/api/posts/{post_id}/thumbnail")
def upload_user_thumbnail(post_id: uuid.UUID, file: UploadFile = File(...), session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    if item.author_id != session.user_id and session.user.role != "admin":
        raise HTTPException(status_code=403, detail="이 글의 대표 이미지를 업로드할 권한이 없습니다.")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="대표 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.")
    assert_upload_size(file, settings.max_thumbnail_mb)
    filename = f"{secrets.token_hex(8)}-{safe_filename(file.filename or 'thumbnail')}"
    old_path = item.thumbnail_path
    path = storage.upload(["posts", str(item.id), "thumbnail"], filename, file.file)
    item.thumbnail_path = path
    item.thumbnail_filename = safe_filename(file.filename or "thumbnail")
    item.thumbnail_content_type = file.content_type
    item.thumbnail_type = "webdav"
    add_audit(db, session.user_id, "thumbnail.upload", "post", str(item.id), {"filename": item.thumbnail_filename})
    db.commit()
    if old_path and old_path != path:
        try:
            storage.delete(old_path)
        except HTTPException:
            pass
    return post_payload(get_active_post(db, item.id))


@app.put("/api/posts/{post_id}")
def update_user_post(post_id: uuid.UUID, data: PostInput, session: AdminSession = Depends(require_confirmed_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    if item.author_id != session.user_id:
        raise HTTPException(status_code=403, detail="자신이 작성한 글만 수정할 수 있습니다.")
    apply_post_input(item, data)
    item.is_featured = False
    item.show_on_home = True
    try:
        add_audit(db, session.user_id, "post.update.user", "post", str(item.id))
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="글을 수정하지 못했습니다.") from error
    return post_payload(get_active_post(db, item.id))


@app.post("/api/admin/posts", status_code=201)
def create_post(data: PostInput, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> dict:
    slug = data.slug or generated_slug()
    item = Post(author_id=session.user_id, slug=slug, category=data.category, title=data.title, summary=data.summary, body_markdown=data.body_markdown)
    apply_post_input(item, data)
    db.add(item)
    try:
        db.flush()
        ensure_featured_unique(db, item)
        add_audit(db, session.user_id, "post.create", "post", str(item.id), {"status": item.status})
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 글 주소가 이미 사용 중입니다.") from error
    return post_payload(get_active_post(db, item.id), admin=True)


@app.put("/api/admin/posts/{post_id}")
def update_post(post_id: uuid.UUID, data: PostInput, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    apply_post_input(item, data)
    try:
        ensure_featured_unique(db, item)
        add_audit(db, session.user_id, "post.update", "post", str(item.id), {"status": item.status})
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="같은 글 주소가 이미 사용 중입니다.") from error
    return post_payload(get_active_post(db, item.id), admin=True)


@app.delete("/api/admin/posts/{post_id}", status_code=204)
def delete_post(post_id: uuid.UUID, _: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> None:
    item = get_active_post(db, post_id)
    item.deleted_at = utcnow()
    item.is_featured = False
    add_audit(db, _.user_id, "post.soft_delete", "post", str(item.id))
    db.commit()


@app.put("/api/admin/posts/{post_id}/featured")
def set_featured(post_id: uuid.UUID, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    item.show_on_home = True
    item.is_featured = True
    ensure_featured_unique(db, item)
    add_audit(db, session.user_id, "post.featured", "post", str(item.id))
    db.commit()
    return post_payload(get_active_post(db, item.id), admin=True)


@app.delete("/api/admin/posts/{post_id}/featured", status_code=204)
def unset_featured(post_id: uuid.UUID, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> None:
    item = get_active_post(db, post_id)
    item.is_featured = False
    add_audit(db, session.user_id, "post.unfeatured", "post", str(item.id))
    db.commit()


@app.get("/api/admin/posts/{post_id}/thumbnail")
def admin_thumbnail(post_id: uuid.UUID, _: AdminSession = Depends(require_admin), db: Session = Depends(get_db)) -> StreamingResponse:
    item = get_active_post(db, post_id)
    if not item.thumbnail_path:
        raise HTTPException(status_code=404, detail="대표 이미지를 찾을 수 없습니다.")
    return file_response(item.thumbnail_path, item.thumbnail_content_type or "image/jpeg")


@app.post("/api/admin/posts/{post_id}/thumbnail")
def upload_thumbnail(post_id: uuid.UUID, file: UploadFile = File(...), session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> dict:
    item = get_active_post(db, post_id)
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="대표 이미지는 JPG, PNG, WebP만 사용할 수 있습니다.")
    assert_upload_size(file, settings.max_thumbnail_mb)
    filename = f"{secrets.token_hex(8)}-{safe_filename(file.filename or 'thumbnail')}"
    old_path = item.thumbnail_path
    path = storage.upload(["posts", str(item.id), "thumbnail"], filename, file.file)
    item.thumbnail_path = path
    item.thumbnail_filename = safe_filename(file.filename or "thumbnail")
    item.thumbnail_content_type = file.content_type
    item.thumbnail_type = "webdav"
    add_audit(db, session.user_id, "thumbnail.upload", "post", str(item.id), {"filename": item.thumbnail_filename})
    db.commit()
    if old_path and old_path != path:
        try:
            storage.delete(old_path)
        except HTTPException:
            pass
    return post_payload(get_active_post(db, item.id), admin=True)


@app.post("/api/admin/posts/{post_id}/attachments", status_code=201)
def upload_attachments(post_id: uuid.UUID, files: list[UploadFile] = File(...), session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> list[dict]:
    item = get_active_post(db, post_id)
    if not files or len(files) > 10:
        raise HTTPException(status_code=400, detail="첨부파일은 한 번에 1~10개를 선택해 주세요.")
    sizes = [assert_upload_size(file, settings.max_attachment_mb) for file in files]
    created: list[Attachment] = []
    uploaded_paths: list[str] = []
    try:
        for file, size in zip(files, sizes, strict=True):
            original = safe_filename(file.filename or "file")
            stored_name = f"{secrets.token_hex(8)}-{original}"
            path = storage.upload(["posts", str(item.id), "attachments"], stored_name, file.file)
            uploaded_paths.append(path)
            attachment = Attachment(post_id=item.id, filename=original, storage_path=path, content_type=file.content_type or "application/octet-stream", size=size)
            db.add(attachment)
            created.append(attachment)
        db.flush()
        add_audit(db, session.user_id, "attachment.upload", "post", str(item.id), {"files": [file.filename for file in created]})
        db.commit()
    except Exception:
        db.rollback()
        for path in uploaded_paths:
            try:
                storage.delete(path)
            except Exception:
                pass
        raise
    return [attachment_payload(file) for file in created]


@app.delete("/api/admin/attachments/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: uuid.UUID, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> None:
    item = db.get(Attachment, attachment_id)
    if not item:
        raise HTTPException(status_code=404, detail="첨부파일을 찾을 수 없습니다.")
    storage.delete(item.storage_path)
    add_audit(db, session.user_id, "attachment.delete", "attachment", str(item.id), {"filename": item.filename})
    db.delete(item)
    db.commit()

