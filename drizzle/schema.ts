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
