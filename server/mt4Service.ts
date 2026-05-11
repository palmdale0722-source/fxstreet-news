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
 * 每个货币对保留最近 5000 根 K 线（约 52 天 M15 数据）
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

  // 批量插入优化：使用 Promise.all 并发处理，但限制并发数不超过连接池耗尽
  const concurrency = 10;
  for (let i = 0; i < validBars.length; i += concurrency) {
    const batch = validBars.slice(i, i + concurrency);
    try {
      await Promise.all(batch.map(async (bar) => {
        const symbol = bar.symbol.toUpperCase();
        const barTime = new Date(bar.barTime).toISOString();
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
      const now = new Date().toISOString();
      await db2
        .insert(mt4Status)
        .values({
          clientId: payload.clientId,
          accountNumber: payload.accountNumber || null,
          broker: payload.broker || null,
          symbolsCount: symbols.length,
          lastPushedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            accountNumber: payload.accountNumber || null,
            broker: payload.broker || null,
            symbolsCount: symbols.length,
            lastPushedAt: now,
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
      // 保留最近 5000 根 K 线（约 52 天的 M15 数据）
      const cutoffRows = await db
        .select({ barTime: mt4Bars.barTime })
        .from(mt4Bars)
        .where(eq(mt4Bars.symbol, symbol))
        .orderBy(desc(mt4Bars.barTime))
        .limit(1)
        .offset(5000);

      if (cutoffRows.length > 0) {
        const cutoffTime = cutoffRows[0].barTime;
        // 删除超过 5000 根的旧 K 线
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
    // 查询所有 MT4 K 线数据，按时间倒序排列
    const allBars = await db
      .select()
      .from(mt4Bars)
      .orderBy(desc(mt4Bars.barTime))
      .limit(100);

    if (!allBars || allBars.length === 0) {
      return [];
    }

    // 按货币对分组，获取每个货币对的最新时间戳
    const statusMap = new Map<string, any>();
    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    for (const bar of allBars) {
      if (!statusMap.has(bar.symbol)) {
        const barTime = new Date(bar.barTime).getTime();
        statusMap.set(bar.symbol, {
          symbol: bar.symbol,
          lastPushedAt: new Date(bar.barTime),
          recordCount: 1,
          isOnline: barTime > thirtyMinutesAgo,
        });
      } else {
        statusMap.get(bar.symbol)!.recordCount++;
      }
    }

    // 返回按最新时间排序的结果
    return Array.from(statusMap.values()).sort(
      (a, b) => new Date(b.lastPushedAt).getTime() - new Date(a.lastPushedAt).getTime()
    );
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

/**
 * 将 M15 K 线聚合为指定时间周期
 * @param m15Bars - M15 K 线数组（按时间倒序）
 * @param targetTf - 目标时间周期：'H1' | 'H4' | 'D1'
 * @returns 聚合后的 K 线数组（按时间倒序）
 */
export function aggregateBars(m15Bars: any[], targetTf: 'H1' | 'H4' | 'D1'): any[] {
  if (!m15Bars || m15Bars.length === 0) return [];

  // 每个目标周期包含的 M15 K 线数量
  const M15_PER_TF: Record<string, number> = {
    H1: 4,
    H4: 16,
    D1: 96,
  };
  const barsPerCandle = M15_PER_TF[targetTf];
  if (!barsPerCandle) return [];

  // 将 M15 K 线按时间正序排列
  const sorted = [...m15Bars].sort(
    (a, b) => new Date(a.barTime).getTime() - new Date(b.barTime).getTime()
  );

  // 按目标周期的时间槽分组
  const groups = new Map<number, any[]>();
  for (const bar of sorted) {
    const ts = new Date(bar.barTime).getTime();
    const slotMs = barsPerCandle * 15 * 60 * 1000;
    const slotKey = Math.floor(ts / slotMs) * slotMs;
    if (!groups.has(slotKey)) groups.set(slotKey, []);
    groups.get(slotKey)!.push(bar);
  }

  // 聚合每个时间槽
  const aggregated: any[] = [];
  for (const [slotKey, bars] of Array.from(groups.entries())) {
    if (bars.length === 0) continue;
    const open = bars[0].open;
    const close = bars[bars.length - 1].close;
    const high = bars.reduce((max: number, b: any) => Math.max(max, parseFloat(b.high)), -Infinity).toFixed(5);
    const low = bars.reduce((min: number, b: any) => Math.min(min, parseFloat(b.low)), Infinity).toFixed(5);
    const volume = bars.reduce((sum: number, b: any) => sum + parseFloat(b.volume || '0'), 0).toFixed(0);
    const spread = Math.round(bars.reduce((sum: number, b: any) => sum + (b.spread || 0), 0) / bars.length);
    aggregated.push({
      id: null,
      symbol: bars[0].symbol,
      timeframe: targetTf,
      barTime: new Date(slotKey).toISOString().slice(0, 19).replace('T', ' '),
      open,
      high,
      low,
      close,
      volume,
      spread,
      pushedAt: bars[bars.length - 1].pushedAt,
      m15Count: bars.length, // 该聚合 K 线包含的 M15 数量（满足 barsPerCandle 才是完整 K 线）
    });
  }

  // 按时间倒序返回，过滤掉不完整的最新 K 线（当前未收盘的 K 线）
  return aggregated
    .sort((a, b) => new Date(b.barTime).getTime() - new Date(a.barTime).getTime());
}

/**
 * 获取指定货币对的 K 线（支持 M15/H1/H4/D1）
 * H1/H4/D1 由 M15 数据实时聚合生成
 */
export async function getMt4BarsWithTf(
  symbol: string,
  timeframe: 'M15' | 'H1' | 'H4' | 'D1' = 'M15',
  limit: number = 100
): Promise<any[]> {
  if (timeframe === 'M15') {
    return getMt4Bars(symbol, limit);
  }

  // 对于 H1/H4/D1，先拉取足够多的 M15 数据再聚合
  const M15_NEEDED: Record<string, number> = {
    H1: limit * 4 + 4,
    H4: limit * 16 + 16,
    D1: limit * 96 + 96,
  };
  const m15Limit = Math.min(M15_NEEDED[timeframe] || limit * 16, 5000);
  const m15Bars = await getMt4Bars(symbol, m15Limit);
  const aggregated = aggregateBars(m15Bars, timeframe as 'H1' | 'H4' | 'D1');
  return aggregated.slice(0, limit);
}
