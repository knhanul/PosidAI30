import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  contentFormat: text("content_format").notNull().default("markdown"),
  topicsJson: text("topics_json").notNull().default("[]"),
  keyPointsJson: text("key_points_json").notNull().default("[]"),
  status: text("status").notNull().default("draft"),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
  showOnHome: integer("show_on_home", { mode: "boolean" }).notNull().default(true),
  thumbnailType: text("thumbnail_type").notNull().default("preset"),
  thumbnailKey: text("thumbnail_key"),
  thumbnailFilename: text("thumbnail_filename"),
  thumbnailContentType: text("thumbnail_content_type"),
  serviceStatus: text("service_status"),
  serviceAudience: text("service_audience"),
  serviceUrl: text("service_url"),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
  deletedAt: text("deleted_at"),
}, (table) => [
  uniqueIndex("posts_slug_unique").on(table.slug),
  index("posts_status_idx").on(table.status),
  index("posts_category_idx").on(table.category),
  index("posts_updated_at_idx").on(table.updatedAt),
]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("attachments_post_id_idx").on(table.postId)]);

export const authSessions = sqliteTable("auth_sessions", {
  email: text("email").primaryKey(),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("audit_logs_created_at_idx").on(table.createdAt)]);
