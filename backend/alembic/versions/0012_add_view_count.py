import sqlalchemy as sa
from alembic import op

revision = "0012_add_view_count"
down_revision = "0011_add_content_density"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("view_count", sa.BigInteger(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("posts", "view_count")
