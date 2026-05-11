/**
 * Technical Indicators Library
 * Implements: AMA, Supertrend (CCI-based), TrendWave, MACD
 */

export interface OHLCBar {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ─────────────────────────────────────────────────────────────
// Helper: EMA on array
// ─────────────────────────────────────────────────────────────
export function calcEMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let ema = NaN;
  for (let i = 0; i < values.length; i++) {
    if (isNaN(values[i])) continue;
    if (isNaN(ema)) {
      ema = values[i];
    } else {
      ema = values[i] * k + ema * (1 - k);
    }
    result[i] = ema;
  }
  return result;
}

// Helper: SMA on array
export function calcSMA(values: number[], period: number): number[] {
  const result: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result[i] = sum / period;
  }
  return result;
}

// Helper: ATR (Wilder's)
export function calcATR(bars: OHLCBar[], period: number): number[] {
  const result: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < 2) return result;

  const trValues: number[] = new Array(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    trValues[i] = Math.max(hl, hc, lc);
  }

  // Initial ATR = SMA of first `period` TR values
  let atr = 0;
  let count = 0;
  for (let i = 1; i <= period && i < bars.length; i++) {
    if (!isNaN(trValues[i])) { atr += trValues[i]; count++; }
  }
  if (count === period) {
    atr /= period;
    result[period] = atr;
    for (let i = period + 1; i < bars.length; i++) {
      if (!isNaN(trValues[i])) {
        atr = (atr * (period - 1) + trValues[i]) / period;
        result[i] = atr;
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// 1. AMA (Adaptive Moving Average) – Perry Kaufman variant with G=2
//    Parameters: periodAMA=9, nfast=2, nslow=30, G=2.0, dK=2.0
// ─────────────────────────────────────────────────────────────
export interface AMAParams {
  periodAMA?: number; // Efficiency ratio period (default 9)
  nfast?: number;     // Fast EMA period (default 2)
  nslow?: number;     // Slow EMA period (default 30)
  G?: number;         // Power exponent (default 2.0)
  dK?: number;        // Direction signal threshold in pips (default 2.0)
}

export interface AMAResult {
  ama: (number | null)[];
  upSignal: (number | null)[];   // AMA value when trending up (for up arrow)
  downSignal: (number | null)[]; // AMA value when trending down (for down arrow)
}

export function calcAMA(bars: OHLCBar[], params: AMAParams = {}): AMAResult {
  const { periodAMA = 9, nfast = 2, nslow = 30, G = 2.0 } = params;

  const n = bars.length;
  const ama: (number | null)[] = new Array(n).fill(null);
  const upSignal: (number | null)[] = new Array(n).fill(null);
  const downSignal: (number | null)[] = new Array(n).fill(null);

  const fastSC = 2.0 / (nfast + 1);
  const slowSC = 2.0 / (nslow + 1);

  // Need at least periodAMA+2 bars
  if (n <= periodAMA + 2) return { ama, upSignal, downSignal };

  // Determine pip size (approximate from price magnitude)
  const samplePrice = bars[bars.length - 1].close;
  const point = samplePrice > 10 ? 0.001 : (samplePrice > 1 ? 0.0001 : 0.00001);
  const dKThreshold = (params.dK ?? 2.0) * point;

  // Start from the oldest bar that has enough history
  const startPos = n - periodAMA - 2;
  let ama0 = bars[startPos + 1]?.close ?? 0;

  for (let pos = startPos; pos >= 0; pos--) {
    const close = bars[pos].close;

    // Signal = abs(Close[pos] - Close[pos+periodAMA])
    const signal = Math.abs(close - bars[pos + periodAMA].close);

    // Noise = sum of abs(Close[i] - Close[i+1]) for i in [pos, pos+periodAMA-1]
    let noise = 0.000000001;
    for (let i = 0; i < periodAMA; i++) {
      noise += Math.abs(bars[pos + i].close - bars[pos + i + 1].close);
    }

    const ER = signal / noise;
    const dSC = fastSC - slowSC;
    const ERSC = ER * dSC;
    const SSC = ERSC + slowSC;

    const amaVal = ama0 + Math.pow(SSC, G) * (close - ama0);
    ama[pos] = amaVal;

    const ddK = amaVal - ama0;
    if (Math.abs(ddK) > dKThreshold && ddK > 0) {
      upSignal[pos] = amaVal;
    } else if (Math.abs(ddK) > dKThreshold && ddK < 0) {
      downSignal[pos] = amaVal;
    }

    ama0 = amaVal;
  }

  return { ama, upSignal, downSignal };
}

// ─────────────────────────────────────────────────────────────
// 2. Supertrend (CCI-based)
//    Parameters: cciPeriod=50, atrPeriod=5
// ─────────────────────────────────────────────────────────────
export interface SupertrendParams {
  cciPeriod?: number; // CCI period (default 50)
  atrPeriod?: number; // ATR period (default 5)
}

export interface SupertrendResult {
  value: (number | null)[];
  direction: (1 | -1 | 0)[]; // 1=up (blue), -1=down (red)
}

function calcCCI(bars: OHLCBar[], period: number): number[] {
  const n = bars.length;
  const result: number[] = new Array(n).fill(NaN);
  const typical: number[] = bars.map(b => (b.high + b.low + b.close) / 3);

  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += typical[i - j];
    const mean = sum / period;

    let dev = 0;
    for (let j = 0; j < period; j++) dev += Math.abs(typical[i - j] - mean);
    const meanDev = dev / period;

    result[i] = meanDev === 0 ? 0 : (typical[i] - mean) / (0.015 * meanDev);
  }
  return result;
}

export function calcSupertrend(bars: OHLCBar[], params: SupertrendParams = {}): SupertrendResult {
  const { cciPeriod = 50, atrPeriod = 5 } = params;
  const n = bars.length;
  const value: (number | null)[] = new Array(n).fill(null);
  const direction: (1 | -1 | 0)[] = new Array(n).fill(0);

  const cci = calcCCI(bars, cciPeriod);
  const atr = calcATR(bars, atrPeriod);

  // trend: 1=up, -1=down
  const trend: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!isNaN(cci[i])) {
      trend[i] = cci[i] > 0 ? 1 : cci[i] < 0 ? -1 : (i > 0 ? trend[i - 1] : 0);
    } else {
      trend[i] = i > 0 ? trend[i - 1] : 0;
    }
  }

  // Calculate Supertrend value
  for (let i = 0; i < n; i++) {
    if (isNaN(atr[i])) continue;

    let val: number;
    if (i === 0) {
      val = bars[i].close;
    } else {
      const prev = value[i - 1] ?? bars[i - 1].close;
      if (trend[i] === 1) {
        val = Math.max(bars[i].low - atr[i], prev);
      } else {
        val = Math.min(bars[i].high + atr[i], prev);
      }
    }
    value[i] = val;

    // Direction: compare current vs previous value
    if (i > 0 && value[i - 1] !== null) {
      const prevVal = value[i - 1]!;
      direction[i] = val > prevVal ? 1 : val < prevVal ? -1 : direction[i - 1];
    }
  }

  return { value, direction };
}

// ─────────────────────────────────────────────────────────────
// 3. TrendWave
//    Parameters: WavePeriod=10, AvgPeriod=21
//    Levels: overbought=53, oversold=-50
// ─────────────────────────────────────────────────────────────
export interface TrendWaveParams {
  wavePeriod?: number; // EMA period for ESA (default 10)
  avgPeriod?: number;  // EMA period for CI smoothing (default 21)
}

export interface TrendWaveResult {
  bull: (number | null)[];   // Main line (green when above signal)
  bear: (number | null)[];   // Signal line (SMA 4 of bull)
  buyDot: (number | null)[]; // Buy signal dots
  sellDot: (number | null)[]; // Sell signal dots
}

export function calcTrendWave(bars: OHLCBar[], params: TrendWaveParams = {}): TrendWaveResult {
  const { wavePeriod = 10, avgPeriod = 21 } = params;
  const n = bars.length;

  const bull: (number | null)[] = new Array(n).fill(null);
  const bear: (number | null)[] = new Array(n).fill(null);
  const buyDot: (number | null)[] = new Array(n).fill(null);
  const sellDot: (number | null)[] = new Array(n).fill(null);

  // Step 1: ESA = EMA(Typical Price, WavePeriod)
  const typical = bars.map(b => (b.high + b.low + b.close) / 3);
  const esa = calcEMA(typical, wavePeriod);

  // Step 2: DD = EMA(|Typical - ESA|, WavePeriod)
  const absDevArr = typical.map((tp, i) => isNaN(esa[i]) ? NaN : Math.abs(tp - esa[i]));
  const dd = calcEMA(absDevArr, wavePeriod);

  // Step 3: CI = (Typical - ESA) / (0.015 * DD)
  const ci: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!isNaN(dd[i]) && dd[i] > 0) {
      ci[i] = (typical[i] - esa[i]) / (0.015 * dd[i]);
    }
  }

  // Step 4: TCI (Bull line) = EMA(CI, AvgPeriod)
  const tci = calcEMA(ci, avgPeriod);

  // Step 5: Signal (Bear line) = SMA(TCI, 4)
  const signal = calcSMA(tci, 4);

  // Fill output arrays
  const OVERSOLD = -50;
  const OVERBOUGHT = 53;

  for (let i = 0; i < n; i++) {
    if (!isNaN(tci[i])) bull[i] = tci[i];
    if (!isNaN(signal[i])) bear[i] = signal[i];

    // Buy dot: TCI crosses above signal from below, while TCI < OVERSOLD
    if (i > 0 && !isNaN(tci[i]) && !isNaN(signal[i]) && !isNaN(tci[i - 1]) && !isNaN(signal[i - 1])) {
      if (tci[i] >= signal[i] && tci[i - 1] < signal[i - 1] && tci[i] < OVERSOLD) {
        buyDot[i] = tci[i];
      }
      // Sell dot: TCI crosses below signal from above, while TCI > OVERBOUGHT
      if (tci[i] <= signal[i] && tci[i - 1] > signal[i - 1] && tci[i] > OVERBOUGHT) {
        sellDot[i] = signal[i];
      }
    }
  }

  return { bull, bear, buyDot, sellDot };
}

// ─────────────────────────────────────────────────────────────
// 4. MACD (Standard 12/26/9)
// ─────────────────────────────────────────────────────────────
export interface MACDParams {
  fastPeriod?: number;   // default 12
  slowPeriod?: number;   // default 26
  signalPeriod?: number; // default 9
}

export interface MACDResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

export function calcMACD(bars: OHLCBar[], params: MACDParams = {}): MACDResult {
  const { fastPeriod = 12, slowPeriod = 26, signalPeriod = 9 } = params;
  const n = bars.length;

  const closes = bars.map(b => b.close);
  const fastEMA = calcEMA(closes, fastPeriod);
  const slowEMA = calcEMA(closes, slowPeriod);

  const macdRaw: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
      macdRaw[i] = fastEMA[i] - slowEMA[i];
    }
  }

  const signalRaw = calcEMA(macdRaw, signalPeriod);

  const macdLine: (number | null)[] = macdRaw.map(v => isNaN(v) ? null : v);
  const signalLine: (number | null)[] = signalRaw.map(v => isNaN(v) ? null : v);
  const histogram: (number | null)[] = macdRaw.map((v, i) =>
    isNaN(v) || isNaN(signalRaw[i]) ? null : v - signalRaw[i]
  );

  return { macdLine, signalLine, histogram };
}
