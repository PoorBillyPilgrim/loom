CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`listener_id` text NOT NULL,
	`kind` text NOT NULL,
	`external_account_id` text NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`access_token_expires_at` integer,
	`refresh_token_issued_at` integer,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`listener_id`) REFERENCES `listeners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_listener_kind_unique` ON `connections` (`listener_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_kind_account_unique` ON `connections` (`kind`,`external_account_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`email` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listeners` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listeners_google_sub_unique` ON `listeners` (`google_sub`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`listener_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listener_id`) REFERENCES `listeners`(`id`) ON UPDATE no action ON DELETE cascade
);
