import mimetypes
import posixpath
import re
import shutil
import ssl
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote, unquote, urlparse

import httpx
from fastapi import HTTPException, status

from .config import get_settings


class StorageError(RuntimeError):
    pass


@dataclass(slots=True)
class StorageEntry:
    name: str
    path: str
    is_dir: bool
    size: int | None = None
    modified_at: datetime | None = None
    content_type: str | None = None


def safe_filename(value: str) -> str:
    name = Path(value or "file").name.strip().replace("\x00", "")
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    return name[:180] or "file"


def normalize_storage_path(path: str) -> str:
    value = (path or "").replace("\\", "/").strip()
    parts = [part for part in value.split("/") if part not in ("", ".")]
    if ".." in parts or any("\x00" in part for part in parts):
        raise StorageError("저장소 루트 밖의 경로는 사용할 수 없습니다.")
    normalized = posixpath.normpath("/" + value).lstrip("/")
    if normalized in ("", "."):
        return ""
    if normalized == ".." or normalized.startswith("../"):
        raise StorageError("저장소 루트 밖의 경로는 사용할 수 없습니다.")
    return normalized


class StorageBase:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def root(self) -> str:
        return normalize_storage_path(self.settings.webdav_root)

    def rooted(self, path: str) -> str:
        path = normalize_storage_path(path)
        if not self.root:
            return path
        if path == self.root or path.startswith(self.root + "/"):
            return path
        return normalize_storage_path(posixpath.join(self.root, path))

    def upload(self, relative_dir: list[str], filename: str, source: BinaryIO) -> str:
        directory = normalize_storage_path("/".join(relative_dir))
        path = normalize_storage_path(posixpath.join(directory, safe_filename(filename)))
        with self._client() as client:
            self.ensure_collection(relative_dir, client)
            self.write_stream(path, source, client=client)
        return self.rooted(path)


class LocalStorage(StorageBase):
    def __init__(self) -> None:
        super().__init__()
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _client(self):
        from contextlib import nullcontext
        return nullcontext()

    @property
    def _base_dir(self) -> Path:
        return Path(self.settings.local_storage_dir).resolve()

    def _full_path(self, storage_path: str) -> Path:
        candidate = (self._base_dir / self.rooted(storage_path)).resolve()
        try:
            candidate.relative_to(self._base_dir)
        except ValueError as exc:
            raise StorageError("저장소 루트 밖의 경로는 사용할 수 없습니다.") from exc
        return candidate

    def ensure_collection(self, relative_parts: list[str], client: httpx.Client | None = None) -> None:
        self._full_path("/".join(relative_parts)).mkdir(parents=True, exist_ok=True)

    def mkdir(self, path: str) -> None:
        self._full_path(path).mkdir(parents=True, exist_ok=False)

    def exists(self, path: str) -> bool:
        return self._full_path(path).exists()

    def list(self, path: str = "") -> list[StorageEntry]:
        target = self._full_path(path)
        if not target.is_dir():
            raise StorageError("폴더를 찾을 수 없습니다.")
        entries = []
        for item in target.iterdir():
            stat = item.stat()
            entries.append(StorageEntry(item.name, item.relative_to(self._base_dir).as_posix(), item.is_dir(), None if item.is_dir() else stat.st_size, datetime.fromtimestamp(stat.st_mtime).astimezone(), None if item.is_dir() else mimetypes.guess_type(item.name)[0]))
        return sorted(entries, key=lambda item: (not item.is_dir, item.name.lower()))

    def write_stream(self, path: str, source: BinaryIO, content_type: str | None = None, client=None) -> None:
        target = self._full_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        source.seek(0)
        with target.open("wb") as output:
            shutil.copyfileobj(source, output, length=1024 * 1024)

    def move(self, source: str, destination: str, overwrite: bool = False) -> None:
        source_path, destination_path = self._full_path(source), self._full_path(destination)
        if not source_path.exists():
            raise StorageError("원본 경로를 찾을 수 없습니다.")
        if destination_path.exists() and not overwrite:
            raise StorageError("대상 경로가 이미 존재합니다.")
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        if destination_path.exists() and overwrite:
            shutil.rmtree(destination_path) if destination_path.is_dir() else destination_path.unlink()
        source_path.replace(destination_path)

    def delete(self, storage_path: str) -> None:
        target = self._full_path(storage_path)
        if not target.exists():
            return
        shutil.rmtree(target) if target.is_dir() else target.unlink()

    def stream(self, storage_path: str) -> Iterator[bytes]:
        target = self._full_path(storage_path)
        if not target.is_file():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        with target.open("rb") as handle:
            yield from iter(lambda: handle.read(1024 * 1024), b"")


class WebDAVStorage(StorageBase):
    DAV = "{DAV:}"

    def __init__(self) -> None:
        super().__init__()

    def _require_config(self) -> None:
        if not self.settings.webdav_configured:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebDAV 연결 정보가 설정되지 않았습니다.")

    def _client(self) -> httpx.Client:
        tls_context = ssl.create_default_context()
        tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
        tls_context.maximum_version = ssl.TLSVersion.TLSv1_2
        tls_context.set_ciphers("AES256-GCM-SHA384")
        if not self.settings.webdav_verify_tls:
            tls_context.check_hostname = False
            tls_context.verify_mode = ssl.CERT_NONE
        timeout = httpx.Timeout(
            connect=self.settings.webdav_connect_timeout_seconds,
            read=self.settings.webdav_timeout_seconds,
            write=self.settings.webdav_write_timeout_seconds,
            pool=self.settings.webdav_connect_timeout_seconds,
        )
        return httpx.Client(auth=httpx.DigestAuth(self.settings.webdav_username, self.settings.webdav_password), verify=tls_context, timeout=timeout, follow_redirects=True, trust_env=False)

    def _url(self, path: str = "") -> str:
        encoded = "/".join(quote(part, safe="") for part in self.rooted(path).split("/") if part)
        return f"{self.settings.webdav_url.rstrip('/')}/{encoded}" if encoded else self.settings.webdav_url.rstrip("/")

    @staticmethod
    def _check(response: httpx.Response, allowed: tuple[int, ...]) -> None:
        if response.status_code not in allowed:
            raise StorageError(f"WebDAV 작업에 실패했습니다. (HTTP {response.status_code})")

    def ensure_collection(self, relative_parts: list[str], client: httpx.Client | None = None) -> None:
        self._require_config()
        parts = [part for part in self.rooted("/".join(relative_parts)).split("/") if part]
        own_client = client is None
        client = client or self._client()
        try:
            for index in range(1, len(parts) + 1):
                url = self._url("/".join(parts[:index])) + "/"
                found = client.request("PROPFIND", url, headers={"Depth": "0"})
                if found.status_code == 207:
                    continue
                self._check(client.request("MKCOL", url), (201, 301, 405))
        finally:
            if own_client:
                client.close()

    def mkdir(self, path: str) -> None:
        parent = normalize_storage_path(path).rsplit("/", 1)[0] if "/" in normalize_storage_path(path) else ""
        with self._client() as client:
            self.ensure_collection(parent.split("/") if parent else [], client)
            self._check(client.request("MKCOL", self._url(path)), (201, 405))

    def exists(self, path: str) -> bool:
        self._require_config()
        with self._client() as client:
            return client.request("PROPFIND", self._url(path), headers={"Depth": "0"}).status_code == 207

    def list(self, path: str = "") -> list[StorageEntry]:
        self._require_config()
        body = '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:resourcetype/></d:prop></d:propfind>'
        with self._client() as client:
            response = client.request("PROPFIND", self._url(path), headers={"Depth": "1", "Content-Type": "application/xml"}, content=body)
        self._check(response, (207,))
        entries = []
        base = self.rooted(path)
        for index, item in enumerate(ET.fromstring(response.content).findall(f"{self.DAV}response")):
            if index == 0:
                continue
            props = item.find(f".//{self.DAV}prop")
            if props is None:
                continue
            href = unquote(urlparse(item.findtext(f"{self.DAV}href", "")).path).rstrip("/")
            name = props.findtext(f"{self.DAV}displayname") or href.rsplit("/", 1)[-1]
            resource_type = props.find(f"{self.DAV}resourcetype")
            is_dir = resource_type is not None and resource_type.find(f"{self.DAV}collection") is not None
            size = props.findtext(f"{self.DAV}getcontentlength")
            entries.append(StorageEntry(name, normalize_storage_path(posixpath.join(base, name)), is_dir, None if is_dir or not size else int(size), content_type=props.findtext(f"{self.DAV}getcontenttype")))
        return sorted(entries, key=lambda item: (not item.is_dir, item.name.lower()))

    def write_stream(self, path: str, source: BinaryIO, content_type: str | None = None, client: httpx.Client | None = None) -> None:
        self._require_config()
        source.seek(0)
        try:
            source.seek(0, 2)
            size = source.tell()
            source.seek(0)
        except Exception:
            size = None
        headers = {"Content-Type": content_type or "application/octet-stream"}
        if size is not None:
            headers["Content-Length"] = str(size)
        own_client = client is None
        client = client or self._client()
        try:
            response = client.put(self._url(path), content=source, headers=headers)
        finally:
            if own_client:
                client.close()
        self._check(response, (200, 201, 204))

    def move(self, source: str, destination: str, overwrite: bool = False) -> None:
        self._require_config()
        parent = normalize_storage_path(destination).rsplit("/", 1)[0]
        with self._client() as client:
            self.ensure_collection(parent.split("/") if parent else [], client)
            response = client.request("MOVE", self._url(source), headers={"Destination": self._url(destination), "Overwrite": "T" if overwrite else "F"})
        self._check(response, (201, 204))

    def delete(self, storage_path: str) -> None:
        self._require_config()
        with self._client() as client:
            response = client.request("DELETE", self._url(storage_path))
        self._check(response, (200, 204, 404))

    def stream(self, storage_path: str) -> Iterator[bytes]:
        self._require_config()
        with self._client() as client:
            with client.stream("GET", self._url(storage_path)) as response:
                if response.status_code == 404:
                    raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
                self._check(response, (200,))
                yield from response.iter_bytes(1024 * 1024)


storage: WebDAVStorage | LocalStorage = WebDAVStorage() if get_settings().webdav_configured else LocalStorage()
