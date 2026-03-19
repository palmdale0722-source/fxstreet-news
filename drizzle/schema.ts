import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 新闻文章表
export const news = mysqlTable("news", {
  id: int("id").autoincrement().primaryKey(),
  title: text("title").notNull(),
  link: varchar("link", { length: 1024 }).notNull().unique(),
  description: text("description"),
  publishedAt: timestamp("publishedAt").notNull(),
  source: mysqlEnum("source", ["News", "Analysis"]).default("News").notNull(),
  author: varchar("author", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NewsItem = typeof news.$inferSelect;
export type InsertNews = typeof news.$inferInsert;

// 今日市场洞察表
export const insights = mysqlTable("insights", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  summary: text("summary").notNull(),
  geopolitics: text("geopolitics"),
  energy: text("energy"),
  forex: text("forex"),
  assets: text("assets"),
  tradingAdvice: text("tradingAdvice"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
});

export type Insight = typeof insights.$inferSelect;
export type InsertInsight = typeof insights.$inferInsert;

// 货币展望表
export const outlooks = mysqlTable("outlooks", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  currency: varchar("currency", { length: 10 }).notNull(),
  outlook: text("outlook").notNull(),
  sentiment: mysqlEnum("sentiment", ["bullish", "bearish", "neutral"]).default("neutral").notNull(),
  riskLabel: varchar("riskLabel", { length: 50 }),
  sourceLink: varchar("sourceLink", { length: 1024 }),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
});

export type Outlook = typeof outlooks.$inferSelect;
export type InsertOutlook = typeof outlooks.$inferInsert;

// 邮件订阅表
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  userId: int("userId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── 交易信号表 ───────────────────────────────────────────────────────────────
// 每封从 163 邮箱拉取的信号邮件对应一条记录
export const signals = mysqlTable("signals", {
  id: int("id").autoincrement().primaryKey(),
  messageId: varchar("messageId", { length: 512 }).notNull().unique(), // 邮件 Message-ID，用于去重
  subject: varchar("subject", { length: 512 }).notNull(),
  body: text("body").notNull(),                  // 纯文本正文
  fromEmail: varchar("fromEmail", { length: 320 }),
  receivedAt: timestamp("receivedAt").notNull(), // 邮件接收时间
  status: mysqlEnum("status", ["pending", "executed", "ignored", "watching"])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

// ─── 信号备注表 ───────────────────────────────────────────────────────────────
// 每条信号可有多人填写备注，每人最多一条（upsert），记录最后修改时间
export const signalNotes = mysqlTable("signal_notes", {
  id: int("id").autoincrement().primaryKey(),
  signalId: int("signalId").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }),  // 冗余存储，方便展示
  content: text("content").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SignalNote = typeof signalNotes.$inferSelect;
export type InsertSignalNote = typeof signalNotes.$inferInsert;

// ─── AI Agent 对话表 ──────────────────────────────────────────────────────────
// 每个用户可有多个会话，每个会话包含多轪对话
export const agentSessions = mysqlTable("agent_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default("新对话"),
  pair: varchar("pair", { length: 20 }),  // 当前关注的货币对，如 EUR/USD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgentSession = typeof agentSessions.$inferSelect;
export type InsertAgentSession = typeof agentSessions.$inferInsert;

export const agentMessages = mysqlTable("agent_messages", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AgentMessage = typeof agentMessages.$inferSelect;
export type InsertAgentMessage = typeof agentMessages.$inferInsert;

// ─── MT4 推送行情表 ──────────────────────────────────────────────────────
// 存储 MT4 EA 推送的 M15 K线数据，每个货币对保留最近 200 根 K线
export const mt4Bars = mysqlTable("mt4_bars", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),   // e.g. EURUSD
  timeframe: varchar("timeframe", { length: 10 }).notNull().default("M15"),
  barTime: timestamp("barTime").notNull(),               // K线开盘时间 (UTC)
  open: text("open").notNull(),                          // 存为字符串避免浮点精度问题
  high: text("high").notNull(),
  low: text("low").notNull(),
  close: text("close").notNull(),
  volume: text("volume").notNull().default("0"),
  spread: int("spread").default(0),                      // 点差（单位：点）
  pushedAt: timestamp("pushedAt").defaultNow().notNull(), // EA 推送时间
});

export type Mt4Bar = typeof mt4Bars.$inferSelect;
export type InsertMt4Bar = typeof mt4Bars.$inferInsert;

// MT4 连接状态表（记录每个 EA 实例的最后推送时间）
export const mt4Status = mysqlTable("mt4_status", {
  id: int("id").autoincrement().primaryKey(),
  clientId: varchar("clientId", { length: 64 }).notNull().unique(), // EA 实例标识
  accountNumber: varchar("accountNumber", { length: 64 }),           // MT4 账号
  broker: varchar("broker", { length: 128 }),                        // 经纪商名称
  symbolsCount: int("symbolsCount").default(0),                      // 本次推送的货币对数量
  lastPushedAt: timestamp("lastPushedAt").defaultNow().notNull(),    // 最后推送时间
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Mt4Status = typeof mt4Status.$inferSelect;
export type InsertMt4Status = typeof mt4Status.$inferInsert;

// ─── TradingView 交易想法表 ─────────────────────────────────────────────
// 存储从 TradingView RSS 采集的外汇交易想法
export const tvIdeas = mysqlTable("tv_ideas", {
  id: int("id").autoincrement().primaryKey(),
  guid: varchar("guid", { length: 512 }).notNull().unique(),   // RSS item guid，用于去重
  title: text("title").notNull(),
  link: varchar("link", { length: 1024 }).notNull(),
  description: text("description"),                           // 文章摘要
  author: varchar("author", { length: 255 }),                  // 作者名称
  symbol: varchar("symbol", { length: 30 }),                   // 货币对，如 EURUSD
  pair: varchar("pair", { length: 20 }),                       // 标准格式，如 EUR/USD
  imageUrl: varchar("imageUrl", { length: 1024 }),             // 图表截图 URL
  publishedAt: timestamp("publishedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TvIdea = typeof tvIdeas.$inferSelect;
export type InsertTvIdea = typeof tvIdeas.$inferInsert;

// ─── MT4 自定义指标信号表 ─────────────────────────────────────────────────────
// 存储 MT4 EA 推送的自定义指标当前值和信号
export const mt4IndicatorSignals = mysqlTable("mt4_indicator_signals", {
  id: int("id").autoincrement().primaryKey(),
  symbol: varchar("symbol", { length: 20 }).notNull(),         // 货币对，如 EURUSD
  timeframe: varchar("timeframe", { length: 10 }).notNull(),   // 时间周期，如 M15
  indicatorName: varchar("indicatorName", { length: 128 }).notNull(), // 指标名称
  value1: text("value1"),   // 指标值1（主值）
  value2: text("value2"),   // 指标值2（副值/信号线）
  value3: text("value3"),   // 指标值3（可选）
  signal: mysqlEnum("signal", ["buy", "sell", "neutral", "overbought", "oversold"]).default("neutral"),
  description: text("description"), // 信号描述，如 "趋势向上，RSI=72 超买"
  pushedAt: timestamp("pushedAt").defaultNow().notNull(),
});

export type Mt4IndicatorSignal = typeof mt4IndicatorSignals.$inferSelect;
export type InsertMt4IndicatorSignal = typeof mt4IndicatorSignals.$inferInsert;

// ─── MT4 指标配置表 ──────────────────────────────────────────────────────────
// 用户配置哪些自定义指标需要推送，以及如何解读其信号
export const mt4IndicatorConfigs = mysqlTable("mt4_indicator_configs", {
  id: int("id").autoincrement().primaryKey(),
  indicatorName: varchar("indicatorName", { length: 128 }).notNull().unique(), // 指标文件名（不含.ex4）
  displayName: varchar("displayName", { length: 128 }).notNull(),  // 显示名称
  indicatorType: mysqlEnum("indicatorType", ["trend", "oscillator", "volume", "custom"]).default("custom"),
  params: text("params"),         // JSON 格式的参数列表
  interpretation: text("interpretation").notNull(), // 解读规则，如 "值>0表示上涨趋势，值<0表示下跌趋势"
  bufferIndex: int("bufferIndex").default(0), // 主要读取的 buffer 索引
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Mt4IndicatorConfig = typeof mt4IndicatorConfigs.$inferSelect;
export type InsertMt4IndicatorConfig = typeof mt4IndicatorConfigs.$inferInsert;

// ─── 历史交易记录表 ──────────────────────────────────────────────────────────
// 用户手动输入的历史交易记录，用于 AI 分析参考
export const tradeJournal = mysqlTable("trade_journal", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  pair: varchar("pair", { length: 20 }).notNull(),              // 货币对，如 EUR/USD
  direction: mysqlEnum("direction", ["buy", "sell"]).notNull(), // 方向
  entryPrice: text("entryPrice").notNull(),                     // 入场价格
  exitPrice: text("exitPrice"),                                 // 出场价格（未平仓可为空）
  stopLoss: text("stopLoss"),                                   // 止损价格
  takeProfit: text("takeProfit"),                               // 止盈价格
  lotSize: text("lotSize"),                                     // 手数
  pnl: text("pnl"),                                            // 盈亏（点数或金额）
  openTime: timestamp("openTime").notNull(),                    // 开仓时间
  closeTime: timestamp("closeTime"),                            // 平仓时间
  status: mysqlEnum("status", ["open", "closed", "cancelled"]).default("closed").notNull(),
  summary: text("summary"),     // 交易简介：为什么入场、当时的市场背景
  lesson: text("lesson"),       // 交易复盘：经验教训
  tags: varchar("tags", { length: 512 }), // 标签，逗号分隔，如 "突破,趋势跟随,盈利"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TradeJournal = typeof tradeJournal.$inferSelect;
export type InsertTradeJournal = typeof tradeJournal.$inferInsert;

// ─── 交易体系知识库表 ────────────────────────────────────────────────────────
// 用户输入的交易思想、分析方法、交易规则等，AI 分析时优先参考
export const tradingSystem = mysqlTable("trading_system", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", [
    "philosophy",    // 交易哲学与思想
    "methodology",   // 分析方法论
    "entry_rules",   // 入场规则
    "exit_rules",    // 出场规则
    "risk_management", // 风险管理
    "pairs_preference", // 偏好货币对
    "session_preference", // 偏好交易时段
    "other"          // 其他
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),  // 条目标题
  content: text("content").notNull(),                   // 详细内容
  active: boolean("active").default(true).notNull(),    // 是否激活（注入 AI Prompt）
  sortOrder: int("sortOrder").default(0),               // 排序
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TradingSystem = typeof tradingSystem.$inferSelect;
export type InsertTradingSystem = typeof tradingSystem.$inferInsert;
