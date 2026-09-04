import sqlalchemy as sa
from alembic import op

revision = "0013_add_view_count"
down_revision = "0012_add_post_listing_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("view_count", sa.BigInteger(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("posts", "view_count")
