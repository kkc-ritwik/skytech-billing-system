ALTER TABLE `stock_ledger` ADD `batch_no` text;--> statement-breakpoint
ALTER TABLE `stock_ledger` ADD `expiry_date` integer;--> statement-breakpoint
ALTER TABLE `sales_document_lines` ADD `batch_no` text;--> statement-breakpoint
ALTER TABLE `sales_document_lines` ADD `expiry_date` integer;--> statement-breakpoint
ALTER TABLE `purchase_document_lines` ADD `batch_no` text;--> statement-breakpoint
ALTER TABLE `purchase_document_lines` ADD `expiry_date` integer;