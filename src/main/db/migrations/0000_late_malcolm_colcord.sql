CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`details` text,
	`ip_or_host` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'operator' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`gstin` text,
	`pan` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`state_code` text,
	`pincode` text,
	`country` text DEFAULT 'India' NOT NULL,
	`phone` text,
	`email` text,
	`website` text,
	`logo_path` text,
	`bank_name` text,
	`bank_account_no` text,
	`bank_ifsc` text,
	`bank_branch` text,
	`upi_id` text,
	`default_terms` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`financial_year_id` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`padding` integer DEFAULT 4 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`financial_year_id`) REFERENCES `financial_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doc_seq_uq` ON `document_sequences` (`doc_type`,`financial_year_id`);--> statement-breakpoint
CREATE TABLE `financial_years` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`is_closed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fy_label_uq` ON `financial_years` (`label`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`party_type` text DEFAULT 'customer' NOT NULL,
	`name` text NOT NULL,
	`display_code` text,
	`gstin` text,
	`pan` text,
	`contact_person` text,
	`phone` text,
	`email` text,
	`billing_address_line1` text,
	`billing_address_line2` text,
	`billing_city` text,
	`billing_state` text,
	`billing_state_code` text,
	`billing_pincode` text,
	`shipping_address_line1` text,
	`shipping_address_line2` text,
	`shipping_city` text,
	`shipping_state` text,
	`shipping_pincode` text,
	`credit_limit` integer DEFAULT 0 NOT NULL,
	`credit_days` integer DEFAULT 0 NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_balance_at` integer,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `parties_type_idx` ON `parties` (`party_type`);--> statement-breakpoint
CREATE INDEX `parties_name_idx` ON `parties` (`name`);--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category_id` text,
	`unit_id` text,
	`hsn_code` text,
	`tax_rate_id` text,
	`purchase_price` integer DEFAULT 0 NOT NULL,
	`selling_price` integer DEFAULT 0 NOT NULL,
	`selling_price_is_inclusive` integer DEFAULT false NOT NULL,
	`track_inventory` integer DEFAULT true NOT NULL,
	`reorder_level` real DEFAULT 0 NOT NULL,
	`opening_stock` real DEFAULT 0 NOT NULL,
	`opening_stock_value` integer DEFAULT 0 NOT NULL,
	`barcode` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_sku_uq` ON `items` (`sku`);--> statement-breakpoint
CREATE INDEX `item_name_idx` ON `items` (`name`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_rate_uq` ON `tax_rates` (`rate_bps`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_symbol_uq` ON `units` (`symbol`);--> statement-breakpoint
CREATE TABLE `stock_adjustment_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_id` text NOT NULL,
	`item_id` text NOT NULL,
	`qty_delta` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`adjustment_id`) REFERENCES `stock_adjustments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_adj_line_idx` ON `stock_adjustment_lines` (`adjustment_id`);--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`adjusted_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`qty_delta` real NOT NULL,
	`unit_cost` integer DEFAULT 0 NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`ref_number` text,
	`note` text,
	`occurred_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_ledger_item_idx` ON `stock_ledger` (`item_id`);--> statement-breakpoint
CREATE INDEX `stock_ledger_ref_idx` ON `stock_ledger` (`ref_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `sales_document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`item_id` text,
	`description` text NOT NULL,
	`hsn_code` text,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	`discount_pct` integer DEFAULT 0 NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`taxable_value` integer DEFAULT 0 NOT NULL,
	`cgst_amount` integer DEFAULT 0 NOT NULL,
	`sgst_amount` integer DEFAULT 0 NOT NULL,
	`igst_amount` integer DEFAULT 0 NOT NULL,
	`cess_amount` integer DEFAULT 0 NOT NULL,
	`line_total` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `sales_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_line_doc_idx` ON `sales_document_lines` (`document_id`);--> statement-breakpoint
CREATE TABLE `sales_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`number` text NOT NULL,
	`party_id` text NOT NULL,
	`parent_id` text,
	`issue_date` integer NOT NULL,
	`due_date` integer,
	`reference_no` text,
	`place_of_supply` text,
	`is_inter_state` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sub_total` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`cgst_total` integer DEFAULT 0 NOT NULL,
	`sgst_total` integer DEFAULT 0 NOT NULL,
	`igst_total` integer DEFAULT 0 NOT NULL,
	`cess_total` integer DEFAULT 0 NOT NULL,
	`round_off` integer DEFAULT 0 NOT NULL,
	`grand_total` integer DEFAULT 0 NOT NULL,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`notes` text,
	`terms` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_doc_num_uq` ON `sales_documents` (`doc_type`,`number`);--> statement-breakpoint
CREATE INDEX `sales_doc_party_idx` ON `sales_documents` (`party_id`);--> statement-breakpoint
CREATE INDEX `sales_doc_type_idx` ON `sales_documents` (`doc_type`);--> statement-breakpoint
CREATE INDEX `sales_doc_date_idx` ON `sales_documents` (`issue_date`);--> statement-breakpoint
CREATE TABLE `purchase_document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`item_id` text,
	`description` text NOT NULL,
	`hsn_code` text,
	`quantity` real NOT NULL,
	`unit_price` integer NOT NULL,
	`discount_pct` integer DEFAULT 0 NOT NULL,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`taxable_value` integer DEFAULT 0 NOT NULL,
	`cgst_amount` integer DEFAULT 0 NOT NULL,
	`sgst_amount` integer DEFAULT 0 NOT NULL,
	`igst_amount` integer DEFAULT 0 NOT NULL,
	`cess_amount` integer DEFAULT 0 NOT NULL,
	`line_total` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `purchase_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_line_doc_idx` ON `purchase_document_lines` (`document_id`);--> statement-breakpoint
CREATE TABLE `purchase_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`number` text NOT NULL,
	`party_id` text NOT NULL,
	`parent_id` text,
	`issue_date` integer NOT NULL,
	`due_date` integer,
	`supplier_invoice_no` text,
	`supplier_invoice_date` integer,
	`is_inter_state` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`sub_total` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`cgst_total` integer DEFAULT 0 NOT NULL,
	`sgst_total` integer DEFAULT 0 NOT NULL,
	`igst_total` integer DEFAULT 0 NOT NULL,
	`cess_total` integer DEFAULT 0 NOT NULL,
	`round_off` integer DEFAULT 0 NOT NULL,
	`grand_total` integer DEFAULT 0 NOT NULL,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_doc_num_uq` ON `purchase_documents` (`doc_type`,`number`);--> statement-breakpoint
CREATE INDEX `purchase_doc_party_idx` ON `purchase_documents` (`party_id`);--> statement-breakpoint
CREATE INDEX `purchase_doc_type_idx` ON `purchase_documents` (`doc_type`);--> statement-breakpoint
CREATE INDEX `purchase_doc_date_idx` ON `purchase_documents` (`issue_date`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`ref_type` text NOT NULL,
	`document_id` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alloc_payment_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `alloc_doc_idx` ON `payment_allocations` (`document_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`direction` text NOT NULL,
	`party_id` text NOT NULL,
	`amount` integer NOT NULL,
	`allocated_amount` integer DEFAULT 0 NOT NULL,
	`paid_at` integer NOT NULL,
	`mode` text NOT NULL,
	`reference_no` text,
	`bank_account` text,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_num_uq` ON `payments` (`number`);--> statement-breakpoint
CREATE INDEX `payment_party_idx` ON `payments` (`party_id`);--> statement-breakpoint
CREATE INDEX `payment_dir_idx` ON `payments` (`direction`);--> statement-breakpoint
CREATE TABLE `license_state` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`machine_fingerprint` text NOT NULL,
	`trial_started_at` integer,
	`trial_ends_at` integer,
	`license_key` text,
	`licensed_to` text,
	`activated_at` integer,
	`expires_at` integer,
	`edition` text,
	`last_seen_at` integer,
	`updated_at` integer NOT NULL
);
