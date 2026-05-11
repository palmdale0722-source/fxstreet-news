/**
 * 交易伴飞服务 - 数据库操作辅助函数
 */
import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  tradeCompanions,
  tradeCompanionMessages,
  InsertTradeCompanion,
  InsertTradeCompanionMessage,
  TradeCompanion,
} from "../drizzle/schema";

// ─── 交易伴飞记录 CRUD ────────────────────────────────────────────────────────

/** 创建新的交易伴飞记录 */
export async function createTradeCompanion(data: InsertTradeCompanion): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tradeCompanions).values(data);
  return (result[0] as { insertId: number }).insertId;
}

/** 获取用户的所有伴飞记录（分页） */
export async function getTradeCompanions(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tradeCompanions)
    .where(eq(tradeCompanions.userId, userId))
    .orderBy(desc(tradeCompanions.createdAt))
    .limit(limit)
    .offset(offset);
}

/** 获取单条伴飞记录 */
export async function getTradeCompanion(id: number, userId: number): Promise<TradeCompanion | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(tradeCompanions)
    .where(and(eq(tradeCompanions.id, id), eq(tradeCompanions.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 更新伴飞记录 */
export async function updateTradeCompanion(
  id: number,
  userId: number,
  data: Partial<InsertTradeCompanion>
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(tradeCompanions)
    .set(data)
    .where(and(eq(tradeCompanions.id, id), eq(tradeCompanions.userId, userId)));
  return (result[0] as { affectedRows: number }).affectedRows > 0;
}

/** 删除伴飞记录 */
export async function deleteTradeCompanion(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .delete(tradeCompanions)
    .where(and(eq(tradeCompanions.id, id), eq(tradeCompanions.userId, userId)));
  return (result[0] as { affectedRows: number }).affectedRows > 0;
}

// ─── 伴飞 AI 对话消息 CRUD ────────────────────────────────────────────────────

/** 保存对话消息 */
export async function saveCompanionMessage(data: InsertTradeCompanionMessage): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tradeCompanionMessages).values(data);
}

/** 获取某个伴飞记录的所有对话消息 */
export async function getCompanionMessages(companionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tradeCompanionMessages)
    .where(eq(tradeCompanionMessages.companionId, companionId))
    .orderBy(tradeCompanionMessages.createdAt);
}

/** 清除某个伴飞记录的所有对话消息 */
export async function clearCompanionMessages(companionId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(tradeCompanionMessages)
    .where(eq(tradeCompanionMessages.companionId, companionId));
}
