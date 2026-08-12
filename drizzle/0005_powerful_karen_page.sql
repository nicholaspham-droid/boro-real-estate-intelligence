CREATE TABLE `priority_roadmap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`seed_key` text,
	`title` text NOT NULL,
	`business_case` text NOT NULL,
	`description` text NOT NULL,
	`next_action` text,
	`stage` text DEFAULT 'queue' NOT NULL,
	`estimated_tokens` integer NOT NULL,
	`impact` integer NOT NULL,
	`urgency` integer NOT NULL,
	`evidence` integer NOT NULL,
	`delivery_risk` integer NOT NULL,
	`feedback_bucket` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_priority_roadmap_owner_seed` ON `priority_roadmap_items` (`owner_key`,`seed_key`);--> statement-breakpoint
CREATE INDEX `idx_priority_roadmap_owner_stage_updated` ON `priority_roadmap_items` (`owner_key`,`stage`,`updated_at`);