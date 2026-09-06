import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

import app.main as main
from app.models import AdminUser, Post
from app.schemas import PostInput


ARTICLE_CATEGORIES = ("news", "learn", "use", "together")
SHORT_CATEGORIES = ("tip", "discovery", "use_case", "memo", "link")


def post_input(**overrides) -> PostInput:
    values = {
        "category": "news",
        "title": "제목",
        "summary": "요약",
        "body_markdown": "본문",
        "content_format": "markdown",
    }
    values.update(overrides)
    return PostInput(**values)


def transient_post(category: str = "news") -> Post:
    post = Post(author_id=1, slug=f"test-{uuid.uuid4().hex}", category=category, title="제목", summary="요약", body_markdown="본문")
    post.author = AdminUser(id=1, username="admin", display_name="관리자", password_hash="unused")
    post.attachments = []
    post.short_category = None
    post.external_url = None
    return post


class ScalarResult:
    def __init__(self, items):
        self.items = items

    def all(self):
        return self.items


class ExecuteResult:
    def all(self):
        return []


class FakeListSession:
    def __init__(self, posts):
        self.posts = posts
        self.scalar_statements = []
        self.execute_statements = []

    def scalars(self, statement):
        self.scalar_statements.append(statement)
        return ScalarResult(self.posts)

    def execute(self, statement):
        self.execute_statements.append(statement)
        return ExecuteResult()


def compiled(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))


def test_model_adds_nullable_short_fields():
    assert Post.__table__.c.short_category.type.length == 20
    assert Post.__table__.c.short_category.nullable is True
    assert Post.__table__.c.external_url.nullable is True


@pytest.mark.parametrize("category", (*ARTICLE_CATEGORIES, "short"))
def test_post_categories_are_accepted(category):
    values = {"category": category}
    if category == "short":
        values["short_category"] = "tip"
    assert post_input(**values).category == category


def test_unknown_post_category_is_rejected():
    with pytest.raises(ValidationError):
        post_input(category="unknown")


@pytest.mark.parametrize("short_category", SHORT_CATEGORIES)
def test_short_categories_are_accepted(short_category):
    assert post_input(category="short", short_category=short_category).short_category == short_category


def test_unknown_or_missing_short_category_is_rejected():
    with pytest.raises(ValidationError):
        post_input(category="short")
    with pytest.raises(ValidationError):
        post_input(category="short", short_category="abc")


@pytest.mark.parametrize("field,value", (("short_category", "tip"), ("external_url", "https://example.com")))
def test_article_rejects_short_only_fields(field, value):
    with pytest.raises(ValidationError, match="짧게보기 전용"):
        post_input(**{field: value})


@pytest.mark.parametrize("url", (None, "", "http://example.com", "https://example.com/path"))
def test_short_external_url_accepts_optional_http_urls(url):
    data = post_input(category="short", short_category="link", external_url=url)
    if url:
        assert str(data.external_url).startswith(url)
    else:
        assert data.external_url is None


@pytest.mark.parametrize("url", ("javascript:alert(1)", "data:text/html,x", "ftp://example.com"))
def test_short_external_url_rejects_unsafe_schemes(url):
    with pytest.raises(ValidationError):
        post_input(category="short", short_category="link", external_url=url)


def test_short_body_is_required_and_limited_to_2000_characters():
    with pytest.raises(ValidationError, match="본문을 입력"):
        post_input(category="short", short_category="memo", body_markdown="   ")
    assert len(post_input(category="short", short_category="memo", body_markdown="가" * 2000).body_markdown) == 2000
    with pytest.raises(ValidationError, match="2,000자"):
        post_input(category="short", short_category="memo", body_markdown="가" * 2001)


def test_short_storage_invariants_and_summary_normalization():
    post = transient_post("short")
    post.thumbnail_path = "old/thumbnail.jpg"
    post.thumbnail_filename = "thumbnail.jpg"
    post.thumbnail_content_type = "image/jpeg"
    data = post_input(
        category="short",
        short_category="tip",
        summary="클라이언트 요약",
        body_markdown="  첫 문장\n\n  두 번째   문장  ",
        content_format="html",
        content_density="normal",
        key_points=["핵심"],
        is_featured=True,
        thumbnail_type="webdav",
        service_status="사용 가능",
        service_audience="대상",
        service_url="https://example.com/service",
        external_url="https://example.com/reference",
        show_on_home=False,
    )

    main.apply_post_input(post, data)

    assert post.summary == "첫 문장 두 번째 문장"
    assert post.body_markdown == "첫 문장\n\n  두 번째   문장"
    assert post.content_format == "markdown"
    assert post.content_density == "compact"
    assert post.key_points == []
    assert post.is_featured is False
    assert post.show_on_home is False
    assert post.thumbnail_type == "preset"
    assert post.thumbnail_path is None
    assert post.thumbnail_filename is None
    assert post.thumbnail_content_type is None
    assert post.service_status is None
    assert post.service_audience is None
    assert post.service_url is None
    assert post.short_category == "tip"
    assert post.external_url == "https://example.com/reference"


@pytest.mark.parametrize("category", ARTICLE_CATEGORIES)
def test_existing_article_categories_keep_current_storage_behavior(category):
    post = transient_post(category)
    data = post_input(
        category=category,
        summary="  기존 요약  ",
        body_markdown="<p>본문</p>",
        content_format="html",
        content_density="normal",
        key_points=["핵심"],
        is_featured=True,
        show_on_home=True,
        thumbnail_type="webdav",
    )

    main.apply_post_input(post, data)

    assert post.category == category
    assert post.summary == "기존 요약"
    assert post.body_markdown == "<p>본문</p>"
    assert post.content_format == "html"
    assert post.content_density == "normal"
    assert post.key_points == ["핵심"]
    assert post.is_featured is True
    assert post.thumbnail_type == "webdav"
    assert post.short_category is None
    assert post.external_url is None


@pytest.mark.parametrize("old_category,new_category", (("news", "short"), ("short", "news")))
def test_article_short_type_conversion_is_rejected(old_category, new_category):
    post = transient_post(old_category)
    values = {"category": new_category}
    if new_category == "short":
        values["short_category"] = "tip"
    with pytest.raises(HTTPException) as error:
        main.ensure_post_type_unchanged(post, post_input(**values))
    assert error.value.status_code == 400


def test_article_category_change_remains_allowed():
    main.ensure_post_type_unchanged(transient_post("news"), post_input(category="learn"))


def test_short_summary_payload_includes_body_only_when_requested():
    post = transient_post("short")
    post.short_category = "memo"
    post.external_url = None
    main.apply_post_input(post, post_input(category="short", short_category="memo", body_markdown="짧은 본문"))

    assert "body_markdown" not in main.post_summary_payload(post)
    assert main.post_summary_payload(post, include_body=True)["body_markdown"] == "짧은 본문"
    assert main.post_payload(post)["short_category"] == "memo"


def test_short_list_loads_body_and_uses_bulk_count_queries():
    post = transient_post("short")
    main.apply_post_input(post, post_input(category="short", short_category="tip", body_markdown="목록 본문"))
    db = FakeListSession([post])

    result = main.public_posts(short_category=None, category="short", q=None, home=False, page=1, page_size=20, db=db)

    assert result["items"][0]["body_markdown"] == "목록 본문"
    assert len(db.scalar_statements) == 1
    assert len(db.execute_statements) == 2
    assert "posts.body_markdown" in compiled(db.scalar_statements[0])


def test_article_list_keeps_body_deferred():
    post = transient_post("news")
    main.apply_post_input(post, post_input(category="news"))
    db = FakeListSession([post])

    result = main.public_posts(short_category=None, category="news", q=None, home=False, page=1, page_size=20, db=db)

    assert "body_markdown" not in result["items"][0]
    assert "posts.body_markdown" not in compiled(db.scalar_statements[0]).split("FROM posts", 1)[0]


def test_unfiltered_home_list_excludes_short_posts():
    db = FakeListSession([])

    main.public_posts(short_category=None, category=None, q=None, home=True, page=1, page_size=100, db=db)

    sql = compiled(db.scalar_statements[0])
    assert "posts.show_on_home IS true" in sql
    assert "posts.category !=" in sql


def test_invalid_list_category_is_rejected_before_query():
    db = FakeListSession([])
    with pytest.raises(HTTPException) as error:
        main.public_posts(short_category=None, category="unknown", q=None, home=False, page=1, page_size=20, db=db)
    assert error.value.status_code == 400
    assert not db.scalar_statements


@pytest.mark.parametrize("endpoint", (main.upload_user_thumbnail, main.upload_thumbnail, main.upload_attachments, main.set_featured))
def test_short_rejects_thumbnail_attachment_and_featured_endpoints(monkeypatch, endpoint):
    post = transient_post("short")
    monkeypatch.setattr(main, "get_active_post", lambda db, post_id: post)

    with pytest.raises(HTTPException) as error:
        if endpoint is main.upload_attachments:
            endpoint(post.id, [], None, None)
        elif endpoint is main.set_featured:
            endpoint(post.id, None, None)
        else:
            endpoint(post.id, None, None, None)
    assert error.value.status_code == 400
