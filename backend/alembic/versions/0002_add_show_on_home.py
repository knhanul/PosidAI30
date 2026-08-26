"""Add home visibility to posts without changing existing publication status."""

from alembic import op
import sqlalchemy as sa

revision = "0002_show_on_home"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("show_on_home", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute(sa.text("UPDATE posts SET is_featured = false WHERE show_on_home = false"))
    op.alter_column("posts", "show_on_home", server_default=None)


def downgrade() -> None:
    op.drop_column("posts", "show_on_home")
