"""Track persistent authentication sessions."""

from alembic import op
import sqlalchemy as sa

revision = "0007_persistent_sessions"
down_revision = "0006_display_name_confirmation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_sessions", sa.Column("is_persistent", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("admin_sessions", "is_persistent", server_default=None)


def downgrade() -> None:
    op.drop_column("admin_sessions", "is_persistent")
