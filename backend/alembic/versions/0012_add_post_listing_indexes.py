import sqlalchemy as sa
from alembic import op

revision = "0012_add_post_listing_indexes"
down_revision = "0011_add_content_density"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 공개 글 목록 조회: WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC
    op.create_index(
        "ix_posts_listing",
        "posts",
        ["status", "deleted_at", "published_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # 홈 노출 글 목록 조회
    op.create_index(
        "ix_posts_home_listing",
        "posts",
        ["show_on_home", "status", "published_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # 관리자 목록 조회: ORDER BY updated_at DESC
    op.create_index("ix_posts_updated_at", "posts", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_posts_updated_at", table_name="posts")
    op.drop_index("ix_posts_home_listing", table_name="posts")
    op.drop_index("ix_posts_listing", table_name="posts")
