CREATE TABLE `currency_strength_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matrixJson` text NOT NULL,
	`economicSummariesJson` text,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `currency_strength_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_ai_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custom_ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `custom_ai_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT '新对话',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_ai_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imap_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`password` text NOT NULL,
	`host` varchar(255) NOT NULL DEFAULT 'imap.163.com',
	`port` int NOT NULL DEFAULT 993,
	`tls` boolean NOT NULL DEFAULT true,
	`active` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imap_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mt4_tf_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`timeframe` varchar(8) NOT NULL,
	`barTime` timestamp NOT NULL,
	`signal` enum('buy','sell') NOT NULL,
	`pushedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt4_tf_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mt4_tw_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(16) NOT NULL,
	`timeframe` varchar(8) NOT NULL,
	`barTime` timestamp NOT NULL,
	`bull` varchar(24) NOT NULL,
	`bear` varchar(24) NOT NULL,
	`threshold` varchar(24),
	`pushedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mt4_tw_values_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notify_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`toEmail` varchar(320),
	`smtpHost` varchar(255),
	`smtpPort` int DEFAULT 465,
	`smtpSecure` boolean DEFAULT true,
	`smtpUser` varchar(320),
	`smtpPass` varchar(512),
	`feishuEnabled` boolean NOT NULL DEFAULT false,
	`feishuWebhookUrl` varchar(1024),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notify_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signal_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`decision` enum('execute','watch','ignore') NOT NULL,
	`confidence` int NOT NULL DEFAULT 50,
	`summary` text NOT NULL,
	`reasoning` text NOT NULL,
	`marketContext` text,
	`riskWarning` text,
	`analyzedAt` timestamp NOT NULL DEFAULT (now()),
	`notified` boolean NOT NULL DEFAULT false,
	CONSTRAINT `signal_analyses_id` PRIMARY KEY(`id`),
	CONSTRAINT `signal_analyses_signalId_unique` UNIQUE(`signalId`)
);
--> statement-breakpoint
CREATE TABLE `trading_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT '未命名对话',
	`content` text NOT NULL,
	`tags` varchar(500),
	`conversationDate` date,
	`source` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tradingview_news` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`link` varchar(1024) NOT NULL,
	`description` text,
	`publishedAt` timestamp NOT NULL,
	`source` varchar(255) NOT NULL DEFAULT 'TradingView',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tradingview_news_id` PRIMARY KEY(`id`),
	CONSTRAINT `tradingview_news_link_unique` UNIQUE(`link`)
);
--> statement-breakpoint
CREATE TABLE `tv_idea_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tvIdeaId` int NOT NULL,
	`decision` enum('execute','watch','ignore') NOT NULL,
	`confidence` int NOT NULL,
	`summary` varchar(200),
	`reasoning` text,
	`marketContext` text,
	`riskWarning` text,
	`notified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tv_idea_analyses_id` PRIMARY KEY(`id`),
	CONSTRAINT `tv_idea_analyses_tvIdeaId_unique` UNIQUE(`tvIdeaId`)
);
--> statement-breakpoint
CREATE TABLE `user_api_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiUrl` varchar(512) NOT NULL,
	`apiKey` varchar(512) NOT NULL,
	`model` varchar(128) NOT NULL DEFAULT 'gpt-4o',
	`temperature` varchar(16) DEFAULT '0.7',
	`maxTokens` int DEFAULT 4096,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_api_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_api_configs_userId_unique` UNIQUE(`userId`)
);
