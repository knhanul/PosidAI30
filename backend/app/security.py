import base64
import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import AdminSession, utcnow


SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32)
    return "$".join(("scrypt", str(SCRYPT_N), str(SCRYPT_R), str(SCRYPT_P), base64.urlsafe_b64encode(salt).decode(), base64.urlsafe_b64encode(digest).decode()))


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt64, digest64 = encoded.split("$")
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt64.encode())
        expected = base64.urlsafe_b64decode(digest64.encode())
        actual = hashlib.scrypt(password.encode(), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user_id: int, persistent: bool = False) -> tuple[AdminSession, str]:
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    days = settings.persistent_session_days if persistent else settings.session_days
    session = AdminSession(
        token_hash=token_digest(raw_token),
        csrf_token=secrets.token_urlsafe(36),
        user_id=user_id,
        expires_at=utcnow() + timedelta(days=days),
        is_persistent=persistent,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, raw_token


def get_current_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AdminSession:
    settings = get_settings()
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")
    now = utcnow()
    session = db.scalar(select(AdminSession).where(AdminSession.token_hash == token_digest(raw_token), AdminSession.expires_at > now))
    if not session or not session.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인 세션이 만료되었습니다.")
    if session.is_persistent and session.expires_at - now <= timedelta(days=settings.session_refresh_threshold_days):
        session.expires_at = now + timedelta(days=settings.persistent_session_days)
        session.last_seen_at = now
        db.commit()
        response.set_cookie(
            key=settings.session_cookie_name,
            value=raw_token,
            max_age=settings.persistent_session_days * 86400,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )
    return session


def require_admin(session: AdminSession = Depends(get_current_session)) -> AdminSession:
    if session.user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 권한이 필요합니다.")
    return session


def require_confirmed(session: AdminSession = Depends(get_current_session)) -> AdminSession:
    if not session.user.display_name_confirmed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="닉네임을 먼저 설정해 주세요.")
    return session


def require_csrf(request: Request, session: AdminSession = Depends(get_current_session)) -> AdminSession:
    supplied = request.headers.get("X-CSRF-Token", "")
    if not supplied or not hmac.compare_digest(supplied, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="요청 검증값이 올바르지 않습니다.")
    return session


def require_confirmed_csrf(request: Request, session: AdminSession = Depends(require_confirmed)) -> AdminSession:
    supplied = request.headers.get("X-CSRF-Token", "")
    if not supplied or not hmac.compare_digest(supplied, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="요청 검증값이 올바르지 않습니다.")
    return session


def require_admin_csrf(request: Request, session: AdminSession = Depends(require_admin)) -> AdminSession:
    supplied = request.headers.get("X-CSRF-Token", "")
    if not supplied or not hmac.compare_digest(supplied, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="요청 검증값이 올바르지 않습니다.")
    return session

