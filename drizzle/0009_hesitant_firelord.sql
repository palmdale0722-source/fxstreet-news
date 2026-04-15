DROP TABLE `tradingview_news`;--> statement-breakpoint
ALTER TABLE `insights` DROP INDEX `insights_date_unique`;--> statement-breakpoint
ALTER TABLE `mt4_indicator_configs` DROP INDEX `mt4_indicator_configs_indicatorName_unique`;--> statement-breakpoint
ALTER TABLE `mt4_status` DROP INDEX `mt4_status_clientId_unique`;--> statement-breakpoint
ALTER TABLE `news` DROP INDEX `news_link_unique`;--> statement-breakpoint
ALTER TABLE `signal_analyses` DROP INDEX `signal_analyses_signalId_unique`;--> statement-breakpoint
ALTER TABLE `signals` DROP INDEX `signals_messageId_unique`;--> statement-breakpoint
ALTER TABLE `subscriptions` DROP INDEX `subscriptions_email_unique`;--> statement-breakpoint
ALTER TABLE `tv_idea_analyses` DROP INDEX `tv_idea_analyses_tvIdeaId_unique`;--> statement-breakpoint
ALTER TABLE `tv_ideas` DROP INDEX `tv_ideas_guid_unique`;--> statement-breakpoint
ALTER TABLE `user_api_configs` DROP INDEX `user_api_configs_userId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `agent_messages` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `agent_sessions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `currency_strength_cache` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `custom_ai_messages` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `custom_ai_sessions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `imap_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `insights` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_bars` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_indicator_configs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_indicator_signals` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_status` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_tf_signals` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `mt4_tw_values` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `news` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `notify_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `outlooks` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `signal_ai_prompts` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `signal_analyses` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `signal_notes` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `signals` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `subscriptions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `trade_journal` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `trading_conversations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `trading_system` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `tv_idea_analyses` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `tv_ideas` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_api_configs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `agent_messages` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `agent_sessions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `currency_strength_cache` MODIFY COLUMN `generatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `custom_ai_messages` MODIFY COLUMN `role` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_ai_messages` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `custom_ai_sessions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `imap_config` MODIFY COLUMN `tls` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `imap_config` MODIFY COLUMN `active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `imap_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `insights` MODIFY COLUMN `generatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_bars` MODIFY COLUMN `volume` varchar(32) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `mt4_bars` MODIFY COLUMN `pushedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_indicator_configs` MODIFY COLUMN `active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `mt4_indicator_configs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_indicator_signals` MODIFY COLUMN `pushedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_status` MODIFY COLUMN `lastPushedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_status` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_tf_signals` MODIFY COLUMN `pushedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `mt4_tw_values` MODIFY COLUMN `pushedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `news` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `notify_config` MODIFY COLUMN `emailEnabled` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `notify_config` MODIFY COLUMN `emailEnabled` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `notify_config` MODIFY COLUMN `smtpSecure` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `notify_config` MODIFY COLUMN `feishuEnabled` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `notify_config` MODIFY COLUMN `feishuEnabled` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `outlooks` MODIFY COLUMN `generatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `signal_ai_prompts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `signal_analyses` MODIFY COLUMN `analyzedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `signal_analyses` MODIFY COLUMN `notified` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `signal_analyses` MODIFY COLUMN `notified` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `signal_notes` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `signals` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `subscriptions` MODIFY COLUMN `active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `subscriptions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `trade_journal` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `trading_conversations` MODIFY COLUMN `content` longtext NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_conversations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `trading_system` MODIFY COLUMN `active` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `trading_system` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `tv_idea_analyses` MODIFY COLUMN `notified` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `tv_idea_analyses` MODIFY COLUMN `notified` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `tv_idea_analyses` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `tv_ideas` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_api_configs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
CREATE INDEX `insights_date_unique` ON `insights` (`date`);--> statement-breakpoint
CREATE INDEX `idx_symbol_bartime` ON `mt4_bars` (`symbol`,`barTime`);--> statement-breakpoint
CREATE INDEX `mt4_indicator_configs_indicatorName_unique` ON `mt4_indicator_configs` (`indicatorName`);--> statement-breakpoint
CREATE INDEX `mt4_status_clientId_unique` ON `mt4_status` (`clientId`);--> statement-breakpoint
CREATE INDEX `uq_tf_symbol_tf_bar` ON `mt4_tf_signals` (`symbol`,`timeframe`,`barTime`);--> statement-breakpoint
CREATE INDEX `uq_tw_symbol_tf_bar` ON `mt4_tw_values` (`symbol`,`timeframe`,`barTime`);--> statement-breakpoint
CREATE INDEX `news_link_unique` ON `news` (`link`);--> statement-breakpoint
CREATE INDEX `signal_ai_prompts_id` ON `signal_ai_prompts` (`id`);--> statement-breakpoint
CREATE INDEX `signalId_unique` ON `signal_analyses` (`signalId`);--> statement-breakpoint
CREATE INDEX `signals_messageId_unique` ON `signals` (`messageId`);--> statement-breakpoint
CREATE INDEX `subscriptions_email_unique` ON `subscriptions` (`email`);--> statement-breakpoint
CREATE INDEX `idx_userId` ON `trading_conversations` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_conversationDate` ON `trading_conversations` (`conversationDate`);--> statement-breakpoint
CREATE INDEX `tvIdeaId` ON `tv_idea_analyses` (`tvIdeaId`);--> statement-breakpoint
CREATE INDEX `tv_ideas_guid_unique` ON `tv_ideas` (`guid`);--> statement-breakpoint
CREATE INDEX `userId_unique` ON `user_api_configs` (`userId`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);