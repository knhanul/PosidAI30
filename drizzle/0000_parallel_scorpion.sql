CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`filename` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_post_id_idx` ON `attachments` (`post_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`email` text PRIMARY KEY NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body_markdown` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`thumbnail_type` text DEFAULT 'preset' NOT NULL,
	`thumbnail_key` text,
	`thumbnail_filename` text,
	`thumbnail_content_type` text,
	`service_status` text,
	`service_audience` text,
	`service_url` text,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE INDEX `posts_status_idx` ON `posts` (`status`);--> statement-breakpoint
CREATE INDEX `posts_category_idx` ON `posts` (`category`);--> statement-breakpoint
CREATE INDEX `posts_updated_at_idx` ON `posts` (`updated_at`);