CREATE TABLE `trade_companion_debates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companionId` int NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`content` longtext NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `insights` ADD `forexCommentary` text;--> statement-breakpoint
ALTER TABLE `trade_companion_debates` ADD CONSTRAINT `trade_companion_debates_companionId_trade_companions_id_fk` FOREIGN KEY (`companionId`) REFERENCES `trade_companions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `tcd_companionId_idx` ON `trade_companion_debates` (`companionId`);--> statement-breakpoint
CREATE INDEX `tcd_userId_idx` ON `trade_companion_debates` (`user_id`);--> statement-breakpoint
ALTER TABLE `insights` DROP COLUMN `energy`;--> statement-breakpoint
ALTER TABLE `insights` DROP COLUMN `forex`;--> statement-breakpoint
ALTER TABLE `insights` DROP COLUMN `assets`;