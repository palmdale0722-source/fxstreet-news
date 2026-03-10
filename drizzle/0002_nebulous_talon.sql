CREATE TABLE `signal_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalId` int NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`content` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signal_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(512) NOT NULL,
	`subject` varchar(512) NOT NULL,
	`body` text NOT NULL,
	`fromEmail` varchar(320),
	`receivedAt` timestamp NOT NULL,
	`status` enum('pending','executed','ignored','watching') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`),
	CONSTRAINT `signals_messageId_unique` UNIQUE(`messageId`)
);
