-- 货币强弱矩阵缓存表
-- 存储 AI 生成的 G8 货币强弱评分矩阵（每小时更新一次）
CREATE TABLE IF NOT EXISTS `currency_strength_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `matrixJson` text NOT NULL,
  `economicSummariesJson` text,
  `generatedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `currency_strength_cache_id` PRIMARY KEY(`id`)
);
