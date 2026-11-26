CREATE TABLE `listeners` (
	`id` text PRIMARY KEY NOT NULL,
	`spotify_account_id` text NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`access_token_expires_at` integer,
	`refresh_token_issued_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listeners_spotify_account_id_unique` ON `listeners` (`spotify_account_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`listener_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listener_id`) REFERENCES `listeners`(`id`) ON UPDATE no action ON DELETE cascade
);
