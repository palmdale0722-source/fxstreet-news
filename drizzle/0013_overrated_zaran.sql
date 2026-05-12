CREATE TABLE `price_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`companion_id` int,
	`symbol` varchar(20) NOT NULL,
	`target_price` varchar(32) NOT NULL,
	`condition` enum('above','below') NOT NULL,
	`note` varchar(255),
	`status` enum('pending','triggered','cancelled') NOT NULL DEFAULT 'pending',
	`triggered_at` timestamp,
	`triggered_price` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `pa_userId_idx` ON `price_alerts` (`user_id`);--> statement-breakpoint
CREATE INDEX `pa_symbol_idx` ON `price_alerts` (`symbol`);--> statement-breakpoint
CREATE INDEX `pa_status_idx` ON `price_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `pa_companionId_idx` ON `price_alerts` (`companion_id`);