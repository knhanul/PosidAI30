import sqlalchemy as sa
from alembic import op

revision = "0011_add_content_density"
down_revision = "0010_together_ai_repository"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("content_density", sa.String(20), nullable=False, server_default="normal"))


def downgrade() -> None:
    op.drop_column("posts", "content_density")
