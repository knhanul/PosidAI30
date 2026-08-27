import io

import pytest
from fastapi import HTTPException

from app.ai_projects_service import hash_and_spool, render_markdown, safe_subpath, slugify
from app.webdav import StorageError, normalize_storage_path, safe_filename


def test_storage_path_normalization_rejects_traversal():
    assert normalize_storage_path("together-ai/projects/id/files") == "together-ai/projects/id/files"
    with pytest.raises(StorageError):
        normalize_storage_path("together-ai/../secret")
    with pytest.raises(HTTPException):
        safe_subpath("../../secret")


def test_safe_filename_removes_path_and_reserved_characters():
    assert safe_filename("../bad:name?.zip") == "bad_name_.zip"


def test_chunked_hash_and_size_limit():
    spool, size, digest = hash_and_spool(io.BytesIO(b"abc"), 3)
    try:
        assert size == 3
        assert digest == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        assert spool.read() == b"abc"
    finally:
        spool.close()
    with pytest.raises(HTTPException) as error:
        hash_and_spool(io.BytesIO(b"abcd"), 3)
    assert error.value.status_code == 413


def test_slug_and_readme_rendering_are_safe():
    assert slugify(" Together AI 프로젝트! ") == "together-ai-프로젝트"
    rendered = render_markdown("# Title\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```py\nprint('ok')\n```\n<script>alert(1)</script>\n[x](javascript:alert(1))\n![bad](javascript:alert(2))\n[ok](https://example.com)")
    assert "<h1>Title</h1>" in rendered
    assert "<ul>" in rendered and "<table>" in rendered and "<pre><code" in rendered
    assert "<script" not in rendered
    assert "javascript:" not in rendered
    assert 'href="https://example.com"' in rendered
