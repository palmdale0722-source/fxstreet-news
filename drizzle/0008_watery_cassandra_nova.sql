CREATE TABLE `signal_ai_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` int NOT NULL,
	`systemPrompt` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`description` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `signal_ai_prompts_id` PRIMARY KEY(`id`)
);
