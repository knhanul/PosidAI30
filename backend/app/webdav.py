import re
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from .config import get_settings


def safe_filename(value: str) -> str:
    name = Path(value or "file").name.strip().replace("\x00", "")
    name = re.sub(r"[\\/:*?\"<>|]", "_", name)
    return name[:180] or "file"


class WebDAVStorage:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _require_config(self) -> None:
        if not self.settings.webdav_configured:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="WebDAV 연결 정보가 설정되지 않았습니다.")

    def _client(self) -> httpx.Client:
        return httpx.Client(
            auth=httpx.DigestAuth(self.settings.webdav_username, self.settings.webdav_password),
            verify=self.settings.webdav_verify_tls,
            timeout=self.settings.webdav_timeout_seconds,
            follow_redirects=True,
            trust_env=False,
        )

    def _url(self, path: str = "") -> str:
        base = self.settings.webdav_url.rstrip("/")
        encoded = "/".join(quote(part, safe="") for part in path.strip("/").split("/") if part)
        return f"{base}/{encoded}" if encoded else base

    def ensure_collection(self, relative_parts: list[str]) -> None:
        self._require_config()
        current: list[str] = []
        root_parts = [item for item in self.settings.webdav_root.strip("/").split("/") if item]
        with self._client() as client:
            for part in [*root_parts, *relative_parts]:
                current.append(part)
                response = client.request("MKCOL", self._url("/".join(current)))
                if response.status_code not in (201, 301, 405):
                    raise HTTPException(status_code=502, detail=f"WebDAV 폴더를 준비하지 못했습니다. ({response.status_code})")

    def upload(self, relative_dir: list[str], filename: str, source: BinaryIO) -> str:
        self.ensure_collection(relative_dir)
        root_parts = [item for item in self.settings.webdav_root.strip("/").split("/") if item]
        storage_path = "/".join([*root_parts, *relative_dir, safe_filename(filename)])
        source.seek(0)
        with self._client() as client:
            response = client.put(self._url(storage_path), content=source)
            if response.status_code not in (200, 201, 204):
                raise HTTPException(status_code=502, detail=f"WebDAV에 파일을 저장하지 못했습니다. ({response.status_code})")
        return storage_path

    def delete(self, storage_path: str) -> None:
        self._require_config()
        with self._client() as client:
            response = client.delete(self._url(storage_path))
            if response.status_code not in (200, 204, 404):
                raise HTTPException(status_code=502, detail=f"WebDAV 파일을 삭제하지 못했습니다. ({response.status_code})")

    def stream(self, storage_path: str) -> Iterator[bytes]:
        self._require_config()
        with self._client() as client:
            with client.stream("GET", self._url(storage_path)) as response:
                if response.status_code == 404:
                    raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
                if response.status_code >= 400:
                    raise HTTPException(status_code=502, detail=f"WebDAV 파일을 읽지 못했습니다. ({response.status_code})")
                yield from response.iter_bytes()


storage = WebDAVStorage()
