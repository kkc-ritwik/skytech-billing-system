ALTER TABLE `purchase_documents` ADD `scheme_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_documents` ADD `scheme_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_documents` ADD `batch_no` text;