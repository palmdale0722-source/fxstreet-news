/**
 * 价格动量数据采集（极简版）
 * 
 * 只做一件事：获取各货币对近 20 天的涨跌幅
 */

import { getForexQuote } from "./forexQuote";

export interface CurrencyMomentum {
  currency: string;
  pair: string;           // 如 EURUSD
  change20d: number;      // 20 天涨跌幅 %
  technicalScore: number; // 技术面评分 [-3, +3]
}

/**
 * 获取货币对的 20 天涨跌幅
 * 返回技术面评分：
 *   - 强涨（>2%）: +2 分
 *   - 温和上涨（0.5%-2%）: +1 分
 *   - 平稳（-0.5% 到 +0.5%）: 0 分
 *   - 温和下跌（-2% 到 -0.5%）: -1 分
 *   - 强跌（<-2%）: -2 分
 */
async function getPairMomentum(pair: string, currency: string): Promise<CurrencyMomentum | null> {
  try {
    const quote = await getForexQuote(pair);
    if (!quote || !quote.history || !quote.history.closes || quote.history.closes.length === 0) {
      return null;
    }

    const currentPrice = quote.currentPrice;
    const closes = quote.history.closes;
    const price20dAgo = closes[Math.max(0, closes.length - 20)];
    if (!price20dAgo) return null;
    const change20d = ((currentPrice - price20dAgo) / price20dAgo) * 100;

    // 计算技术面评分
    let technicalScore = 0;
    if (change20d > 2) technicalScore = 2;
    else if (change20d > 0.5) technicalScore = 1;
    else if (change20d > -0.5) technicalScore = 0;
    else if (change20d > -2) technicalScore = -1;
    else technicalScore = -2;

    return {
      currency,
      pair,
      change20d: Math.round(change20d * 100) / 100,
      technicalScore,
    };
  } catch (error) {
    console.error(`[PriceMovement] Error fetching ${pair}:`, error);
    return null;
  }
}

/**
 * 获取所有 G8 货币的技术面评分
 */
export async function getAllCurrencyMomentum(): Promise<Record<string, CurrencyMomentum>> {
  const pairs = [
    { pair: "EURUSD", currency: "EUR" },
    { pair: "GBPUSD", currency: "GBP" },
    { pair: "USDJPY", currency: "JPY" },
    { pair: "AUDUSD", currency: "AUD" },
    { pair: "NZDUSD", currency: "NZD" },
    { pair: "USDCAD", currency: "CAD" },
    { pair: "USDCHF", currency: "CHF" },
    // USD 通过美元指数反向
    { pair: "DXY", currency: "USD" },
  ];

  const result: Record<string, CurrencyMomentum> = {};

  for (const { pair, currency } of pairs) {
    const momentum = await getPairMomentum(pair, currency);
    if (momentum) {
      // USD 特殊处理：美元指数上升 = USD 强，反向评分
      if (currency === "USD") {
        momentum.technicalScore = -momentum.technicalScore;
      }
      result[currency] = momentum;
    }
  }

  console.log("[PriceMovement] Momentum scores:", result);
  return result;
}
