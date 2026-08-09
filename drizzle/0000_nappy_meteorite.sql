CREATE TABLE `review_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`reviewer_name` text,
	`reviewer_email` text,
	`usefulness` integer NOT NULL,
	`trust` integer NOT NULL,
	`clarity` integer NOT NULL,
	`most_valuable` text NOT NULL,
	`confusing` text NOT NULL,
	`next_feature` text NOT NULL,
	`notes` text,
	`source_path` text
);
