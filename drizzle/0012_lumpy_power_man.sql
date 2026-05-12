ALTER TABLE `trade_companions` MODIFY COLUMN `status` enum('watching','active','closed','cancelled') NOT NULL DEFAULT 'watching';--> statement-breakpoint
ALTER TABLE `trade_companions` ADD `actual_direction` varchar(8);--> statement-breakpoint
ALTER TABLE `trade_companions` ADD `actual_entry_price` varchar(32);--> statement-breakpoint
ALTER TABLE `trade_companions` ADD `actual_stop_loss` varchar(32);--> statement-breakpoint
ALTER TABLE `trade_companions` ADD `actual_take_profit` varchar(32);--> statement-breakpoint
ALTER TABLE `trade_companions` ADD `actual_entry_time` timestamp;