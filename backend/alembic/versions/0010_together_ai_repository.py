import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_together_ai_repository"
down_revision = "0009_add_content_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("project_type", sa.String(40), nullable=False),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="private"),
        sa.Column("categories", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("platforms", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("icon_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("readme_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("readme_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column("view_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("download_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trash_path", sa.Text(), nullable=True),
    )
    op.create_index("ix_ai_projects_owner_id", "ai_projects", ["owner_id"])
    op.create_index("ix_ai_projects_slug", "ai_projects", ["slug"], unique=True)
    op.create_index("ix_ai_projects_name", "ai_projects", ["name"])
    op.create_index("ix_ai_projects_project_type", "ai_projects", ["project_type"])
    op.create_index("ix_ai_projects_visibility", "ai_projects", ["visibility"])
    op.create_index("ix_ai_projects_deleted_at", "ai_projects", ["deleted_at"])

    op.create_table(
        "ai_releases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
        sa.Column("version", sa.String(100), nullable=False),
        sa.Column("title", sa.String(180), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("release_date", sa.Date(), nullable=True),
        sa.Column("is_latest", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_prerelease", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("download_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trash_path", sa.Text(), nullable=True),
        sa.UniqueConstraint("project_id", "version", name="uq_ai_release_project_version"),
    )
    op.create_index("ix_ai_releases_project_id", "ai_releases", ["project_id"])
    op.create_index("ix_ai_releases_is_latest", "ai_releases", ["is_latest"])
    op.create_index("ix_ai_releases_deleted_at", "ai_releases", ["deleted_at"])
    op.create_index("uq_ai_releases_active_latest", "ai_releases", ["project_id"], unique=True, postgresql_where=sa.text("is_latest AND deleted_at IS NULL"))

    op.create_table(
        "ai_project_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("release_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_releases.id", ondelete="CASCADE"), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("admin_users.id"), nullable=False),
        sa.Column("file_kind", sa.String(20), nullable=False),
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("folder", sa.String(500), nullable=False, server_default=""),
        sa.Column("title", sa.String(200), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False, unique=True),
        sa.Column("content_type", sa.String(160), nullable=False, server_default="application/octet-stream"),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("download_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("trash_path", sa.Text(), nullable=True),
    )
    for name, columns in (("project_id", ["project_id"]), ("release_id", ["release_id"]), ("file_kind", ["file_kind"]), ("category", ["category"]), ("sha256", ["sha256"]), ("is_primary", ["is_primary"]), ("deleted_at", ["deleted_at"])):
        op.create_index(f"ix_ai_project_files_{name}", "ai_project_files", columns)

    op.create_table(
        "ai_project_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("link_type", sa.String(40), nullable=False, server_default="other"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_project_links_project_id", "ai_project_links", ["project_id"])

    op.create_table(
        "ai_file_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ai_project_files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("operation", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("source_path", sa.Text(), nullable=True),
        sa.Column("destination_path", sa.Text(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for name in ("project_id", "file_id", "actor_id", "operation", "status", "created_at"):
        op.create_index(f"ix_ai_file_events_{name}", "ai_file_events", [name])


def downgrade() -> None:
    op.drop_table("ai_file_events")
    op.drop_table("ai_project_links")
    op.drop_table("ai_project_files")
    op.drop_table("ai_releases")
    op.drop_table("ai_projects")
