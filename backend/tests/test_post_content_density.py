import pytest
from pydantic import ValidationError

from app.main import apply_post_input, post_payload, post_summary_payload
from app.models import AdminUser, Post
from app.schemas import PostInput


def post_input(**overrides) -> PostInput:
    values = {
        "category": "news",
        "title": "제목",
        "summary": "요약",
        "body_markdown": "<p><br></p><p>본문</p>",
        "content_format": "html",
    }
    values.update(overrides)
    return PostInput(**values)


def transient_post() -> Post:
    post = Post(author_id=1, slug="test-post", category="news", title="제목", summary="요약", body_markdown="본문")
    post.author = AdminUser(id=1, username="admin", display_name="관리자", password_hash="unused")
    return post


def test_content_density_defaults_to_normal_and_preserves_empty_paragraph():
    data = post_input()
    post = transient_post()

    apply_post_input(post, data)

    assert data.content_density == "normal"
    assert post.content_density == "normal"
    assert post.body_markdown == "<p><br></p><p>본문</p>"


def test_content_density_accepts_compact_and_can_change_back_to_normal():
    post = transient_post()

    apply_post_input(post, post_input(content_density="compact"))
    assert post.content_density == "compact"
    assert post_payload(post)["content_density"] == "compact"
    assert post_summary_payload(post)["content_density"] == "compact"

    apply_post_input(post, post_input(content_density="normal"))
    assert post.content_density == "normal"


def test_content_density_rejects_unknown_value():
    with pytest.raises(ValidationError):
        post_input(content_density="arbitrary-class")


def test_post_payload_falls_back_to_normal_for_unexpected_null():
    post = transient_post()
    post.content_density = None

    assert post_payload(post)["content_density"] == "normal"
