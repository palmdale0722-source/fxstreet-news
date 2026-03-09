import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, news, insights, outlooks, subscriptions, InsertNews, InsertInsight, InsertOutlook, InsertSubscription } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── News ─────────────────────────────────────────────────────────────────────

export async function insertNewsItems(items: InsertNews[]): Promise<number> {
  const db = await getDb();
  if (!db || items.length === 0) return 0;
  let inserted = 0;
  for (const item of items) {
    try {
      await db.insert(news).values(item).onDuplicateKeyUpdate({ set: { title: item.title } });
      inserted++;
    } catch (e) {
      // skip duplicates
    }
  }
  return inserted;
}

export async function getRecentNews(limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(news)
    .where(eq(news.source, "News"))
    .orderBy(desc(news.publishedAt))
    .limit(limit);
}

export async function getAnalysisArticles(limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(news)
    .where(eq(news.source, "Analysis"))
    .orderBy(desc(news.publishedAt))
    .limit(limit);
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export async function getTodayInsight(date: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(insights).where(eq(insights.date, date)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertInsight(data: InsertInsight): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(insights).values(data).onDuplicateKeyUpdate({
    set: {
      summary: data.summary,
      geopolitics: data.geopolitics,
      energy: data.energy,
      forex: data.forex,
      assets: data.assets,
      tradingAdvice: data.tradingAdvice,
      generatedAt: new Date(),
    }
  });
}

// ─── Outlooks ─────────────────────────────────────────────────────────────────

export async function getTodayOutlooks(date: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outlooks)
    .where(eq(outlooks.date, date))
    .orderBy(outlooks.currency);
}

export async function upsertOutlook(data: InsertOutlook): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete existing for this date+currency, then insert fresh
  await db.delete(outlooks).where(
    and(eq(outlooks.date, data.date), eq(outlooks.currency, data.currency))
  );
  await db.insert(outlooks).values(data);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function addSubscription(data: InsertSubscription): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) return { success: false, message: "数据库不可用" };
  try {
    await db.insert(subscriptions).values(data).onDuplicateKeyUpdate({ set: { active: true } });
    return { success: true, message: "订阅成功！" };
  } catch (e) {
    return { success: false, message: "订阅失败，请稍后重试" };
  }
}
