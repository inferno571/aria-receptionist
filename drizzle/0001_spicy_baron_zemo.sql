CREATE TABLE `usage_budgets` (
	`bucket` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`max_count` integer NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "usage_within_budget" CHECK("usage_budgets"."used" <= "usage_budgets"."max_count")
);
--> statement-breakpoint
CREATE INDEX `usage_expiry` ON `usage_budgets` (`expires_at`);--> statement-breakpoint
ALTER TABLE `calls` ADD `expires_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` ADD `permit_until` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` ADD `last_seen_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` ADD `key_source` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` ADD `token_state` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `calls_permits` ON `calls` (`key_source`,`permit_until`,`token_state`);