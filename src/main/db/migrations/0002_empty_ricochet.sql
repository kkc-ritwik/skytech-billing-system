ALTER TABLE `sales_documents` ADD `extra_charges_label` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `extra_charges` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `extra_discount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_documents` ADD `extra_charges_label` text;--> statement-breakpoint
ALTER TABLE `purchase_documents` ADD `extra_charges` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_documents` ADD `extra_discount` integer DEFAULT 0 NOT NULL;