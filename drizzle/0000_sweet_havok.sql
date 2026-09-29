CREATE TABLE `login_attempts` (
	`address_hash` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`last_attempt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`performer` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_number_unique` ON `songs` (`number`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`song_id` integer NOT NULL,
	`device_hash` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_vote_per_device_song` ON `votes` (`song_id`,`device_hash`);