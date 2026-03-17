CREATE TABLE `mt4_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL DEFAULT 'M15',
	`barTime` timestamp NOT NULL,
	`open` text NOT NULL,
	`high` text NOT NULL,
	`low` text NOT NULL,
	`close` text NOT NULL,
	`volume` text NOT NULL DEFAULT ('0'),
	`spread` int DEFAULT 0,
	`pushedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt4_bars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mt4_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`accountNumber` varchar(64),
	`broker` varchar(128),
	`symbolsCount` int DEFAULT 0,
	`lastPushedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt4_status_id` PRIMARY KEY(`id`),
	CONSTRAINT `mt4_status_clientId_unique` UNIQUE(`clientId`)
);
