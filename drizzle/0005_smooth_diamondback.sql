CREATE TABLE `tv_ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`guid` varchar(512) NOT NULL,
	`title` text NOT NULL,
	`link` varchar(1024) NOT NULL,
	`description` text,
	`author` varchar(255),
	`symbol` varchar(30),
	`pair` varchar(20),
	`imageUrl` varchar(1024),
	`publishedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tv_ideas_id` PRIMARY KEY(`id`),
	CONSTRAINT `tv_ideas_guid_unique` UNIQUE(`guid`)
);
