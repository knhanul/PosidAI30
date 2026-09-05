import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014_topics_jsonb"
down_revision = "0013_add_view_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "posts",
        "topics",
        existing_type=sa.JSON(),
        type_=JSONB(),
        existing_nullable=False,
        postgresql_using="topics::jsonb",
    )
    op.alter_column(
        "posts",
        "key_points",
        existing_type=sa.JSON(),
        type_=JSONB(),
        existing_nullable=False,
        postgresql_using="key_points::jsonb",
    )


def downgrade() -> None:
    op.alter_column(
        "posts",
        "topics",
        existing_type=JSONB(),
        type_=sa.JSON(),
        existing_nullable=False,
        postgresql_using="topics::json",
    )
    op.alter_column(
        "posts",
        "key_points",
        existing_type=JSONB(),
        type_=sa.JSON(),
        existing_nullable=False,
        postgresql_using="key_points::json",
    )
