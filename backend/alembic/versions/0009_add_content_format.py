from alembic import op
import sqlalchemy as sa

revision = "0009_add_content_format"
down_revision = "0008_add_key_points"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("content_format", sa.String(20), nullable=False, server_default="markdown"))
    op.alter_column("posts", "content_format", server_default=None)


def downgrade() -> None:
    op.drop_column("posts", "content_format")
