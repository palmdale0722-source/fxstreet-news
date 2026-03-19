CREATE TABLE `mt4_indicator_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorName` varchar(128) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`indicatorType` enum('trend','oscillator','volume','custom') DEFAULT 'custom',
	`params` text,
	`interpretation` text NOT NULL,
	`bufferIndex` int DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mt4_indicator_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `mt4_indicator_configs_indicatorName_unique` UNIQUE(`indicatorName`)
);
--> statement-breakpoint
CREATE TABLE `mt4_indicator_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`indicatorName` varchar(128) NOT NULL,
	`value1` text,
	`value2` text,
	`value3` text,
	`signal` enum('buy','sell','neutral','overbought','oversold') DEFAULT 'neutral',
	`description` text,
	`pushedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt4_indicator_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_journal` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`pair` varchar(20) NOT NULL,
	`direction` enum('buy','sell') NOT NULL,
	`entryPrice` text NOT NULL,
	`exitPrice` text,
	`stopLoss` text,
	`takeProfit` text,
	`lotSize` text,
	`pnl` text,
	`openTime` timestamp NOT NULL,
	`closeTime` timestamp,
	`status` enum('open','closed','cancelled') NOT NULL DEFAULT 'closed',
	`summary` text,
	`lesson` text,
	`tags` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trade_journal_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_system` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('philosophy','methodology','entry_rules','exit_rules','risk_management','pairs_preference','session_preference','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_system_id` PRIMARY KEY(`id`)
);
