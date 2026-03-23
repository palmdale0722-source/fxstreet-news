-- 用户 AI API 配置表
-- 存储用户自带的 OpenAI 兼容 API 配置，供后台自动分析信号时使用
CREATE TABLE IF NOT EXISTS `user_api_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL UNIQUE,
  `apiUrl` varchar(512) NOT NULL,
  `apiKey` varchar(512) NOT NULL,
  `model` varchar(128) NOT NULL DEFAULT 'gpt-4o',
  `temperature` text DEFAULT '0.7',
  `maxTokens` int DEFAULT 4096,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 信号 AI 分析结果表
-- 每条交易信号的 AI 自动分析结论
CREATE TABLE IF NOT EXISTS `signal_analyses` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `signalId` int NOT NULL UNIQUE,
  `decision` enum('execute','watch','ignore') NOT NULL,
  `confidence` int NOT NULL DEFAULT 50,
  `summary` text NOT NULL,
  `reasoning` text NOT NULL,
  `marketContext` text,
  `riskWarning` text,
  `analyzedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notified` boolean NOT NULL DEFAULT false
);
