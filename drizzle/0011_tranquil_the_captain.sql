CREATE TABLE `system_health_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`run_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`overall_status` enum('ok','warn','error') NOT NULL,
	`checks_json` text NOT NULL,
	`summary` text NOT NULL,
	`duration_ms` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `trade_companion_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companion_id` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `trade_companions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`direction` enum('buy','sell') NOT NULL,
	`entryPrice` varchar(32) NOT NULL,
	`stopLoss` varchar(32),
	`takeProfit` varchar(32),
	`tradeRationale` text,
	`scenarios_json` text,
	`scenarios_generated_at` timestamp,
	`exitPrice` varchar(32),
	`exit_rationale` text,
	`lessons_learned` text,
	`pnlPips` varchar(32),
	`pnlPercent` varchar(32),
	`reviewed_at` timestamp,
	`signal_id` int,
	`status` enum('active','closed','cancelled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
DROP INDEX `idx_symbol_bartime` ON `mt4_bars`;--> statement-breakpoint
ALTER TABLE `mt4_bars` ADD CONSTRAINT `uniq_symbol_tf_bartime` UNIQUE(`symbol`,`timeframe`,`barTime`);--> statement-breakpoint
CREATE INDEX `tcm_companionId_idx` ON `trade_companion_messages` (`companion_id`);--> statement-breakpoint
CREATE INDEX `tc_userId_idx` ON `trade_companions` (`userId`);--> statement-breakpoint
CREATE INDEX `tc_symbol_idx` ON `trade_companions` (`symbol`);--> statement-breakpoint
CREATE INDEX `tc_status_idx` ON `trade_companions` (`status`);