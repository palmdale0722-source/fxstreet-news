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
 */
export async function saveMt4Bars(payload: Mt4PushPayload): Promise<{ inserted: number; symbols: string[] }> {
  const timeframe = payload.timeframe || "M15";
  const symbolSet = new Set(payload.bars.map((b: Mt4BarData) => b.symbol.toUpperCase()));
  const symbols = Array.from(symbolSet);
  let inserted = 0;

  const db = await getDb();
  if (!db) return { inserted: 0, symbols };

  for (const bar of payload.bars) {
    const symbol = bar.symbol.toUpperCase();
    const barTime = new Date(bar.barTime);

    if (isNaN(barTime.getTime())) continue;
    if (!G8_SYMBOLS.includes(symbol)) continue;

    try {
      // UPSERT：同一货币对同一时间的 K 线只保留一条（用最新推送覆盖）
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
            pushedAt: new Date(),
          },
        });
      inserted++;
    } catch {
      // 忽略单条插入错误，继续处理其他 K 线
    }
  }

  // 更新 MT4 连接状态
  const db2 = await getDb();
  if (!db2) return { inserted, symbols };
  await db2
    .insert(mt4Status)
    .values({
      clientId: payload.clientId,
      accountNumber: payload.accountNumber || null,
      broker: payload.broker || null,
      symbolsCount: symbols.length,
      lastPushedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        accountNumber: payload.accountNumber || null,
        broker: payload.broker || null,
        symbolsCount: symbols.length,
        lastPushedAt: new Date(),
      },
    });

  // 清理每个货币对超过 200 根的旧 K 线
  const db3 = await getDb();
  if (!db3) return { inserted, symbols };
  for (const symbol of symbols) {
    try {
      // 找到第 200 根 K 线的 barTime
      const cutoffRows = await db3
        .select({ barTime: mt4Bars.barTime })
        .from(mt4Bars)
        .where(and(eq(mt4Bars.symbol, symbol), eq(mt4Bars.timeframe, timeframe)))
        .orderBy(desc(mt4Bars.barTime))
        .limit(1)
        .offset(199);

      if (cutoffRows.length > 0) {
        await db3
          .delete(mt4Bars)
          .where(
            and(
              eq(mt4Bars.symbol, symbol),
              eq(mt4Bars.timeframe, timeframe),
              sql`${mt4Bars.barTime} < ${cutoffRows[0].barTime}`
            )
          );
      }
    } catch {
      // 忽略清理错误
    }
  }

  return { inserted, symbols };
}

/**
 * 获取指定货币对的最新 N 根 M15 K 线
 */
export async function getMt4Bars(symbol: string, limit = 100, timeframe = "M15") {
  const normalizedSymbol = symbol.replace("/", "").toUpperCase();
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(mt4Bars)
    .where(and(eq(mt4Bars.symbol, normalizedSymbol), eq(mt4Bars.timeframe, timeframe)))
    .orderBy(desc(mt4Bars.barTime))
    .limit(limit);
  return rows.reverse(); // 返回时间升序
}

/**
 * 获取所有货币对的最新一根 K 线（用于行情总览）
 */
export async function getLatestMt4Bars(timeframe = "M15") {
  const results: Record<string, { symbol: string; close: string; open: string; high: string; low: string; barTime: Date; pushedAt: Date }> = {};
  const db = await getDb();
  if (!db) return results;

  for (const symbol of G8_SYMBOLS) {
    const rows = await db
      .select()
      .from(mt4Bars)
      .where(and(eq(mt4Bars.symbol, symbol), eq(mt4Bars.timeframe, timeframe)))
      .orderBy(desc(mt4Bars.barTime))
      .limit(1);

    if (rows.length > 0) {
      results[symbol] = rows[0];
    }
  }

  return results;
}

/**
 * 获取 MT4 连接状态
 */
export async function getMt4ConnectionStatus() {
  const db = await getDb();
  if (!db) return [];
  const statuses = await db
    .select()
    .from(mt4Status)
    .orderBy(desc(mt4Status.lastPushedAt));

  return statuses.map((s: typeof statuses[0]) => ({
    ...s,
    isOnline: (Date.now() - s.lastPushedAt.getTime()) < 20 * 60 * 1000, // 20分钟内推送视为在线
    minutesSinceLastPush: Math.floor((Date.now() - s.lastPushedAt.getTime()) / 60000),
  }));
}

/**
 * 将 MT4 K 线数据格式化为 AI Prompt 上下文
 */
export function formatMt4BarsForPrompt(symbol: string, bars: Awaited<ReturnType<typeof getMt4Bars>>): string {
  if (bars.length === 0) return "";

  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // 计算技术指标
  const closes = bars.map((b: typeof bars[0]) => parseFloat(b.close));
  const highs = bars.map((b: typeof bars[0]) => parseFloat(b.high));
  const lows = bars.map((b: typeof bars[0]) => parseFloat(b.low));

  // SMA
  const sma20 = closes.length >= 20 ? (closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20).toFixed(5) : "N/A";
  const sma50 = closes.length >= 50 ? (closes.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50).toFixed(5) : "N/A";

  // RSI(14)
  let rsi = "N/A";
  if (closes.length >= 15) {
    const changes = closes.slice(-15).map((c: number, i: number, arr: number[]) => i === 0 ? 0 : c - arr[i - 1]);
    const gains = changes.filter((c: number) => c > 0).reduce((a: number, b: number) => a + b, 0) / 14;
    const losses = Math.abs(changes.filter((c: number) => c < 0).reduce((a: number, b: number) => a + b, 0)) / 14;
    rsi = losses === 0 ? "100" : (100 - 100 / (1 + gains / losses)).toFixed(1);
  }

  // 近期高低点（20根K线）
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const recentHigh = Math.max(...recentHighs).toFixed(5);
  const recentLow = Math.min(...recentLows).toFixed(5);

  // 价格变化
  const change = prev ? ((parseFloat(latest.close) - parseFloat(prev.close)) / parseFloat(prev.close) * 100).toFixed(3) : "N/A";

  const displaySymbol = symbol.length === 6 ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;

  return `
## MT4 实时行情数据（${displaySymbol}，M15 时间周期）
数据来源：MT4 交易终端（实时推送）
最新K线时间：${latest.barTime.toISOString().replace("T", " ").slice(0, 16)} UTC
最新收盘价：${latest.close}
开盘价：${latest.open} | 最高：${latest.high} | 最低：${latest.low}
点差：${latest.spread} 点
较上根K线变化：${change}%

技术指标（基于MT4实时数据）：
- SMA(20)：${sma20}
- SMA(50)：${sma50}
- RSI(14)：${rsi}
- 近20根K线高点：${recentHigh}
- 近20根K线低点：${recentLow}
- 可用K线数量：${bars.length} 根
`;
}
