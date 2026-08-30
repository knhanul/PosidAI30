import io
import math
import posixpath
import uuid
from datetime import date
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import asc, cast, desc, func, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from .ai_projects_service import ensure_latest, event, file_payload, get_project, project_payload, project_root, release_payload, render_markdown, replace_path_prefix, require_owner, safe_subpath, set_latest, trash_move, unique_slug, upload_file
from .database import get_db
from .models import AIProject, AIProjectFile, AIProjectLink, AIRelease, AdminSession, utcnow
from .security import get_current_session, require_admin, require_admin_csrf, require_confirmed_csrf as require_csrf
from .webdav import StorageError, safe_filename, storage

router = APIRouter(prefix="/api/ai-projects", tags=["ai-projects"])


class LinkInput(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    url: HttpUrl
    link_type: str = Field(default="other", max_length=40)
    position: int = 0


class ProjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    summary: str = Field(default="", max_length=500)
    description: str = ""
    website_url: HttpUrl | None = None
    project_type: str = Field(min_length=1, max_length=40)
    visibility: Literal["public", "private", "unlisted"] = "public"
    categories: list[str] = []
    platforms: list[str] = []
    links: list[LinkInput] = []
    readme_markdown: str | None = None
    readme_html: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = None
    website_url: HttpUrl | None = None
    project_type: str | None = Field(default=None, min_length=1, max_length=40)
    visibility: Literal["public", "private", "unlisted"] | None = None
    categories: list[str] | None = None
    platforms: list[str] | None = None
    links: list[LinkInput] | None = None
    readme_markdown: str | None = None
    readme_html: str | None = None


class ReadmeInput(BaseModel):
    markdown: str


class FolderInput(BaseModel):
    path: str


class MoveInput(BaseModel):
    source: str
    destination: str


class ResourceUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=80)
    folder: str | None = None
    filename: str | None = Field(default=None, min_length=1, max_length=255)


def can_view(project: AIProject, session: AdminSession | None) -> None:
    if project.visibility == "public":
        return
    if session is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    if project.visibility == "private" and project.owner_id != session.user_id and session.user.role != "admin":
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")


def attachment_response(item: AIProjectFile, inline_icon: bool = False) -> StreamingResponse:
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300"}
    if not inline_icon:
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(safe_filename(item.original_filename))}"
    return StreamingResponse(storage.stream(item.storage_path), media_type=item.content_type if inline_icon else "application/octet-stream", headers=headers)


def apply_project_input(project: AIProject, data: ProjectInput | ProjectUpdate) -> None:
    values = data.model_dump(exclude_unset=True, exclude={"links", "readme_markdown", "readme_html"})
    for key, value in values.items():
        if key == "website_url":
            value = str(value) if value else None
        elif isinstance(value, str):
            value = value.strip()
        elif key in {"categories", "platforms"} and value is not None:
            value = list(dict.fromkeys(value))[:20]
        setattr(project, key, value)


def replace_project_links(db: Session, project: AIProject, links: list[LinkInput]) -> None:
    for item in list(project.links):
        db.delete(item)
    for link in links[:30]:
        db.add(AIProjectLink(project_id=project.id, label=link.label.strip(), url=str(link.url), link_type=link.link_type, position=link.position))


def store_readme(db: Session, project: AIProject, markdown: str, actor_id: int) -> None:
    upload = UploadFile(filename="README.md", file=io.BytesIO(markdown.encode("utf-8")), headers={"content-type": "text/markdown; charset=utf-8"})
    old = db.get(AIProjectFile, project.readme_file_id) if project.readme_file_id else None
    item = upload_file(db, project, actor_id, upload, "readme", f"{project_root(project.id)}/metadata/readme")
    project.readme_file_id, project.readme_markdown = item.id, markdown
    if old and old.deleted_at is None:
        trash_move(db, old, old.storage_path, actor_id, "readme.replace")


@router.get("")
def list_projects(q: str = "", type_filter: str | None = Query(None, alias="type"), project_type: str | None = None, platform: str | None = None, sort: Literal["latest", "newest", "updated", "name", "downloads", "views"] = "latest", page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> dict:
    access_filter = AIProject.visibility == "public"
    if session:
        access_filter = or_(AIProject.visibility.in_(["public", "unlisted"]), AIProject.owner_id == session.user_id) if session.user.role != "admin" else AIProject.id.is_not(None)
    base_filters = [AIProject.deleted_at.is_(None), access_filter]
    visible_projects = list(db.scalars(select(AIProject).where(*base_filters)).all())
    filters = list(base_filters)
    if q.strip():
        term = f"%{q.strip()}%"
        filters.append(or_(AIProject.name.ilike(term), AIProject.summary.ilike(term), AIProject.description.ilike(term)))
    selected_type = type_filter or project_type
    if selected_type:
        filters.append(AIProject.project_type == selected_type)
    if platform:
        filters.append(func.jsonb_exists(cast(AIProject.platforms, JSONB), platform))
    ordering = {"latest": desc(AIProject.updated_at), "newest": desc(AIProject.created_at), "updated": desc(AIProject.updated_at), "name": asc(AIProject.name), "downloads": desc(AIProject.download_count), "views": desc(AIProject.view_count)}[sort]
    total = db.scalar(select(func.count()).select_from(AIProject).where(*filters)) or 0
    items = db.scalars(select(AIProject).where(*filters).order_by(ordering).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [project_payload(item, session) for item in items], "page": page, "page_size": page_size, "total": total, "total_pages": math.ceil(total / page_size), "types": sorted({item.project_type for item in visible_projects}), "platforms": sorted({value for item in visible_projects for value in (item.platforms or [])}), "can_create": bool(session and session.user.display_name_confirmed)}


@router.post("", status_code=201)
def create_project(data: ProjectInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = AIProject(owner_id=session.user_id, slug=unique_slug(db, data.name), name=data.name.strip(), summary="", description="", project_type=data.project_type.strip(), visibility=data.visibility, categories=[], platforms=[])
    apply_project_input(project, data)
    db.add(project)
    db.flush()
    try:
        storage.ensure_collection(project_root(project.id).split("/"))
        replace_project_links(db, project, data.links)
        markdown = data.readme_markdown if data.readme_markdown is not None else (data.readme_html or "")
        if markdown:
            store_readme(db, project, markdown, session.user_id)
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete(project_root(project.id))
        except Exception:
            pass
        raise
    return project_payload(get_project(db, project.slug), session, detail=True)


@router.get("/{identifier}")
def project_detail(identifier: str, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    can_view(project, session)
    db.execute(update(AIProject).where(AIProject.id == project.id).values(view_count=AIProject.view_count + 1))
    db.commit()
    db.refresh(project)
    return project_payload(project, session, detail=True)


@router.put("/{identifier}")
@router.patch("/{identifier}")
def update_project(identifier: str, data: ProjectUpdate, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    apply_project_input(project, data)
    if data.links is not None:
        replace_project_links(db, project, data.links)
    markdown = data.readme_markdown
    if markdown is None and data.readme_html is not None and data.readme_html != render_markdown(project.readme_markdown):
        markdown = data.readme_html
    if markdown is not None:
        store_readme(db, project, markdown, session.user_id)
    db.commit()
    return project_payload(get_project(db, project.slug), session, detail=True)


@router.post("/{identifier}/icon")
def upload_icon(identifier: str, file: UploadFile = File(...), session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=415, detail="지원하지 않는 아이콘 형식입니다.")
    old = db.get(AIProjectFile, project.icon_file_id) if project.icon_file_id else None
    item = upload_file(db, project, session.user_id, file, "icon", f"{project_root(project.id)}/metadata/icon")
    project.icon_file_id = item.id
    if old and old.deleted_at is None:
        trash_move(db, old, old.storage_path, session.user_id, "icon.replace")
    db.commit()
    return project_payload(get_project(db, project.slug), session, detail=True)


@router.get("/{identifier}/icon")
def get_icon(identifier: str, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> StreamingResponse:
    project = get_project(db, identifier)
    can_view(project, session)
    item = db.get(AIProjectFile, project.icon_file_id) if project.icon_file_id else None
    if not item or item.deleted_at:
        raise HTTPException(status_code=404, detail="아이콘을 찾을 수 없습니다.")
    return attachment_response(item, inline_icon=True)


@router.put("/{identifier}/readme")
def update_readme(identifier: str, data: ReadmeInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    store_readme(db, project, data.markdown, session.user_id)
    db.commit()
    return project_payload(get_project(db, project.slug), session, detail=True)


@router.post("/{identifier}/readme")
def upload_readme(identifier: str, file: UploadFile = File(...), session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    content = file.file.read(2 * 1024 * 1024 + 1)
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="README는 2MB를 초과할 수 없습니다.")
    try:
        markdown = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="README는 UTF-8 텍스트여야 합니다.") from exc
    return update_readme(identifier, ReadmeInput(markdown=markdown), session, db)


@router.get("/{identifier}/readme/download")
def download_readme(identifier: str, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> StreamingResponse:
    project = get_project(db, identifier)
    can_view(project, session)
    item = db.get(AIProjectFile, project.readme_file_id) if project.readme_file_id else None
    if not item or item.deleted_at:
        raise HTTPException(status_code=404, detail="README를 찾을 수 없습니다.")
    return download_file(identifier, item.id, session, db)


@router.put("/{identifier}/links")
def replace_links(identifier: str, links: list[LinkInput], session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> list[dict]:
    project = get_project(db, identifier)
    require_owner(project, session)
    replace_project_links(db, project, links)
    db.commit()
    return project_payload(get_project(db, project.slug), session, detail=True)["links"]


@router.post("/{identifier}/links", status_code=201)
def create_link(identifier: str, data: LinkInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    item = AIProjectLink(project_id=project.id, label=data.label.strip(), url=str(data.url), link_type=data.link_type, position=data.position)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": str(item.id), **data.model_dump(mode="json")}


@router.delete("/{identifier}/links/{link_id}", status_code=204)
def delete_link(identifier: str, link_id: uuid.UUID, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    project = get_project(db, identifier)
    require_owner(project, session)
    item = db.scalar(select(AIProjectLink).where(AIProjectLink.id == link_id, AIProjectLink.project_id == project.id))
    if not item:
        raise HTTPException(status_code=404, detail="링크를 찾을 수 없습니다.")
    db.delete(item)
    db.commit()


@router.post("/{identifier}/releases", status_code=201)
def create_release(identifier: str, version: str = Form(...), title: str = Form(""), release_date: date | None = Form(None), notes: str = Form(""), is_latest: bool = Form(False), is_prerelease: bool = Form(False), primary_file_index: int = Form(0), files: list[UploadFile] = File(...), session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    version = version.strip()
    if not version or "/" in version or "\\" in version or len(version) > 100:
        raise HTTPException(status_code=400, detail="올바른 버전을 입력해 주세요.")
    if db.scalar(select(AIRelease.id).where(AIRelease.project_id == project.id, AIRelease.version == version)):
        raise HTTPException(status_code=409, detail="같은 버전의 릴리스가 이미 존재합니다.")
    if not files or len(files) > 20 or primary_file_index < 0 or primary_file_index >= len(files):
        raise HTTPException(status_code=400, detail="릴리스 파일과 기본 파일 선택을 확인해 주세요.")
    release = AIRelease(project_id=project.id, created_by_id=session.user_id, version=version, title=title.strip(), release_date=release_date, notes=notes.strip(), is_prerelease=is_prerelease)
    db.add(release)
    db.flush()
    uploaded = []
    try:
        for index, file in enumerate(files):
            uploaded.append(upload_file(db, project, session.user_id, file, "release", f"{project_root(project.id)}/releases/{version}", release.id, primary=index == primary_file_index))
        if is_latest:
            set_latest(db, project.id, release.id)
        else:
            ensure_latest(db, project.id)
        project.updated_at = utcnow()
        db.commit()
    except Exception:
        db.rollback()
        for item in uploaded:
            try:
                storage.delete(item.storage_path)
            except Exception:
                pass
        raise
    return release_payload(db.scalar(select(AIRelease).where(AIRelease.id == release.id)))


@router.post("/{identifier}/resources", status_code=201)
def upload_resources(identifier: str, category: str = Form("general"), title: str = Form(""), description: str = Form(""), folder: str = Form(""), files: list[UploadFile] = File(...), session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> list[dict]:
    project = get_project(db, identifier)
    require_owner(project, session)
    folder = safe_subpath(folder)
    if not files or len(files) > 20:
        raise HTTPException(status_code=400, detail="리소스 파일은 1~20개여야 합니다.")
    created = []
    try:
        directory = f"{project_root(project.id)}/resources/{folder}".rstrip("/")
        for file in files:
            created.append(upload_file(db, project, session.user_id, file, "resource", directory, category=category[:80], folder=folder, title=title, description=description))
        project.updated_at = utcnow()
        db.commit()
    except Exception:
        db.rollback()
        for item in created:
            try:
                storage.delete(item.storage_path)
            except Exception:
                pass
        raise
    return [file_payload(item, project.slug) for item in created]


@router.put("/{identifier}/resources/{file_id}")
@router.patch("/{identifier}/resources/{file_id}")
def update_resource(identifier: str, file_id: uuid.UUID, data: ResourceUpdate, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    item = db.scalar(select(AIProjectFile).where(AIProjectFile.id == file_id, AIProjectFile.project_id == project.id, AIProjectFile.file_kind == "resource", AIProjectFile.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="리소스를 찾을 수 없습니다.")
    new_folder = safe_subpath(data.folder) if data.folder is not None else item.folder
    new_filename = safe_filename(data.filename) if data.filename is not None else item.original_filename
    moved_from = moved_to = None
    if new_folder != item.folder or new_filename != item.original_filename:
        stored_prefix = item.storage_path.rsplit("/", 1)[-1].split("-", 1)[0]
        destination = f"{project_root(project.id)}/resources/{new_folder}/{stored_prefix}-{new_filename}".replace("//", "/")
        if storage.exists(destination):
            raise HTTPException(status_code=409, detail="대상 파일이 이미 존재합니다.")
        moved_from, moved_to = item.storage_path, destination
        storage.move(moved_from, moved_to)
        item.storage_path = storage.rooted(moved_to)
        event(db, "resource.move", "success", session.user_id, project.id, item.id, moved_from, item.storage_path)
    item.folder, item.original_filename = new_folder, new_filename
    for field in ("title", "description", "category"):
        value = getattr(data, field)
        if value is not None:
            setattr(item, field, value.strip())
    project.updated_at = utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        if moved_from and moved_to:
            storage.move(moved_to, moved_from, overwrite=False)
        raise
    return file_payload(item, project.slug)


@router.post("/{identifier}/folders", status_code=201)
def create_folder(identifier: str, data: FolderInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    relative = safe_subpath(data.path)
    try:
        storage.mkdir(f"{project_root(project.id)}/resources/{relative}".rstrip("/"))
    except StorageError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"path": relative}


@router.get("/{identifier}/folders")
def list_folder(identifier: str, path: str = "", session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> list[dict]:
    project = get_project(db, identifier)
    can_view(project, session)
    relative = safe_subpath(path)
    folder_path = f"{project_root(project.id)}/resources/{relative}".rstrip("/")
    if not storage.exists(folder_path):
        return []
    try:
        return [{"name": item.name, "path": item.path, "is_dir": item.is_dir, "size": item.size, "content_type": item.content_type} for item in storage.list(folder_path)]
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{identifier}/folders/move")
@router.post("/{identifier}/folders/rename")
def move_folder(identifier: str, data: MoveInput, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    source, destination = safe_subpath(data.source), safe_subpath(data.destination)
    if not source or destination == source or destination.startswith(source + "/"):
        raise HTTPException(status_code=400, detail="폴더 이동 경로가 올바르지 않습니다.")
    old, new = f"{project_root(project.id)}/resources/{source}", f"{project_root(project.id)}/resources/{destination}"
    if storage.exists(new):
        raise HTTPException(status_code=409, detail="대상 경로가 이미 존재합니다.")
    storage.move(old, new)
    replace_path_prefix(db, project.id, old, new)
    project.updated_at = utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(new, old, overwrite=False)
        raise
    return {"path": destination}


@router.get("/{identifier}/files/{file_id}/download")
def download_file(identifier: str, file_id: uuid.UUID, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> StreamingResponse:
    project = get_project(db, identifier)
    can_view(project, session)
    item = db.scalar(select(AIProjectFile).where(AIProjectFile.id == file_id, AIProjectFile.project_id == project.id, AIProjectFile.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    item.download_count += 1
    project.download_count += 1
    if item.release_id:
        db.execute(update(AIRelease).where(AIRelease.id == item.release_id).values(download_count=AIRelease.download_count + 1))
    event(db, "download", "success", session.user_id if session else None, project.id, item.id, source=item.storage_path)
    db.commit()
    return attachment_response(item)


@router.get("/{identifier}/download/latest")
def download_latest(identifier: str, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> StreamingResponse:
    project = get_project(db, identifier)
    can_view(project, session)
    item = db.scalar(select(AIProjectFile).join(AIRelease, AIProjectFile.release_id == AIRelease.id).where(AIRelease.project_id == project.id, AIRelease.is_latest.is_(True), AIRelease.deleted_at.is_(None), AIProjectFile.is_primary.is_(True), AIProjectFile.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="최신 다운로드 파일을 찾을 수 없습니다.")
    return download_file(identifier, item.id, session, db)


@router.delete("/{identifier}", status_code=204)
def delete_project(identifier: str, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    project = get_project(db, identifier)
    require_owner(project, session)
    source = project_root(project.id)
    trash_path = trash_move(db, project, source, session.user_id, "project.trash")
    deleted_at = project.deleted_at
    for release in project.releases:
        if release.deleted_at is None:
            release.deleted_at, release.deleted_by_id, release.trash_path = deleted_at, session.user_id, trash_path
    for item in project.files:
        if item.deleted_at is None:
            item.deleted_at, item.deleted_by_id, item.trash_path = deleted_at, session.user_id, trash_path
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(trash_path, source, overwrite=False)
        raise


@router.delete("/{identifier}/releases/{release_id}", status_code=204)
def delete_release(identifier: str, release_id: uuid.UUID, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    project = get_project(db, identifier)
    require_owner(project, session)
    release = db.scalar(select(AIRelease).where(AIRelease.id == release_id, AIRelease.project_id == project.id, AIRelease.deleted_at.is_(None)))
    if not release:
        raise HTTPException(status_code=404, detail="릴리스를 찾을 수 없습니다.")
    source = f"{project_root(project.id)}/releases/{release.version}"
    trash_path = trash_move(db, release, source, session.user_id, "release.trash")
    for item in release.files:
        if item.deleted_at is None:
            item.deleted_at, item.deleted_by_id, item.trash_path = release.deleted_at, session.user_id, trash_path
    ensure_latest(db, project.id)
    project.updated_at = utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(trash_path, source, overwrite=False)
        raise


@router.delete("/{identifier}/resources/{file_id}", status_code=204)
def delete_resource(identifier: str, file_id: uuid.UUID, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> None:
    project = get_project(db, identifier)
    require_owner(project, session)
    item = db.scalar(select(AIProjectFile).where(AIProjectFile.id == file_id, AIProjectFile.project_id == project.id, AIProjectFile.file_kind == "resource", AIProjectFile.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="리소스를 찾을 수 없습니다.")
    source = item.storage_path
    trash_path = trash_move(db, item, source, session.user_id, "resource.trash")
    project.updated_at = utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(trash_path, source, overwrite=False)
        raise


@router.get("/{identifier}/trash")
def list_project_trash(identifier: str, session: AdminSession = Depends(get_current_session), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    items = db.scalars(select(AIProjectFile).where(AIProjectFile.project_id == project.id, AIProjectFile.file_kind == "resource", AIProjectFile.deleted_at.is_not(None)).order_by(AIProjectFile.deleted_at.desc())).all()
    return {"items": [file_payload(item, project.slug) for item in items]}


@router.post("/{identifier}/trash/{file_id}/restore")
def restore_project_resource(identifier: str, file_id: uuid.UUID, session: AdminSession = Depends(require_csrf), db: Session = Depends(get_db)) -> dict:
    project = get_project(db, identifier)
    require_owner(project, session)
    item = db.scalar(select(AIProjectFile).where(AIProjectFile.id == file_id, AIProjectFile.project_id == project.id, AIProjectFile.file_kind == "resource", AIProjectFile.deleted_at.is_not(None)))
    if not item or not item.trash_path:
        raise HTTPException(status_code=404, detail="휴지통 리소스를 찾을 수 없습니다.")
    if storage.exists(item.storage_path):
        raise HTTPException(status_code=409, detail="복원 대상 경로가 이미 존재합니다.")
    trash_path, destination = item.trash_path, item.storage_path
    storage.move(trash_path, destination)
    event(db, "resource.restore", "success", session.user_id, project.id, item.id, trash_path, destination)
    item.deleted_at = item.deleted_by_id = item.trash_path = None
    project.updated_at = utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(destination, trash_path, overwrite=False)
        raise
    return file_payload(item, project.slug)


@router.get("/admin/trash/items")
def list_trash(_: AdminSession = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    result = []
    projects = db.scalars(select(AIProject).where(AIProject.deleted_at.is_not(None)).order_by(AIProject.deleted_at.desc())).all()
    releases = db.scalars(select(AIRelease).join(AIProject).where(AIRelease.deleted_at.is_not(None), AIProject.deleted_at.is_(None)).order_by(AIRelease.deleted_at.desc())).all()
    files = db.scalars(select(AIProjectFile).join(AIProject).outerjoin(AIRelease).where(AIProjectFile.deleted_at.is_not(None), AIProject.deleted_at.is_(None), or_(AIProjectFile.release_id.is_(None), AIRelease.deleted_at.is_(None))).order_by(AIProjectFile.deleted_at.desc())).all()
    for items, kind in ((projects, "project"), (releases, "release"), (files, "file")):
        for item in items:
            result.append({"id": str(item.id), "kind": kind, "project_id": str(getattr(item, "project_id", item.id)), "name": getattr(item, "name", getattr(item, "version", getattr(item, "original_filename", ""))), "deleted_at": item.deleted_at, "deleted_by_id": item.deleted_by_id})
    return sorted(result, key=lambda item: item["deleted_at"], reverse=True)


@router.post("/admin/trash/{kind}/{item_id}/restore")
def restore_trash(kind: Literal["project", "release", "file"], item_id: uuid.UUID, session: AdminSession = Depends(require_admin_csrf), db: Session = Depends(get_db)) -> dict:
    model = {"project": AIProject, "release": AIRelease, "file": AIProjectFile}[kind]
    item = db.get(model, item_id)
    if not item or item.deleted_at is None or not item.trash_path:
        raise HTTPException(status_code=404, detail="휴지통 항목을 찾을 수 없습니다.")
    if kind == "release" and db.get(AIProject, item.project_id).deleted_at is not None:
        raise HTTPException(status_code=409, detail="프로젝트를 먼저 복원해 주세요.")
    if kind == "file":
        parent_project = db.get(AIProject, item.project_id)
        parent_release = db.get(AIRelease, item.release_id) if item.release_id else None
        if parent_project.deleted_at is not None or (parent_release and parent_release.deleted_at is not None):
            raise HTTPException(status_code=409, detail="상위 프로젝트 또는 릴리스를 먼저 복원해 주세요.")
    destination = project_root(item.id) if kind == "project" else (f"{project_root(item.project_id)}/releases/{item.version}" if kind == "release" else item.storage_path)
    if storage.exists(destination):
        raise HTTPException(status_code=409, detail="복원 대상 경로가 이미 존재합니다.")
    trash_path = item.trash_path
    storage.move(trash_path, destination)
    item.deleted_at = item.deleted_by_id = item.trash_path = None
    if kind == "project":
        for release in item.releases:
            if release.trash_path == trash_path:
                release.deleted_at = release.deleted_by_id = release.trash_path = None
        for project_file in item.files:
            if project_file.trash_path == trash_path:
                project_file.deleted_at = project_file.deleted_by_id = project_file.trash_path = None
        ensure_latest(db, item.id)
    elif kind == "release":
        for release_file in item.files:
            if release_file.trash_path == trash_path:
                release_file.deleted_at = release_file.deleted_by_id = release_file.trash_path = None
        ensure_latest(db, item.project_id)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.move(destination, trash_path, overwrite=False)
        raise
    return {"id": str(item.id), "kind": kind, "restored": True}
