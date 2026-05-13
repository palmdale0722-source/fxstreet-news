CREATE TABLE `signal_alerts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`monitorId` bigint NOT NULL,
	`checkpointId` bigint NOT NULL,
	`pair` varchar(20) NOT NULL,
	`userId` bigint NOT NULL,
	`alertType` enum('breakout_confirmed','indicator_confirmed','final_confirmed','expired','manual_cancel') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`email_sent` boolean NOT NULL DEFAULT false,
	`push_sent` boolean NOT NULL DEFAULT false,
	`email_sent_at` timestamp,
	`push_sent_at` timestamp,
	`userAction` enum('acknowledged','ignored','entered','cancelled') DEFAULT 'ignored',
	`action_time` timestamp,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	CONSTRAINT `signal_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_monitor_checkpoints` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`monitorId` bigint NOT NULL,
	`pair` varchar(20) NOT NULL,
	`entry_price` decimal(20,8),
	`breakout_level` decimal(20,8),
	`confirmation_level` decimal(20,8),
	`rsi_value` decimal(5,2),
	`macd_value` decimal(10,4),
	`macd_signal` decimal(10,4),
	`bb_upper` decimal(20,8),
	`bb_lower` decimal(20,8),
	`is_breakout_confirmed` boolean NOT NULL DEFAULT false,
	`is_indicator_confirmed` boolean NOT NULL DEFAULT false,
	`is_final_confirmed` boolean NOT NULL DEFAULT false,
	`checkpoint_time` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`confirmation_time` timestamp,
	CONSTRAINT `signal_monitor_checkpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_monitors` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`originalSignalId` bigint NOT NULL,
	`userId` bigint NOT NULL,
	`status` enum('monitoring','confirmed','cancelled','expired') NOT NULL DEFAULT 'monitoring',
	`monitoredPairs` json NOT NULL,
	`confirmationStrategy` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`expires_at` timestamp,
	`confirmed_at` timestamp,
	`monitoringLog` json,
	`confirmationDetails` json,
	CONSTRAINT `signal_monitors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sa_monitorId_idx` ON `signal_alerts` (`monitorId`);--> statement-breakpoint
CREATE INDEX `sa_userId_createdAt_idx` ON `signal_alerts` (`userId`,`created_at`);--> statement-breakpoint
CREATE INDEX `smc_monitorId_pair_idx` ON `signal_monitor_checkpoints` (`monitorId`,`pair`);--> statement-breakpoint
CREATE INDEX `sm_userId_status_idx` ON `signal_monitors` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `sm_originalSignalId_idx` ON `signal_monitors` (`originalSignalId`);