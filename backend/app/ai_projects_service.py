import hashlib
import posixpath
import re
import tempfile
import uuid
from pathlib import PurePosixPath
from typing import BinaryIO

import bleach
import mistune
from fastapi import HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from .config import get_settings
from .database import SessionLocal
from .models import AIFileEvent, AIProject, AIProjectFile, AIRelease, AdminSession, utcnow
from .webdav import StorageError, normalize_storage_path, safe_filename, storage

PROJECT_ROOT = "together-ai/projects"
TRASH_ROOT = "together-ai/trash"


def project_root(project_id: uuid.UUID) -> str:
    return f"{PROJECT_ROOT}/{project_id}"


def slugify(value: str) -> str:
    value = re.sub(r"[^0-9a-zA-Z가-힣._-]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", value).strip("-._")[:180] or "project"


def unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    candidate = base
    suffix = 2
    while db.scalar(select(AIProject.id).where(AIProject.slug == candidate)):
        candidate = f"{base[:190 - len(str(suffix))]}-{suffix}"
        suffix += 1
    return candidate


def safe_subpath(value: str) -> str:
    try:
        return normalize_storage_path(value)
    except StorageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def require_owner(project: AIProject, session: AdminSession) -> None:
    if project.owner_id != session.user_id and session.user.role != "admin":
        raise HTTPException(status_code=403, detail="프로젝트 소유자 또는 관리자 권한이 필요합니다.")


def get_project(db: Session, identifier: str | uuid.UUID, include_deleted: bool = False) -> AIProject:
    identifier_text = str(identifier)
    try:
        project_uuid = uuid.UUID(identifier_text)
    except ValueError:
        project_uuid = None
    identity_filter = (AIProject.id == project_uuid) if project_uuid else (AIProject.slug == identifier_text)
    query = select(AIProject).options(selectinload(AIProject.links), selectinload(AIProject.releases).selectinload(AIRelease.files), selectinload(AIProject.files)).where(identity_filter)
    if not include_deleted:
        query = query.where(AIProject.deleted_at.is_(None))
    project = db.scalar(query)
    if not project:
        raise HTTPException(status_code=404, detail="프로젝트를 찾을 수 없습니다.")
    return project


def event(db: Session, operation: str, status: str, actor_id: int | None, project_id: uuid.UUID | None = None, file_id: uuid.UUID | None = None, source: str | None = None, destination: str | None = None, detail: dict | None = None) -> None:
    db.add(AIFileEvent(project_id=project_id, file_id=file_id, actor_id=actor_id, operation=operation, status=status, source_path=source, destination_path=destination, detail=detail or {}))


def persist_failed_event(operation: str, actor_id: int | None, project_id: uuid.UUID | None, source: str | None, destination: str | None, error: Exception) -> None:
    db = SessionLocal()
    try:
        event(db, operation, "failed", actor_id, source=source, destination=destination, detail={"project_id": str(project_id) if project_id else None, "error": str(error)[:500]})
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def hash_and_spool(source: BinaryIO, max_bytes: int) -> tuple[tempfile.SpooledTemporaryFile, int, str]:
    output = tempfile.SpooledTemporaryFile(max_size=min(max_bytes, 64 * 1024 * 1024), mode="w+b")
    digest, size = hashlib.sha256(), 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            output.close()
            raise HTTPException(status_code=413, detail="프로젝트 파일 업로드 허용 크기를 초과했습니다.")
        digest.update(chunk)
        output.write(chunk)
    if not size:
        output.close()
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")
    output.seek(0)
    return output, size, digest.hexdigest()


def upload_file(db: Session, project: AIProject, actor_id: int, upload: UploadFile, kind: str, directory: str, release_id: uuid.UUID | None = None, category: str | None = None, folder: str = "", primary: bool = False, title: str = "", description: str = "") -> AIProjectFile:
    original = safe_filename(upload.filename or "file")
    spool, size, digest = hash_and_spool(upload.file, get_settings().max_project_file_mb * 1024 * 1024)
    path = safe_subpath(f"{directory}/{uuid.uuid4().hex[:12]}-{original}")
    try:
        with storage._client() as client:
            storage.ensure_collection(path.rsplit("/", 1)[0].split("/"), client)
            storage.write_stream(path, spool, upload.content_type, client=client)
        rooted_path = storage.rooted(path)
        item = AIProjectFile(project_id=project.id, release_id=release_id, uploaded_by_id=actor_id, file_kind=kind, category=category, folder=folder, title=title.strip()[:200], description=description.strip(), original_filename=original, storage_path=rooted_path, content_type=upload.content_type or "application/octet-stream", size=size, sha256=digest, is_primary=primary)
        db.add(item)
        db.flush()
        event(db, "upload", "success", actor_id, project.id, item.id, destination=rooted_path, detail={"kind": kind, "size": size, "sha256": digest})
        return item
    except Exception as exc:
        try:
            if storage.exists(path):
                storage.delete(path)
        except Exception:
            pass
        persist_failed_event("upload", actor_id, project.id, None, storage.rooted(path), exc)
        raise
    finally:
        spool.close()


def set_latest(db: Session, project_id: uuid.UUID, release_id: uuid.UUID) -> None:
    db.execute(update(AIRelease).where(AIRelease.project_id == project_id).values(is_latest=False))
    release = db.scalar(select(AIRelease).where(AIRelease.id == release_id, AIRelease.project_id == project_id, AIRelease.deleted_at.is_(None)))
    if release:
        release.is_latest = True


def ensure_latest(db: Session, project_id: uuid.UUID) -> None:
    current = db.scalar(select(AIRelease).where(AIRelease.project_id == project_id, AIRelease.deleted_at.is_(None), AIRelease.is_latest.is_(True)).limit(1))
    if current:
        return
    latest = db.scalar(select(AIRelease).where(AIRelease.project_id == project_id, AIRelease.deleted_at.is_(None)).order_by(AIRelease.release_date.desc().nullslast(), AIRelease.created_at.desc()).limit(1))
    if latest:
        set_latest(db, project_id, latest.id)


def project_payload(project: AIProject, session: AdminSession | None = None, detail: bool = False) -> dict:
    owned = bool(session and project.owner_id == session.user_id)
    is_admin = bool(session and session.user.role == "admin")
    active_releases = sorted((item for item in project.releases if item.deleted_at is None), key=lambda item: (item.release_date or item.created_at.date(), item.created_at), reverse=True)
    resources = [item for item in project.files if item.file_kind == "resource" and item.deleted_at is None]
    latest = next((item for item in active_releases if item.is_latest), None)
    category_counts: dict[str, int] = {}
    for item in resources:
        category = item.category or "general"
        category_counts[category] = category_counts.get(category, 0) + 1
    payload = {"id": str(project.id), "slug": project.slug, "owner_id": project.owner_id, "name": project.name, "summary": project.summary, "description": project.description, "website_url": project.website_url, "project_type": project.project_type, "visibility": project.visibility, "categories": project.categories or [], "platforms": project.platforms or [], "view_count": project.view_count, "download_count": project.download_count, "icon_url": f"/api/ai-projects/{project.slug}/icon" if project.icon_file_id else None, "readme_download_url": f"/api/ai-projects/{project.slug}/readme/download" if project.readme_file_id else None, "latest_release": release_payload(latest) if latest else None, "resource_category_counts": category_counts, "resource_folders": sorted({item.folder for item in resources if item.folder}), "owned_by_current_user": owned, "is_admin": is_admin, "can_manage": owned or is_admin, "created_at": project.created_at, "updated_at": project.updated_at}
    if detail:
        payload.update({"readme_markdown": project.readme_markdown, "readme_html": render_markdown(project.readme_markdown), "links": [{"id": str(link.id), "label": link.label, "url": link.url, "link_type": link.link_type, "position": link.position} for link in sorted(project.links, key=lambda link: link.position)], "releases": [release_payload(release) for release in active_releases], "resources": [file_payload(item, project.slug) for item in resources]})
    return payload


def release_payload(release: AIRelease | None) -> dict | None:
    if not release:
        return None
    return {"id": str(release.id), "version": release.version, "title": release.title, "notes": release.notes, "release_date": release.release_date, "is_latest": release.is_latest, "is_prerelease": release.is_prerelease, "download_count": release.download_count, "created_at": release.created_at, "files": [file_payload(item, release.project.slug if release.project else None) for item in release.files if item.deleted_at is None]}


def file_payload(item: AIProjectFile, project_slug: str | None = None) -> dict:
    identifier = project_slug or str(item.project_id)
    return {"id": str(item.id), "kind": item.file_kind, "category": item.category, "folder": item.folder or None, "title": item.title, "description": item.description, "filename": item.original_filename, "content_type": item.content_type, "size": item.size, "sha256": item.sha256, "is_primary": item.is_primary, "download_count": item.download_count, "download_url": f"/api/ai-projects/{identifier}/files/{item.id}/download", "deleted_at": item.deleted_at, "created_at": item.created_at}


def render_markdown(markdown_text: str) -> str:
    renderer = mistune.create_markdown(escape=True, plugins=["table", "strikethrough", "task_lists"])
    rendered = renderer(markdown_text or "")
    return bleach.clean(rendered, tags={"h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "strong", "em", "del", "code", "pre", "ul", "ol", "li", "blockquote", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "hr", "input"}, attributes={"a": ["href", "title"], "img": ["src", "alt", "title"], "th": ["align"], "td": ["align"], "input": ["type", "checked", "disabled"]}, protocols={"http", "https"}, strip=True)


def trash_move(db: Session, item: AIProject | AIRelease | AIProjectFile, source: str, actor_id: int, operation: str) -> str:
    destination = f"{TRASH_ROOT}/{type(item).__name__.lower()}-{item.id}-{uuid.uuid4().hex[:8]}"
    project_id = getattr(item, "project_id", getattr(item, "id", None))
    file_id = getattr(item, "id", None) if isinstance(item, AIProjectFile) else None
    try:
        storage.move(source, destination, overwrite=False)
    except Exception as exc:
        persist_failed_event(operation, actor_id, project_id, source, destination, exc)
        raise HTTPException(status_code=502, detail="파일을 휴지통으로 이동하지 못했습니다.") from exc
    item.deleted_at = utcnow()
    item.deleted_by_id = actor_id
    item.trash_path = storage.rooted(destination)
    event(db, operation, "success", actor_id, project_id, file_id, source, item.trash_path)
    return item.trash_path


def replace_path_prefix(db: Session, project_id: uuid.UUID, old: str, new: str) -> None:
    rooted_old, rooted_new = storage.rooted(old), storage.rooted(new)
    files = db.scalars(select(AIProjectFile).where(AIProjectFile.project_id == project_id, AIProjectFile.storage_path.like(rooted_old + "%"))).all()
    for item in files:
        item.storage_path = rooted_new + item.storage_path[len(rooted_old):]
        relative = item.storage_path.split(f"/{project_id}/resources/", 1)
        if len(relative) == 2:
            item.folder = str(PurePosixPath(relative[1]).parent)
            if item.folder == ".":
                item.folder = ""
