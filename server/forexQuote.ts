/**
 * Forex real-time quote fetcher using Yahoo Finance via Manus Data API
 * Supports all 28 G8 currency pairs with technical indicator calculation
 */
import { callDataApi } from "./_core/dataApi";

// Mapping from display pair name to Yahoo Finance symbol
const PAIR_TO_SYMBOL: Record<string, string> = {
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  "USD/JPY": "JPY=X",
  "USD/CHF": "USDCHF=X",
  "USD/CAD": "USDCAD=X",
  "AUD/USD": "AUDUSD=X",
  "NZD/USD": "NZD=X",
  "EUR/GBP": "EURGBP=X",
  "EUR/JPY": "EURJPY=X",
  "EUR/CHF": "EURCHF=X",
  "EUR/CAD": "EURCAD=X",
  "EUR/AUD": "EURAUD=X",
  "EUR/NZD": "EURNZD=X",
  "GBP/JPY": "GBPJPY=X",
  "GBP/CHF": "GBPCHF=X",
  "GBP/CAD": "GBPCAD=X",
  "GBP/AUD": "GBPAUD=X",
  "GBP/NZD": "GBPNZD=X",
  "CHF/JPY": "CHFJPY=X",
  "CAD/JPY": "CADJPY=X",
  "AUD/JPY": "AUDJPY=X",
  "NZD/JPY": "NZDJPY=X",
  "AUD/CAD": "AUDCAD=X",
  "AUD/CHF": "AUDCHF=X",
  "AUD/NZD": "AUDNZD=X",
  "CAD/CHF": "CADCHF=X",
  "NZD/CAD": "NZDCAD=X",
  "NZD/CHF": "NZDCHF=X",
};

export interface ForexQuote {
  pair: string;
  symbol: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  open: number;
  // Historical OHLC for technical analysis (last 30 days daily)
  history: {
    timestamps: number[];
    opens: number[];
    highs: number[];
    lows: number[];
    closes: number[];
  };
  // Computed technical indicators
  indicators: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    bollingerBands: { upper: number; middle: number; lower: number } | null;
    atr14: number | null;
    trend: "bullish" | "bearish" | "neutral";
  };
  // Recent price action summary (last 5 candles)
  recentCandles: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }[];
  fetchedAt: string;
}

// --- Technical indicator helpers ---

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-period - 1).map((c, i, arr) =>
    i === 0 ? 0 : c - arr[i - 1]
  ).slice(1);
  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? -c : 0));
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function ema(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const minLen = Math.min(ema12.length, ema26.length);
  const macdLine = ema12.slice(-minLen).map((v, i) => v - ema26.slice(-minLen)[i]);
  if (macdLine.length < 9) return null;
  const signalLine = ema(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

function bollingerBands(closes: number[], period = 20): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + 2 * std, middle, lower: middle - 2 * std };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

function determineTrend(closes: number[], sma20: number | null, sma50: number | null): "bullish" | "bearish" | "neutral" {
  const last = closes[closes.length - 1];
  if (!sma20 || !sma50) return "neutral";
  if (last > sma20 && sma20 > sma50) return "bullish";
  if (last < sma20 && sma20 < sma50) return "bearish";
  return "neutral";
}

// --- Main fetch function ---

export async function getForexQuote(pair: string): Promise<ForexQuote | null> {
  const symbol = PAIR_TO_SYMBOL[pair];
  if (!symbol) return null;

  try {
    // Fetch 3 months of daily data for technical indicators
    const resp = await callDataApi("YahooFinance/get_stock_chart", {
      query: { symbol, interval: "1d", range: "3mo" },
    }) as any;

    if (!resp?.chart?.result?.[0]) return null;

    const result = resp.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const timestamps: number[] = result.timestamp || [];

    // Filter out null values
    const validIndices = timestamps.map((_, i) => i).filter(i =>
      quotes.close[i] != null && quotes.open[i] != null &&
      quotes.high[i] != null && quotes.low[i] != null
    );

    const validTimestamps = validIndices.map(i => timestamps[i]);
    const opens = validIndices.map(i => quotes.open[i] as number);
    const highs = validIndices.map(i => quotes.high[i] as number);
    const lows = validIndices.map(i => quotes.low[i] as number);
    const closes = validIndices.map(i => quotes.close[i] as number);

    const currentPrice = meta.regularMarketPrice as number;
    const previousClose = meta.chartPreviousClose as number ?? closes[closes.length - 2] ?? currentPrice;
    const change = currentPrice - previousClose;
    const changePct = (change / previousClose) * 100;

    // Compute indicators
    const sma20val = sma(closes, 20);
    const sma50val = sma(closes, 50);
    const sma200val = sma(closes, 200);
    const rsiVal = rsi(closes, 14);
    const macdVal = macd(closes);
    const bbVal = bollingerBands(closes, 20);
    const atrVal = atr(highs, lows, closes, 14);
    const trend = determineTrend(closes, sma20val, sma50val);

    // Recent 5 candles
    const recentCandles = validIndices.slice(-5).map(i => ({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      open: opens[validIndices.indexOf(i)] ?? 0,
      high: highs[validIndices.indexOf(i)] ?? 0,
      low: lows[validIndices.indexOf(i)] ?? 0,
      close: closes[validIndices.indexOf(i)] ?? 0,
    }));

    // Fix recentCandles index mapping
    const last5 = validIndices.slice(-5);
    const recentCandlesFixed = last5.map((origIdx, arrIdx) => {
      const pos = validIndices.length - 5 + arrIdx;
      return {
        date: new Date(validTimestamps[pos] * 1000).toISOString().slice(0, 10),
        open: opens[pos],
        high: highs[pos],
        low: lows[pos],
        close: closes[pos],
      };
    });

    return {
      pair,
      symbol,
      currentPrice,
      previousClose,
      change,
      changePct,
      dayHigh: meta.regularMarketDayHigh as number ?? highs[highs.length - 1],
      dayLow: meta.regularMarketDayLow as number ?? lows[lows.length - 1],
      open: meta.regularMarketOpen as number ?? opens[opens.length - 1],
      history: {
        timestamps: validTimestamps,
        opens,
        highs,
        lows,
        closes,
      },
      indicators: {
        sma20: sma20val,
        sma50: sma50val,
        sma200: sma200val,
        rsi14: rsiVal,
        macd: macdVal,
        bollingerBands: bbVal,
        atr14: atrVal,
        trend,
      },
      recentCandles: recentCandlesFixed,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`[forexQuote] Failed to fetch ${pair}:`, e);
    return null;
  }
}

/**
 * Format a ForexQuote into a concise text block for LLM system prompt injection
 */
export function formatQuoteForPrompt(q: ForexQuote): string {
  const dir = q.change >= 0 ? "▲" : "▼";
  const ind = q.indicators;

  const lines = [
    `=== ${q.pair} 实时行情数据 (${q.fetchedAt.slice(0, 16)} UTC) ===`,
    `当前价格: ${q.currentPrice.toFixed(5)}  ${dir} ${Math.abs(q.change).toFixed(5)} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(3)}%)`,
    `今日: 开盘 ${q.open.toFixed(5)} | 最高 ${q.dayHigh.toFixed(5)} | 最低 ${q.dayLow.toFixed(5)} | 前收 ${q.previousClose.toFixed(5)}`,
    ``,
    `技术指标:`,
    `  SMA20=${ind.sma20?.toFixed(5) ?? "N/A"}  SMA50=${ind.sma50?.toFixed(5) ?? "N/A"}  SMA200=${ind.sma200?.toFixed(5) ?? "N/A"}`,
    `  RSI(14)=${ind.rsi14?.toFixed(2) ?? "N/A"}  ATR(14)=${ind.atr14?.toFixed(5) ?? "N/A"}`,
    ind.macd
      ? `  MACD=${ind.macd.macd.toFixed(5)}  Signal=${ind.macd.signal.toFixed(5)}  Hist=${ind.macd.histogram.toFixed(5)}`
      : `  MACD=N/A`,
    ind.bollingerBands
      ? `  布林带: 上轨=${ind.bollingerBands.upper.toFixed(5)} 中轨=${ind.bollingerBands.middle.toFixed(5)} 下轨=${ind.bollingerBands.lower.toFixed(5)}`
      : `  布林带=N/A`,
    `  趋势偏向: ${ind.trend === "bullish" ? "看涨" : ind.trend === "bearish" ? "看跌" : "中性"}`,
    ``,
    `近5根日线K线:`,
    ...q.recentCandles.map(c =>
      `  ${c.date}: O=${c.open.toFixed(5)} H=${c.high.toFixed(5)} L=${c.low.toFixed(5)} C=${c.close.toFixed(5)}`
    ),
  ];

  return lines.join("\n");
}
