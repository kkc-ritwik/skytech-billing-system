CREATE TABLE `salespersons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`code` text,
	`incentive_bps` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `salesperson_name_idx` ON `salespersons` (`name`);--> statement-breakpoint
ALTER TABLE `parties` ADD `date_of_birth` integer;--> statement-breakpoint
ALTER TABLE `parties` ADD `anniversary_date` integer;