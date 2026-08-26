"""Add display name confirmation state."""

from alembic import op
import sqlalchemy as sa

revision = "0006_display_name_confirmation"
down_revision = "0005_user_community"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("display_name_confirmed", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("admin_users", sa.Column("display_name_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            "UPDATE admin_users SET display_name_confirmed = false "
            "WHERE display_name IN ('Kakao 사용자', '카카오 사용자')"
        )
    )
    op.alter_column("admin_users", "display_name_confirmed", server_default=None)


def downgrade() -> None:
    op.drop_column("admin_users", "display_name_updated_at")
    op.drop_column("admin_users", "display_name_confirmed")
