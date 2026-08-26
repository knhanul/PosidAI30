ALTER TABLE `posts` ADD `show_on_home` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `posts` SET `is_featured` = 0 WHERE `show_on_home` = 0;