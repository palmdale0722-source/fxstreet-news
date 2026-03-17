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
