CREATE TABLE `attom_enrichment` (
	`property_key` text PRIMARY KEY NOT NULL,
	`property_id` text,
	`market_id` text NOT NULL,
	`normalized_address` text NOT NULL,
	`provider_status` text NOT NULL,
	`attom_id` text,
	`payload` text,
	`avm_value` real,
	`avm_low` real,
	`avm_high` real,
	`avm_confidence` real,
	`provider_modified_at` text,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`error_message` text,
	`api_call_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attom_enrichment_market` ON `attom_enrichment` (`market_id`);--> statement-breakpoint
CREATE INDEX `idx_attom_enrichment_expiry` ON `attom_enrichment` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_attom_enrichment_property` ON `attom_enrichment` (`property_id`);