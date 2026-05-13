CREATE TABLE `trade_companion_debates` (
`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
`companion_id` integer NOT NULL,
`user_id` text NOT NULL,
`content` text NOT NULL,
`created_at` integer NOT NULL,
FOREIGN KEY (`companion_id`) REFERENCES `trade_companions`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tcd_companionId_idx` ON `trade_companion_debates` (`companion_id`);
--> statement-breakpoint
CREATE INDEX `tcd_userId_idx` ON `trade_companion_debates` (`user_id`);
