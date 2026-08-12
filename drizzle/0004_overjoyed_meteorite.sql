CREATE TABLE `roadmap_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`title` text NOT NULL,
	`business_case` text DEFAULT 'overall' NOT NULL,
	`notes` text NOT NULL,
	`next_action` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`horizon` text DEFAULT 'next' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_roadmap_notes_owner_horizon_updated` ON `roadmap_notes` (`owner_key`,`horizon`,`updated_at`);