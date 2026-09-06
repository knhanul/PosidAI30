import os
import secrets
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.orm import Session

import app.main as main
from app.database import engine
from app.models import AdminUser
from app.schemas import PostInput


pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_INTEGRATION") != "1", reason="RUN_DB_INTEGRATION=1 is required")


def post_input(**overrides) -> PostInput:
    values = {
        "category": "news",
        "title": "통합 테스트 글",
        "summary": "통합 테스트 요약",
        "body_markdown": "통합 테스트 본문",
        "content_format": "markdown",
        "topics": ["통합테스트"],
        "show_on_home": True,
    }
    values.update(overrides)
    return PostInput(**values)


def test_short_post_api_database_and_query_integration():
    statements = []

    def record_statement(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.lower().split()))

    event.listen(engine, "before_cursor_execute", record_statement)
    with engine.connect() as connection:
        transaction = connection.begin()
        db = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
        try:
            user = AdminUser(
                username=f"short-test-{secrets.token_hex(8)}",
                display_name="짧게보기 테스트",
                display_name_confirmed=True,
                password_hash="unused",
                role="admin",
                is_active=True,
            )
            db.add(user)
            db.flush()
            session = SimpleNamespace(user_id=user.id, user=user)

            short = main.create_post(
                post_input(
                    category="short",
                    short_category="tip",
                    title="짧게보기 검색 제목",
                    summary="클라이언트 요약",
                    body_markdown="  짧게보기 검색 본문\n두 번째 문장  ",
                    topics=["AI/검색"],
                    content_format="html",
                    content_density="normal",
                    is_featured=True,
                    thumbnail_type="webdav",
                    external_url="https://example.com/reference",
                ),
                session,
                db,
            )
            short_id = uuid.UUID(short["id"])
            assert short["summary"] == "짧게보기 검색 본문 두 번째 문장"
            assert short["content_format"] == "markdown"
            assert short["content_density"] == "compact"
            assert short["is_featured"] is False
            assert short["thumbnail_type"] == "preset"
            assert short["thumbnail_url"] is None
            assert short["short_category"] == "tip"

            statements.clear()
            short_page = main.public_posts(short_category=None, category="short", q=None, home=False, page=1, page_size=20, db=db)
            assert [item["id"] for item in short_page["items"]] == [short["id"]]
            assert short_page["items"][0]["body_markdown"] == "짧게보기 검색 본문\n두 번째 문장"
            assert sum(" from posts" in statement for statement in statements) == 1
            assert sum(" from post_likes" in statement for statement in statements) == 1
            assert sum(" from comments" in statement for statement in statements) == 1
            assert sum(" from admin_users" in statement for statement in statements) == 1
            statements.clear()
            filtered_short_page = main.public_posts(short_category="tip", category="short", q=None, home=False, page=1, page_size=20, db=db)
            assert [item["id"] for item in filtered_short_page["items"]] == [short["id"]]

            home_short = main.public_posts(short_category=None, category="short", q=None, home=True, page=1, page_size=5, db=db)
            assert [item["id"] for item in home_short["items"]] == [short["id"]]
            article_home = main.public_posts(short_category=None, category=None, q=None, home=True, page=1, page_size=100, db=db)
            assert short["id"] not in {item["id"] for item in article_home["items"]}
            user_updated = main.update_user_post(
                short_id,
                post_input(category="short", short_category="tip", title="짧게보기 검색 제목", body_markdown="짧게보기 검색 본문\n두 번째 문장", topics=["AI/검색"], show_on_home=False),
                session,
                db,
            )
            assert user_updated["show_on_home"] is False

            for query in ("검색 제목", "두 번째 문장", "검색 본문", "#AI"): 
                result = main.public_posts(short_category=None, category=None, q=query, home=False, page=1, page_size=20, db=db)
                assert short["id"] in {item["id"] for item in result["items"]}

            assert main.like_post(short_id, session, db) == {"liked": True, "likes": 1}
            assert main.like_post(short_id, session, db) == {"liked": True, "likes": 1}
            assert main.community_status(short["slug"], session, db)["liked"] is True
            assert main.unlike_post(short_id, session, db) == {"liked": False, "likes": 0}

            assert main.bookmark_post(short_id, session, db) == {"bookmarked": True}
            assert main.community_status(short["slug"], session, db)["bookmarked"] is True
            assert main.unbookmark_post(short_id, session, db) == {"bookmarked": False}

            comment = main.create_comment(short_id, main.CommentInput(body="짧게보기 댓글"), session, db)
            assert comment["body"] == "짧게보기 댓글"
            assert [item["body"] for item in main.list_comments(short_id, session, db)["items"]] == ["짧게보기 댓글"]

            with pytest.raises(HTTPException) as thumbnail_error:
                main.upload_thumbnail(short_id, None, session, db)
            assert thumbnail_error.value.status_code == 400
            with pytest.raises(HTTPException) as attachment_error:
                main.upload_attachments(short_id, [], session, db)
            assert attachment_error.value.status_code == 400
            with pytest.raises(HTTPException) as featured_error:
                main.set_featured(short_id, session, db)
            assert featured_error.value.status_code == 400
            with pytest.raises(HTTPException) as conversion_error:
                main.update_post(short_id, post_input(category="news"), session, db)
            assert conversion_error.value.status_code == 400

            for category in ("news", "learn", "use", "together"):
                article = main.create_post(post_input(category=category, title=f"{category} 회귀 테스트"), session, db)
                article_id = uuid.UUID(article["id"])
                page = main.public_posts(short_category=None, category=category, q=None, home=False, page=1, page_size=100, db=db)
                assert article["id"] in {item["id"] for item in page["items"]}
                detail = main.public_post(article["slug"], session, db)
                assert detail["category"] == category
                updated = main.update_post(article_id, post_input(category=category, title=f"{category} 수정 완료"), session, db)
                assert updated["title"] == f"{category} 수정 완료"

            main.delete_post(short_id, session, db)
            assert short["id"] not in {item["id"] for item in main.public_posts(short_category=None, category="short", q=None, home=False, page=1, page_size=20, db=db)["items"]}
            assert short["id"] not in {item["id"] for item in main.public_posts(short_category=None, category=None, q="검색 제목", home=False, page=1, page_size=20, db=db)["items"]}
            with pytest.raises(HTTPException) as deleted_error:
                main.public_post(short["slug"], session, db)
            assert deleted_error.value.status_code == 404
        finally:
            db.close()
            transaction.rollback()
            event.remove(engine, "before_cursor_execute", record_statement)
