import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, news, insights, outlooks, subscriptions, signals, signalNotes, agentSessions, agentMessages, tvIdeas, InsertNews, InsertInsight, InsertOutlook, InsertSubscription, InsertSignal, InsertSignalNote, InsertAgentSession, InsertAgentMessage, InsertTvIdea, mt4IndicatorSignals, mt4IndicatorConfigs, tradeJournal, tradingSystem, InsertMt4IndicatorSignal, InsertMt4IndicatorConfig, InsertTradeJournal, InsertTradingSystem, userApiConfigs, InsertUserApiConfig, signalAnalyses, InsertSignalAnalysis, imapConfig, InsertImapConfig, mt4TwValues, InsertMt4TwValue, mt4TfSignals, InsertMt4TfSignal, tradingConversations, InsertTradingConversation, notifyConfig, InsertNotifyConfig, tvIdeaAnalyses, InsertTvIdeaAnalysis, currencyStrengthCache, signalAiPrompts, InsertSignalAiPrompt } from "../drizzle/schema";
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
  // 统一格式：去掉斜杠并转大写，与数据库存储格式一致（如 EURUSD）
  const normalizedSymbol = symbol.replace("/", "").toUpperCase();
  return db.select().from(mt4IndicatorSignals)
    .where(eq(mt4IndicatorSignals.symbol, normalizedSymbol))
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
  // 统一格式：保留斜杠格式（如 EUR/USD），与前端输入一致
  const normalizedPair = pair.includes("/") ? pair : `${pair.slice(0, 3)}/${pair.slice(3)}`;
  // 优先返回该货币对的记录，不足时补充其他货币对
  const pairTrades = await db.select().from(tradeJournal)
    .where(and(eq(tradeJournal.userId, userId), eq(tradeJournal.pair, normalizedPair)))
    .orderBy(desc(tradeJournal.openTime))
    .limit(limit);
  if (pairTrades.length >= 5) return pairTrades;
  const otherTrades = await db.select().from(tradeJournal)
    .where(eq(tradeJournal.userId, userId))
    .orderBy(desc(tradeJournal.openTime))
    .limit(limit);
  return [...pairTrades, ...otherTrades.filter((t: { pair: string }) => t.pair !== normalizedPair)].slice(0, limit);
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

// ─── 用户 AI API 配置 ────────────────────────────────────────────────────────

export async function getUserApiConfig(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userApiConfigs).where(eq(userApiConfigs.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertUserApiConfig(config: InsertUserApiConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userApiConfigs).values(config).onDuplicateKeyUpdate({
    set: {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      updatedAt: new Date(),
    },
  });
}

// 获取所有已配置 API 的用户（用于后台批量分析信号）
export async function getAllUsersWithApiConfig() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userApiConfigs);
}

// ─── 信号 AI 分析结果 ────────────────────────────────────────────────────────

export async function getSignalAnalysis(signalId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(signalAnalyses).where(eq(signalAnalyses.signalId, signalId)).limit(1);
  return rows[0] ?? null;
}

export async function saveSignalAnalysis(analysis: InsertSignalAnalysis): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(signalAnalyses).values(analysis).onDuplicateKeyUpdate({
    set: {
      decision: analysis.decision,
      confidence: analysis.confidence,
      summary: analysis.summary,
      reasoning: analysis.reasoning,
      marketContext: analysis.marketContext,
      riskWarning: analysis.riskWarning,
      analyzedAt: new Date(),
      notified: false,
    },
  });
}

export async function markSignalAnalysisNotified(signalId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(signalAnalyses).set({ notified: true }).where(eq(signalAnalyses.signalId, signalId));
}

// 获取所有待通知的分析结果（decision 为 execute 或 watch，且尚未通知）
export async function getPendingNotificationAnalyses() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    analysis: signalAnalyses,
    signal: signals,
  })
    .from(signalAnalyses)
    .innerJoin(signals, eq(signalAnalyses.signalId, signals.id))
    .where(and(eq(signalAnalyses.notified, false)))
    .orderBy(desc(signalAnalyses.analyzedAt))
    .limit(20);
}

// ─── IMAP 邮箱配置 ─────────────────────────────────────────────────────────────────────

/** 获取当前激活的 IMAP 配置，如果数据库无配置则降级到环境变量 */
export async function getActiveImapConfig(): Promise<{ email: string; password: string; host: string; port: number; tls: boolean } | null> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(imapConfig)
      .where(eq(imapConfig.active, true))
      .orderBy(desc(imapConfig.updatedAt))
      .limit(1);
    if (rows.length > 0) {
      const r = rows[0];
      return { email: r.email, password: r.password, host: r.host, port: r.port, tls: r.tls };
    }
  }
  // 降级到环境变量
  const email = process.env.IMAP_EMAIL;
  const password = process.env.IMAP_PASSWORD;
  if (email && password) {
    return { email, password, host: "imap.163.com", port: 993, tls: true };
  }
  return null;
}

/** 获取当前配置（密码脱敏，供前端展示） */
export async function getImapConfigForDisplay() {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(imapConfig)
      .where(eq(imapConfig.active, true))
      .orderBy(desc(imapConfig.updatedAt))
      .limit(1);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        source: "db" as const,
        email: r.email,
        host: r.host,
        port: r.port,
        tls: r.tls,
        updatedAt: r.updatedAt,
      };
    }
  }
  // 降级到环境变量
  const email = process.env.IMAP_EMAIL;
  if (email) {
    return { source: "env" as const, email, host: "imap.163.com", port: 993, tls: true, updatedAt: null };
  }
  return null;
}

/** 保存新的 IMAP 配置（先将旧配置设为非激活，再插入新记录） */
export async function saveImapConfig(config: { email: string; password: string; host: string; port: number; tls: boolean }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 将旧配置设为非激活
  await db.update(imapConfig).set({ active: false }).where(eq(imapConfig.active, true));
  // 插入新配置
  await db.insert(imapConfig).values({ ...config, active: true });
}

// ─── TrendWave 多周期数值 ─────────────────────────────────────────────────────

/**
 * 批量 upsert TrendWave Bull/Bear/Threshold 数值
 * 以 (symbol, timeframe, barTime) 为唯一键，重复推送时更新数值
 */
export async function upsertTwValues(rows: InsertMt4TwValue[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  let saved = 0;
  for (const row of rows) {
    try {
      await db.insert(mt4TwValues).values(row).onDuplicateKeyUpdate({
        set: { bull: row.bull, bear: row.bear, threshold: row.threshold, pushedAt: new Date() }
      });
      saved++;
    } catch (e) {
      console.error("[DB] upsertTwValues error:", e);
    }
  }
  return saved;
}

/**
 * 查询指定货币对、周期的最新 N 根 TrendWave 数值（按 barTime 降序）
 */
export async function getTwValues(symbol: string, timeframe: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mt4TwValues)
    .where(and(eq(mt4TwValues.symbol, symbol), eq(mt4TwValues.timeframe, timeframe)))
    .orderBy(desc(mt4TwValues.barTime))
    .limit(limit);
}

/**
 * 查询所有货币对最新一根 TrendWave 数值（供 AI 分析师上下文使用）
 */
export async function getLatestTwValues(timeframe: string) {
  const db = await getDb();
  if (!db) return [];
  // 每个 symbol 取最新一条
  const rows = await db.select().from(mt4TwValues)
    .where(eq(mt4TwValues.timeframe, timeframe))
    .orderBy(desc(mt4TwValues.barTime));
  // 去重：每个 symbol 只保留最新一条
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
}

// ─── TrendFollower 信号 ───────────────────────────────────────────────────────

/**
 * 批量 upsert TrendFollower 信号（buy/sell）
 * 以 (symbol, timeframe, barTime) 为唯一键
 */
export async function upsertTfSignals(rows: InsertMt4TfSignal[]): Promise<number> {
  const db = await getDb();
  if (!db || rows.length === 0) return 0;
  let saved = 0;
  for (const row of rows) {
    try {
      await db.insert(mt4TfSignals).values(row).onDuplicateKeyUpdate({
        set: { signal: row.signal, pushedAt: new Date() }
      });
      saved++;
    } catch (e) {
      console.error("[DB] upsertTfSignals error:", e);
    }
  }
  return saved;
}

/**
 * 查询指定货币对最近 N 条 TrendFollower 信号（按 barTime 降序）
 */
export async function getTfSignals(symbol: string, timeframe = "M15", limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mt4TfSignals)
    .where(and(eq(mt4TfSignals.symbol, symbol), eq(mt4TfSignals.timeframe, timeframe)))
    .orderBy(desc(mt4TfSignals.barTime))
    .limit(limit);
}

/**
 * 查询所有货币对最新 TrendFollower 信号（供 AI 分析师上下文使用）
 */
export async function getLatestTfSignals(timeframe = "M15", limit = 28) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(mt4TfSignals)
    .where(eq(mt4TfSignals.timeframe, timeframe))
    .orderBy(desc(mt4TfSignals.barTime))
    .limit(limit * 3); // 多取一些再去重
  const seen = new Set<string>();
  return rows.filter(r => {
    if (seen.has(r.symbol)) return false;
    seen.add(r.symbol);
    return true;
  });
}

// ─── 历史对话记录 CRUD ─────────────────────────────────────────────────────────

export async function getTradingConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tradingConversations)
    .where(eq(tradingConversations.userId, userId))
    .orderBy(desc(tradingConversations.updatedAt))
    .limit(200);
}

export async function createTradingConversation(data: InsertTradingConversation) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(tradingConversations).values(data).$returningId();
  const rows = await db.select().from(tradingConversations).where(eq(tradingConversations.id, result.id)).limit(1);
  return rows[0];
}

export async function updateTradingConversation(id: number, userId: number, data: Partial<InsertTradingConversation>) {
  const db = await getDb();
  if (!db) return;
  await db.update(tradingConversations)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(tradingConversations.id, id), eq(tradingConversations.userId, userId)));
}

export async function deleteTradingConversation(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(tradingConversations)
    .where(and(eq(tradingConversations.id, id), eq(tradingConversations.userId, userId)));
}

// ─── 推送通知配置 ─────────────────────────────────────────────────────────────

/** 获取通知配置（全局只有一条，id=1） */
export async function getNotifyConfig() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(notifyConfig).limit(1);
  return rows[0] ?? null;
}

/** 保存通知配置（upsert，始终维护 id=1 的单条记录） */
export async function saveNotifyConfig(config: Omit<InsertNotifyConfig, "id" | "updatedAt">): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: notifyConfig.id }).from(notifyConfig).limit(1);
  if (existing.length > 0) {
    await db.update(notifyConfig)
      .set({ ...config, updatedAt: new Date() })
      .where(eq(notifyConfig.id, existing[0].id));
  } else {
    await db.insert(notifyConfig).values({ ...config });
  }
}

// ─── TradingView 交易想法 AI 分析 ──────────────────────────────────────────────

/** 获取指定交易想法的 AI 分析结果 */
export async function getTvIdeaAnalysis(tvIdeaId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tvIdeaAnalyses).where(eq(tvIdeaAnalyses.tvIdeaId, tvIdeaId)).limit(1);
  return rows[0] ?? null;
}

/** 保存交易想法分析结果 */
export async function saveTvIdeaAnalysis(analysis: InsertTvIdeaAnalysis): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tvIdeaAnalyses).values(analysis).onDuplicateKeyUpdate({
    set: {
      decision: analysis.decision,
      confidence: analysis.confidence,
      summary: analysis.summary,
      reasoning: analysis.reasoning,
      marketContext: analysis.marketContext,
      riskWarning: analysis.riskWarning,
      notified: false,
    },
  });
}

/** 标记交易想法分析已推送通知 */
export async function markTvIdeaAnalysisNotified(tvIdeaId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tvIdeaAnalyses).set({ notified: true }).where(eq(tvIdeaAnalyses.tvIdeaId, tvIdeaId));
}

/**
 * 获取最近 N 小时内新增的、尚未分析的交易想法
 * 用于每小时定时任务批量分析
 */
export async function getUnanalyzedTvIdeas(sinceHours = 2, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  // 查询最近 sinceHours 小时内新增的想法
  const recentIdeas = await db.select().from(tvIdeas)
    .where(sql`${tvIdeas.createdAt} >= ${since}`)
    .orderBy(desc(tvIdeas.publishedAt))
    .limit(limit * 2);
  if (recentIdeas.length === 0) return [];
  // 过滤掉已分析的
  const analyzed = await db.select({ tvIdeaId: tvIdeaAnalyses.tvIdeaId })
    .from(tvIdeaAnalyses)
    .where(sql`${tvIdeaAnalyses.tvIdeaId} IN (${sql.join(recentIdeas.map(i => sql`${i.id}`), sql`, `)})`);
  const analyzedIds = new Set(analyzed.map(a => a.tvIdeaId));
  return recentIdeas.filter(i => !analyzedIds.has(i.id)).slice(0, limit);
}

// ─── 货币强弱矩阵缓存 ─────────────────────────────────────────────────────────

/** 获取最新的货币强弱矩阵缓存（只有一条记录，id=1） */
export async function getCurrencyStrengthCache() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(currencyStrengthCache)
    .orderBy(desc(currencyStrengthCache.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** 保存货币强弱矩阵缓存（upsert，始终维护最新一条记录） */
export async function saveCurrencyStrengthCache(data: {
  matrixJson: string;
  economicSummariesJson?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    // 先尝试删除旧记录
    try {
      await db.delete(currencyStrengthCache);
    } catch (e) {
      // 如果表不存在或删除失败，继续插入
      console.warn("[DB] Warning deleting old cache:", e);
    }
    // 插入新记录
    await db.insert(currencyStrengthCache).values({
      matrixJson: data.matrixJson,
      economicSummariesJson: data.economicSummariesJson ?? null,
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("[DB] Failed to save currency strength cache:", error);
    throw error;
  }
}


// ─── TradingView 新闻 ─────────────────────────────────────────────────────────

export async function getRecentTradingViewNews(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(tradingviewNews)
      .orderBy(desc(tradingviewNews.publishedAt))
      .limit(limit);
  } catch (error) {
    console.error("[DB] Failed to get TradingView news:", error);
    return [];
  }
}

export async function saveTradingViewNews(data: InsertTradingViewNews): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(tradingviewNews).values(data).onDuplicateKeyUpdate({
      set: {
        title: data.title,
        description: data.description,
        publishedAt: data.publishedAt,
      }
    });
  } catch (error) {
    console.error("[DB] Failed to save TradingView news:", error);
  }
}


// ─── 交易信号 AI Prompt 配置 ──────────────────────────────────────────────────

/** 获取当前激活的 AI Prompt（如果没有则返回默认 Prompt） */
export async function getActiveSignalAiPrompt(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(signalAiPrompts)
    .where(eq(signalAiPrompts.isActive, true))
    .orderBy(desc(signalAiPrompts.createdAt))
    .limit(1);
  
  if (!rows[0]) {
    const defaultPrompt = `你是一位专业的外汇交易分析师。你的任务是分析收到的交易信号邮件，结合当前市场状况和用户的交易体系，给出明确的交易决策建议。

你必须以严格的 JSON 格式返回分析结果，不要包含任何 markdown 代码块，直接输出 JSON 对象：
{
  "decision": "execute" | "watch" | "ignore",
  "confidence": 0-100,
  "priority": "普通" | "高" | "超高优先级",
  "summary": "一句话结论（30字以内）",
  "reasoning": "详细分析推理（200字以内）",
  "dataFreshness": "新鲜" | "一般" | "过期",
  "contradiction": "无矛盾" | "轻微矛盾" | "严重矛盾",
  "marketContext": "当前市场背景简述（100字以内）",
  "riskWarning": "主要风险提示（100字以内，如无风险可为空字符串）"
}

决策标准：
- execute（建议执行）：信号方向与市场趋势一致，符合用户交易体系，风险可控
- watch（建议观察）：信号有一定价值但存在不确定因素，建议等待更好入场时机
- ignore（建议忽略）：信号与市场趋势相悖，或不符合用户交易体系，风险过高

【数据新鲜度检查】
- 如果市场背景信息超过 1 小时未更新，标记为"过期"，置信度 -20
- 如果 1-2 小时内更新，标记为"一般"，置信度 -10
- 如果 1 小时内更新，标记为"新鲜"，无置信度调整
- 在 reasoning 中说明数据新鲜度对分析的影响

【矛盾检测】
- 检查信号方向是否与市场背景一致
- 如果存在矛盾，在 reasoning 中明确说明，不要编造解释
- 严重矛盾时，倾向于选择 "watch" 而非 "ignore"
- 轻微矛盾时，可以选择 "execute" 但要降低置信度 10-15 分

【偏好匹配】
- 当信号涉及用户优先关注的货币或地缘政治事件时，标记为"超高优先级"
- 在 reasoning 中说明匹配的偏好项
- 优先级为"超高"时，可以适度提高置信度（+10-15 分）

注意：实时的市场洞察、货币展望、新闻摘要和用户交易体系会在每次分析时动态注入到此 Prompt 之后。`;
    return {
      id: 0,
      version: 0,
      systemPrompt: defaultPrompt,
      isActive: false,
      description: '默认 Prompt',
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  return rows[0];
}

/** 获取所有 AI Prompt 版本历史 */
export async function getSignalAiPromptHistory(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signalAiPrompts)
    .orderBy(desc(signalAiPrompts.createdAt))
    .limit(limit);
}

/** 保存新的 AI Prompt 版本 */
// 修复后的函数
export async function saveSignalAiPrompt(userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const latest = await db.select({ version: signalAiPrompts.version })
      .from(signalAiPrompts)
      .orderBy(desc(signalAiPrompts.version))
      .limit(1);
    
    const nextVersion = (latest[0]?.version ?? 0) + 1;
    
    await db.update(signalAiPrompts)
      .set({ isActive: false })
      .where(eq(signalAiPrompts.isActive, true));
    
    await db.insert(signalAiPrompts).values({
      version: nextVersion,
      systemPrompt: content,
      description: null,
      createdBy: userId,
      isActive: true,
    });
    
    const rows = await db.select().from(signalAiPrompts)
      .where(eq(signalAiPrompts.version, nextVersion))
      .limit(1);
    
    return rows[0] ?? null;
  } catch (error) {
    console.error("[DB] Failed to save signal AI prompt:", error);
    throw error;
  }
}

export async function rollbackSignalAiPrompt(userId: number, versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const target = await db.select().from(signalAiPrompts)
      .where(eq(signalAiPrompts.version, versionId))
      .limit(1);
    
    if (target.length === 0) {
      return null;
    }
    
    await db.update(signalAiPrompts)
      .set({ isActive: false });
    
    await db.update(signalAiPrompts)
      .set({ isActive: true })
      .where(eq(signalAiPrompts.version, versionId));
    
    return target[0];
  } catch (error) {
    console.error("[DB] Failed to rollback signal AI prompt:", error);
    throw error;
  }
}
