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
