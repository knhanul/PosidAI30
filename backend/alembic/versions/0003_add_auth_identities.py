"""Add external authentication identities for linked Kakao accounts."""

from alembic import op
import sqlalchemy as sa

revision = "0003_auth_identities"
down_revision = "0002_show_on_home"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_identities",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_subject", sa.String(length=160), nullable=False),
        sa.Column("provider_nickname", sa.String(length=120), nullable=True),
        sa.Column("profile_image_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_auth_identities_provider_subject"),
    )
    op.create_index("ix_auth_identities_user_id", "auth_identities", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_identities_user_id", table_name="auth_identities")
    op.drop_table("auth_identities")
