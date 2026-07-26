ALTER TABLE `items` ADD `cut_length` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `packing` text;--> statement-breakpoint
CREATE UNIQUE INDEX `item_barcode_uq` ON `items` (`barcode`);--> statement-breakpoint
ALTER TABLE `sales_document_lines` ADD `cut_length` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_document_lines` ADD `packing` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `scheme_label` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `scheme_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `scheme_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `challan_no` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `order_no` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `agent_name` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `consignee_name` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `consignee_gstin` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `lr_no` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `lr_date` integer;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `transport_name` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `transport_station` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `case_no` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `weight` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `freight` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `eway_bill_no` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `transporter_id` text;--> statement-breakpoint
ALTER TABLE `sales_documents` ADD `due_days` integer DEFAULT 0 NOT NULL;