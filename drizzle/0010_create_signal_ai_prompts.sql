-- Create signal_ai_prompts table if it doesn't exist
CREATE TABLE IF NOT EXISTS `signal_ai_prompts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `version` int NOT NULL,
  `systemPrompt` text NOT NULL,
  `isActive` boolean NOT NULL DEFAULT false,
  `description` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `signal_ai_prompts_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
