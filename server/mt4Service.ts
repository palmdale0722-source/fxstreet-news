/**
 * MT4 数据推送服务
 * 处理 MT4 EA 推送的 M15 行情数据的存储和查询
 */
import { getDb } from "./db";
import { mt4Bars, mt4Status } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
// G8 全部 28 个货币对（MT4 符号格式，无斜杠）
export const G8_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
  "USDCAD", "AUDUSD", "NZDUSD",
  "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
  "CHFJPY", "CADJPY", "AUDJPY", "NZDJPY",
  "AUDCAD", "AUDCHF", "AUDNZD",
  "CADCHF", "NZDCAD", "NZDCHF",
];
export interface Mt4BarData {
  symbol: string;
  barTime: string;   // ISO 8601 UTC string
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
  spread?: number;
}
export interface Mt4PushPayload {
  clientId: string;
  accountNumber?: string;
  broker?: string;
  timeframe?: string;
  bars: Mt4BarData[];
}

/**
 * 接收并存储 MT4 推送的行情数据
 * 每个货币对保留最近 200 根 K 线
 * 优化：快速响应，异步处理清理任务
 */
export async function saveMt4Bars(payload: Mt4PushPayload): Promise<{ inserted: number; symbols: string[] }> {
  const timeframe = payload.timeframe || "M15";
  const symbolSet = new Set(payload.bars.map((b: Mt4BarData) => b.symbol.toUpperCase()));
  const symbols = Array.from(symbolSet);
  let inserted = 0;

  const db = await getDb();
  if (!db) return { inserted: 0, symbols };

  // 验证和过滤有效的 K 线
  const validBars = payload.bars.filter(bar => {
    const symbol = bar.symbol.toUpperCase();
    const barTime = new Date(bar.barTime);
    return !isNaN(barTime.getTime()) && G8_SYMBOLS.includes(symbol);
  });

  // 批量插入优化：使用 Promise.all 并发处理，但限制并发数避免连接池耗尽
  const concurrency = 10;
  for (let i = 0; i < validBars.length; i += concurrency) {
    const batch = validBars.slice(i, i + concurrency);
    try {
      await Promise.all(batch.map(async (bar) => {
        const symbol = bar.symbol.toUpperCase();
        const barTime = new Date(bar.barTime);
        try {
          await db
            .insert(mt4Bars)
            .values({
              symbol,
              timeframe,
              barTime,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              volume: bar.volume || "0",
              spread: bar.spread || 0,
            })
            .onDuplicateKeyUpdate({
              set: {
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close,
                volume: bar.volume || "0",
                spread: bar.spread || 0,
                pushedAt: new Date().toISOString(),
              },
            });
          inserted++;
        } catch (error) {
          console.warn(`[MT4] Insert error for ${symbol}:`, error);
        }
      }));
    } catch (error) {
      console.error(`[MT4] Batch error at index ${i}:`, error);
    }
  }

  // 更新 MT4 连接状态
  const db2 = await getDb();
  if (db2) {
    try {
      await db2
        .insert(mt4Status)
        .values({
          clientId: payload.clientId,
          accountNumber: payload.accountNumber || null,
          broker: payload.broker || null,
          symbolsCount: symbols.length,
          lastPushedAt: new Date().toISOString(),
        })
        .onDuplicateKeyUpdate({
          set: {
            accountNumber: payload.accountNumber || null,
            broker: payload.broker || null,
            symbolsCount: symbols.length,
            lastPushedAt: new Date().toISOString(),
          },
        });
    } catch (error) {
      console.error("[MT4] Failed to update status:", error);
    }
  }

  // 异步清理旧数据（不阻塞响应）
  cleanupOldBars(symbols).catch(error => {
    console.error("[MT4] Cleanup error:", error);
  });

  return { inserted, symbols };
}

/**
 * 异步清理旧 K 线数据（不阻塞 HTTP 响应）
 */
async function cleanupOldBars(symbols: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const symbol of symbols) {
    try {
      // 找到第 200 根 K 线的 barTime
      const cutoffRows = await db
        .select({ barTime: mt4Bars.barTime })
        .from(mt4Bars)
        .where(eq(mt4Bars.symbol, symbol))
        .orderBy(desc(mt4Bars.barTime))
        .limit(1)
        .offset(200);

      if (cutoffRows.length > 0) {
        const cutoffTime = cutoffRows[0].barTime;
        // 删除超过 200 根的旧 K 线
        await db
          .delete(mt4Bars)
          .where(and(eq(mt4Bars.symbol, symbol), sql`${mt4Bars.barTime} < ${cutoffTime}`));
      }
    } catch (error) {
      console.warn(`[MT4] Cleanup failed for ${symbol}:`, error);
    }
  }
}

/**
 * 获取指定货币对的最近 K 线
 */
export async function getMt4Bars(symbol: string, limit: number = 100): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(mt4Bars)
      .where(eq(mt4Bars.symbol, symbol.toUpperCase()))
      .orderBy(desc(mt4Bars.barTime))
      .limit(limit);
  } catch (error) {
    console.error(`[MT4] Failed to get bars for ${symbol}:`, error);
    return [];
  }
}

/**
 * 获取 MT4 连接状态
 */
export async function getMt4ConnectionStatus(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db
      .select()
      .from(mt4Status)
      .orderBy(desc(mt4Status.lastPushedAt))
      .limit(10);
  } catch (error) {
    console.error("[MT4] Failed to get connection status:", error);
    return [];
  }
}


/**
 * 格式化 MT4 K 线数据用于 LLM 提示
 */
export function formatMt4BarsForPrompt(pair: string, bars: any[]): string {
  if (!bars || bars.length === 0) {
    return `${pair} 暂无 MT4 K 线数据`;
  }

  const recentBars = bars.slice(0, 20);
  const barLines = recentBars.map((bar, idx) => {
    const time = new Date(bar.barTime).toISOString().slice(0, 16);
    return `${idx + 1}. ${time} O:${bar.open} H:${bar.high} L:${bar.low} C:${bar.close} V:${bar.volume}`;
  }).join('\n');

  return `${pair} MT4 M15 K线（最近20根）:\n${barLines}`;
}
