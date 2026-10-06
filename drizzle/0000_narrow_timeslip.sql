CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`payload` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`service_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`date` text NOT NULL,
	`start_minute` integer NOT NULL,
	`duration` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_request` ON `appointments` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `appointments_calendar` ON `appointments` (`owner`,`date`,`status`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`transcript` text DEFAULT '[]' NOT NULL,
	`outcome` text DEFAULT 'Conversation' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calls_owner_date` ON `calls` (`owner`,`started_at`);--> statement-breakpoint
CREATE TABLE `occupied_slots` (
	`owner` text NOT NULL,
	`staff_id` text NOT NULL,
	`date` text NOT NULL,
	`minute` integer NOT NULL,
	`appointment_id` text NOT NULL,
	PRIMARY KEY(`owner`, `staff_id`, `date`, `minute`),
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slots_appointment` ON `occupied_slots` (`appointment_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
