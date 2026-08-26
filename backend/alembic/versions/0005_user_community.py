"""Add user roles and community data."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_user_community"
down_revision = "0004_oauth_states"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("role", sa.String(20), nullable=False, server_default="admin"))
    op.create_index("ix_admin_users_role", "admin_users", ["role"])
    op.alter_column("admin_users", "role", server_default=None)
    op.create_table(
        "post_likes",
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("post_id", "user_id"),
    )
    op.create_table(
        "bookmarks",
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("post_id", "user_id"),
    )
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_comments_post_id", "comments", ["post_id"])
    op.create_index("ix_comments_user_id", "comments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_comments_user_id", table_name="comments")
    op.drop_index("ix_comments_post_id", table_name="comments")
    op.drop_table("comments")
    op.drop_table("bookmarks")
    op.drop_table("post_likes")
    op.drop_index("ix_admin_users_role", table_name="admin_users")
    op.drop_column("admin_users", "role")
