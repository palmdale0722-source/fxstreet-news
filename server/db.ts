import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, news, insights, outlooks, subscriptions, signals, signalNotes, agentSessions, agentMessages, tvIdeas, InsertNews, InsertInsight, InsertOutlook, InsertSubscription, InsertSignal, InsertSignalNote, InsertAgentSession, InsertAgentMessage, InsertTvIdea, mt4IndicatorSignals, mt4IndicatorConfigs, tradeJournal, tradingSystem, InsertMt4IndicatorSignal, InsertMt4IndicatorConfig, InsertTradeJournal, InsertTradingSystem } from "../drizzle/schema";
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
  // 逐条 INSERT IGNORE：affectedRows=1 表示真正新增，0 表示重复跳过
  for (const item of items) {
    try {
      const result = await db.execute(
        sql`INSERT IGNORE INTO news (title, link, description, publishedAt, source, author)
         VALUES (${item.title}, ${item.link}, ${item.description ?? null}, ${item.publishedAt}, ${item.source}, ${item.author ?? null})`
      ) as unknown as [{ affectedRows?: number }, unknown];
      const affected = result[0]?.affectedRows ?? 0;
      if (affected > 0) inserted++;
    } catch (e) {
      // skip errors
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

// ─── Subscriptions ───────────────────────────────────────────────────────────────────────────────

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

// ─── Signals ──────────────────────────────────────────────────────────────────────────────────

export type SignalStatus = "pending" | "executed" | "ignored" | "watching";

export async function getSignals(opts: {
  status?: SignalStatus;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { status, page = 1, pageSize = 20 } = opts;
  const offset = (page - 1) * pageSize;

  const whereClause = status ? eq(signals.status, status) : undefined;

  const [items, countResult] = await Promise.all([
    whereClause
      ? db.select().from(signals).where(whereClause).orderBy(desc(signals.receivedAt)).limit(pageSize).offset(offset)
      : db.select().from(signals).orderBy(desc(signals.receivedAt)).limit(pageSize).offset(offset),
    whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(signals).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(signals),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function updateSignalStatus(id: number, status: SignalStatus): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(signals).set({ status }).where(eq(signals.id, id));
}

export async function getSignalNotes(signalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signalNotes)
    .where(eq(signalNotes.signalId, signalId))
    .orderBy(desc(signalNotes.updatedAt));
}

export async function upsertSignalNote(data: InsertSignalNote): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: signalNotes.id })
    .from(signalNotes)
    .where(and(eq(signalNotes.signalId, data.signalId), eq(signalNotes.userId, data.userId)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(signalNotes)
      .set({ content: data.content, userName: data.userName, updatedAt: new Date() })
      .where(eq(signalNotes.id, existing[0].id));
  } else {
    await db.insert(signalNotes).values(data);
  }
}

// ─── Agent Sessions & Messages ─────────────────────────────────────────────────────────────────

export async function getAgentSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentSessions)
    .where(eq(agentSessions.userId, userId))
    .orderBy(desc(agentSessions.updatedAt))
    .limit(50);
}

export async function createAgentSession(data: InsertAgentSession) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(agentSessions).values(data).$returningId();
  const rows = await db.select().from(agentSessions).where(eq(agentSessions.id, result.id)).limit(1);
  return rows[0];
}

export async function updateAgentSessionTitle(id: number, title: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentSessions).set({ title }).where(eq(agentSessions.id, id));
}

export async function deleteAgentSession(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(agentMessages).where(eq(agentMessages.sessionId, id));
  await db.delete(agentSessions).where(and(eq(agentSessions.id, id), eq(agentSessions.userId, userId)));
}

export async function getAgentMessages(sessionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentMessages)
    .where(eq(agentMessages.sessionId, sessionId))
    .orderBy(agentMessages.createdAt);
}

export async function saveAgentMessage(data: InsertAgentMessage) {
  const db = await getDb();
  if (!db) return;
  await db.insert(agentMessages).values(data);
}

// 获取最近 N 条新闻和分析文章作为 Agent 上下文
export async function getNewsContextForAgent(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    title: news.title,
    description: news.description,
    publishedAt: news.publishedAt,
    source: news.source,
    author: news.author,
  }).from(news)
    .orderBy(desc(news.publishedAt))
    .limit(limit);
}

// 获取最近一条洞察和全部货币展望作为上下文
export async function getLatestInsightAndOutlooks() {
  const db = await getDb();
  if (!db) return { insight: null, outlooks: [] };
  const insightRows = await db.select().from(insights).orderBy(desc(insights.generatedAt)).limit(1);
  const outlookRows = await db.select().from(outlooks).orderBy(desc(outlooks.generatedAt)).limit(8);
  return { insight: insightRows[0] ?? null, outlooks: outlookRows };
}
// ─── TradingView 交易想法 ──────────────────────────────────────────────────────

export async function insertTvIdeas(items: InsertTvIdea[]): Promise<number> {
  const db = await getDb();
  if (!db || items.length === 0) return 0;
  let inserted = 0;
  for (const item of items) {
    try {
      await db.insert(tvIdeas).values(item).onDuplicateKeyUpdate({ set: { title: item.title } });
      inserted++;
    } catch (e) {
      // 忽略重复插入错误
    }
  }
  return inserted;
}

export async function getRecentTvIdeas(limit = 30, pair?: string) {
  const db = await getDb();
  if (!db) return [];
  if (pair) {
    const symbol = pair.replace("/", "");
    return db.select().from(tvIdeas)
      .where(eq(tvIdeas.symbol, symbol))
      .orderBy(desc(tvIdeas.publishedAt))
      .limit(limit);
  }
  return db.select().from(tvIdeas)
    .orderBy(desc(tvIdeas.publishedAt))
    .limit(limit);
}

export async function getTvIdeasForAgent(pair: string, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  const symbol = pair.replace("/", "");
  const exact = await db.select().from(tvIdeas)
    .where(eq(tvIdeas.symbol, symbol))
    .orderBy(desc(tvIdeas.publishedAt))
    .limit(limit);
  if (exact.length >= 3) return exact;
  const general = await db.select().from(tvIdeas)
    .orderBy(desc(tvIdeas.publishedAt))
    .limit(limit);
  return [...exact, ...general.filter((g: { symbol: string | null }) => g.symbol !== symbol)].slice(0, limit);
}

// ─── MT4 自定义指标信号 ──────────────────────────────────────────────────────

export async function upsertIndicatorSignal(signal: InsertMt4IndicatorSignal): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // 按 symbol + timeframe + indicatorName 唯一更新
  await db.insert(mt4IndicatorSignals).values(signal).onDuplicateKeyUpdate({
    set: {
      value1: signal.value1,
      value2: signal.value2,
      value3: signal.value3,
      signal: signal.signal,
      description: signal.description,
      pushedAt: signal.pushedAt ?? new Date(),
    },
  });
}

export async function getIndicatorSignalsForAgent(symbol: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mt4IndicatorSignals)
    .where(eq(mt4IndicatorSignals.symbol, symbol))
    .orderBy(desc(mt4IndicatorSignals.pushedAt))
    .limit(20);
}

// ─── MT4 指标配置 ────────────────────────────────────────────────────────────

export async function getIndicatorConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mt4IndicatorConfigs)
    .where(eq(mt4IndicatorConfigs.active, true))
    .orderBy(mt4IndicatorConfigs.id);
}

export async function getAllIndicatorConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mt4IndicatorConfigs).orderBy(mt4IndicatorConfigs.id);
}

export async function upsertIndicatorConfig(config: InsertMt4IndicatorConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(mt4IndicatorConfigs).values(config).onDuplicateKeyUpdate({
    set: {
      displayName: config.displayName,
      indicatorType: config.indicatorType,
      params: config.params,
      interpretation: config.interpretation,
      bufferIndex: config.bufferIndex,
      active: config.active,
    },
  });
}

export async function deleteIndicatorConfig(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mt4IndicatorConfigs).where(eq(mt4IndicatorConfigs.id, id));
}

// ─── 历史交易记录 ────────────────────────────────────────────────────────────

export async function getTradeJournal(userId: number, pair?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  if (pair) {
    return db.select().from(tradeJournal)
      .where(and(eq(tradeJournal.userId, userId), eq(tradeJournal.pair, pair)))
      .orderBy(desc(tradeJournal.openTime))
      .limit(limit);
  }
  return db.select().from(tradeJournal)
    .where(eq(tradeJournal.userId, userId))
    .orderBy(desc(tradeJournal.openTime))
    .limit(limit);
}

export async function getTradeJournalForAgent(userId: number, pair: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  // 优先返回该货币对的记录，不足时补充其他货币对
  const pairTrades = await db.select().from(tradeJournal)
    .where(and(eq(tradeJournal.userId, userId), eq(tradeJournal.pair, pair)))
    .orderBy(desc(tradeJournal.openTime))
    .limit(limit);
  if (pairTrades.length >= 5) return pairTrades;
  const otherTrades = await db.select().from(tradeJournal)
    .where(eq(tradeJournal.userId, userId))
    .orderBy(desc(tradeJournal.openTime))
    .limit(limit);
  return [...pairTrades, ...otherTrades.filter((t: { pair: string }) => t.pair !== pair)].slice(0, limit);
}

export async function createTradeJournalEntry(entry: InsertTradeJournal): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(tradeJournal).values(entry);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateTradeJournalEntry(id: number, userId: number, updates: Partial<InsertTradeJournal>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tradeJournal).set(updates).where(and(eq(tradeJournal.id, id), eq(tradeJournal.userId, userId)));
}

export async function deleteTradeJournalEntry(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tradeJournal).where(and(eq(tradeJournal.id, id), eq(tradeJournal.userId, userId)));
}

// ─── 交易体系知识库 ──────────────────────────────────────────────────────────

export async function getTradingSystem(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tradingSystem)
    .where(eq(tradingSystem.userId, userId))
    .orderBy(tradingSystem.sortOrder, tradingSystem.id);
}

export async function getActiveTradingSystem(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tradingSystem)
    .where(and(eq(tradingSystem.userId, userId), eq(tradingSystem.active, true)))
    .orderBy(tradingSystem.sortOrder, tradingSystem.id);
}

export async function createTradingSystemEntry(entry: InsertTradingSystem): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(tradingSystem).values(entry);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateTradingSystemEntry(id: number, userId: number, updates: Partial<InsertTradingSystem>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tradingSystem).set(updates).where(and(eq(tradingSystem.id, id), eq(tradingSystem.userId, userId)));
}

export async function deleteTradingSystemEntry(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tradingSystem).where(and(eq(tradingSystem.id, id), eq(tradingSystem.userId, userId)));
}
