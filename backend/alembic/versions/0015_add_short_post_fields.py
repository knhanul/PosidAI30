import sqlalchemy as sa
from alembic import op

revision = "0015_add_short_post_fields"
down_revision = "0014_topics_jsonb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("short_category", sa.String(length=20), nullable=True))
    op.add_column("posts", sa.Column("external_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "external_url")
    op.drop_column("posts", "short_category")
