-- TrendWave 多周期数值表
CREATE TABLE IF NOT EXISTS `mt4_tw_values` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `symbol` VARCHAR(16) NOT NULL,
  `timeframe` VARCHAR(8) NOT NULL,
  `barTime` TIMESTAMP NOT NULL,
  `bull` VARCHAR(24) NOT NULL,
  `bear` VARCHAR(24) NOT NULL,
  `threshold` VARCHAR(24),
  `pushedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tw_symbol_tf_bar` (`symbol`, `timeframe`, `barTime`)
);

-- TrendFollower 信号表
CREATE TABLE IF NOT EXISTS `mt4_tf_signals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `symbol` VARCHAR(16) NOT NULL,
  `timeframe` VARCHAR(8) NOT NULL,
  `barTime` TIMESTAMP NOT NULL,
  `signal` ENUM('buy','sell') NOT NULL,
  `pushedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_tf_symbol_tf_bar` (`symbol`, `timeframe`, `barTime`)
);
