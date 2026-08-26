"""Add one-time OAuth state storage."""

from alembic import op
import sqlalchemy as sa

revision = "0004_oauth_states"
down_revision = "0003_auth_identities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_states",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("intent", sa.String(length=20), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index("ix_oauth_states_state_hash", "oauth_states", ["state_hash"])
    op.create_index("ix_oauth_states_expires_at", "oauth_states", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_oauth_states_expires_at", table_name="oauth_states")
    op.drop_index("ix_oauth_states_state_hash", table_name="oauth_states")
    op.drop_table("oauth_states")
