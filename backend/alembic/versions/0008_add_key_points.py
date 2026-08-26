"""Add optional home key points without changing existing posts."""

from alembic import op
import sqlalchemy as sa

revision = "0008_add_key_points"
down_revision = "0007_persistent_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("key_points", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.alter_column("posts", "key_points", server_default=None)


def downgrade() -> None:
    op.drop_column("posts", "key_points")
