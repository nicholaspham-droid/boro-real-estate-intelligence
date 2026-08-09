ALTER TABLE `review_feedback` ADD `feature_area` text DEFAULT 'overall' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `failure_modes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `reviewer_intent` text DEFAULT 'maybe' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `triage_status` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `impact_lane` text DEFAULT 'untriaged' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_review_feedback_created_at` ON `review_feedback` (`created_at`);