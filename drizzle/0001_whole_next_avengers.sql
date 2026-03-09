CREATE TABLE `insights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`summary` text NOT NULL,
	`geopolitics` text,
	`energy` text,
	`forex` text,
	`assets` text,
	`tradingAdvice` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `insights_id` PRIMARY KEY(`id`),
	CONSTRAINT `insights_date_unique` UNIQUE(`date`)
);
--> statement-breakpoint
CREATE TABLE `news` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`link` varchar(1024) NOT NULL,
	`description` text,
	`publishedAt` timestamp NOT NULL,
	`source` enum('News','Analysis') NOT NULL DEFAULT 'News',
	`author` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `news_id` PRIMARY KEY(`id`),
	CONSTRAINT `news_link_unique` UNIQUE(`link`)
);
--> statement-breakpoint
CREATE TABLE `outlooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`currency` varchar(10) NOT NULL,
	`outlook` text NOT NULL,
	`sentiment` enum('bullish','bearish','neutral') NOT NULL DEFAULT 'neutral',
	`riskLabel` varchar(50),
	`sourceLink` varchar(1024),
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outlooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`userId` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_email_unique` UNIQUE(`email`)
);
