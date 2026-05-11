import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from "lightweight-charts";
import { Button } from "@/components/ui/button";
import {
  calcAMA,
  calcSupertrend,
  calcTrendWave,
  calcMACD,
  type OHLCBar,
} from "@/lib/indicators";

type Timeframe = "M15" | "H1" | "H4" | "D1";

interface CandlestickChartProps {
  symbol: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  direction?: "buy" | "sell";
  mainHeight?: number;
  height?: number; // alias for mainHeight (backward compat)
  showIndicators?: boolean;
}

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "M15", value: "M15" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

// ─── Helper: convert null-padded indicator array to lightweight-charts format ───
function toLineData(
  times: number[],
  values: (number | null)[]
): { time: any; value: number }[] {
  return times
    .map((t, i) => ({ time: t as any, value: values[i] as number }))
    .filter(d => d.value !== null && !isNaN(d.value));
}

function toHistogramData(
  times: number[],
  values: (number | null)[],
  posColor: string,
  negColor: string
): { time: any; value: number; color: string }[] {
  return times
    .map((t, i) => ({
      time: t as any,
      value: values[i] as number,
      color: (values[i] ?? 0) >= 0 ? posColor : negColor,
    }))
    .filter(d => d.value !== null && !isNaN(d.value));
}

export function CandlestickChart({
  symbol,
  entryPrice,
  stopLoss,
  takeProfit,
  direction,
  mainHeight: mainHeightProp = 360,
  height,
  showIndicators = true,
}: CandlestickChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const trendwaveRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const trendwaveChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const macdChartRef = useRef<ReturnType<typeof createChart> | null>(null);

  const mainHeight = height ?? mainHeightProp;
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [bars, setBars] = useState<Array<{
    barTime: string; open: string; high: string; low: string; close: string;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Indicator toggles ──
  const [showAMA, setShowAMA] = useState(true);
  const [showSupertrend, setShowSupertrend] = useState(true);
  const [showTrendWave, setShowTrendWave] = useState(true);
  const [showMACD, setShowMACD] = useState(true);

  // Fetch bars
  useEffect(() => {
    const mt4Symbol = symbol.replace("/", "");
    setLoading(true);
    setError(null);
    const limit = timeframe === "D1" ? 60 : timeframe === "H4" ? 80 : timeframe === "H1" ? 120 : 200;
    fetch(`/api/mt4/bars/${mt4Symbol}?timeframe=${timeframe}&limit=${limit}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.success && Array.isArray(data.bars)) {
          setBars(data.bars);
        } else {
          setError("暂无 K 线数据");
        }
      })
      .catch(() => setError("获取数据失败"))
      .finally(() => setLoading(false));
  }, [symbol, timeframe]);

  // ── Render all charts ──
  useEffect(() => {
    if (!mainRef.current || bars.length === 0) return;

    // Destroy previous charts
    [mainChartRef, trendwaveChartRef, macdChartRef].forEach(ref => {
      if (ref.current) { ref.current.remove(); ref.current = null; }
    });

    // Convert bars to OHLCBar format (ascending order)
    const ohlcBars: OHLCBar[] = [...bars]
      .reverse()
      .map(b => ({
        time: Math.floor(new Date(b.barTime).getTime() / 1000),
        open: parseFloat(b.open),
        high: parseFloat(b.high),
        low: parseFloat(b.low),
        close: parseFloat(b.close),
      }))
      .filter(b => !isNaN(b.open));

    const times = ohlcBars.map(b => b.time);

    const chartOptions = (height: number) => ({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#374151" },
      timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
      width: mainRef.current!.clientWidth,
      height,
    });

    // ── Main chart ──
    const mainChart = createChart(mainRef.current, chartOptions(mainHeight));
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(ohlcBars.map(b => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })));

    // Entry / SL / TP lines
    if (entryPrice) {
      candleSeries.createPriceLine({ price: entryPrice, color: "#60a5fa", lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: "入场" });
    }
    if (stopLoss) {
      candleSeries.createPriceLine({ price: stopLoss, color: "#ef4444", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "止损" });
    }
    if (takeProfit) {
      candleSeries.createPriceLine({ price: takeProfit, color: "#22c55e", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "止盈" });
    }

    // ── AMA overlay ──
    if (showIndicators && showAMA) {
      const { ama, upSignal, downSignal } = calcAMA(ohlcBars);

      const amaLine = mainChart.addSeries(LineSeries, {
        color: "#d97706", // amber/sienna
        lineWidth: 2,
        title: "AMA",
        priceLineVisible: false,
        lastValueVisible: true,
      });
      amaLine.setData(toLineData(times, ama));

      // Up signal dots (blue)
      const amaUpLine = mainChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        title: "",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      amaUpLine.setData(toLineData(times, upSignal));

      // Down signal dots (red)
      const amaDownLine = mainChart.addSeries(LineSeries, {
        color: "#ef4444",
        lineWidth: 1,
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        title: "",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      amaDownLine.setData(toLineData(times, downSignal));
    }

    // ── Supertrend overlay ──
    if (showIndicators && showSupertrend) {
      const { value, direction: stDir } = calcSupertrend(ohlcBars);

      // Split into up (blue) and down (red) segments
      const upData: { time: any; value: number }[] = [];
      const downData: { time: any; value: number }[] = [];

      for (let i = 0; i < times.length; i++) {
        if (value[i] === null) continue;
        const v = value[i]!;
        if (stDir[i] >= 0) {
          upData.push({ time: times[i] as any, value: v });
        } else {
          downData.push({ time: times[i] as any, value: v });
        }
      }

      const stUpLine = mainChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        title: "ST↑",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      stUpLine.setData(upData);

      const stDownLine = mainChart.addSeries(LineSeries, {
        color: "#ef4444",
        lineWidth: 2,
        title: "ST↓",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      stDownLine.setData(downData);
    }

    mainChart.timeScale().fitContent();

    // ── TrendWave sub-chart ──
    if (showIndicators && showTrendWave && trendwaveRef.current) {
      const twChart = createChart(trendwaveRef.current, {
        ...chartOptions(120),
        rightPriceScale: { borderColor: "#374151", scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      trendwaveChartRef.current = twChart;

      const { bull, bear, buyDot, sellDot } = calcTrendWave(ohlcBars);

      // Bull line (green)
      const bullLine = twChart.addSeries(LineSeries, {
        color: "#22c55e",
        lineWidth: 1,
        title: "TW",
        priceLineVisible: false,
        lastValueVisible: true,
      });
      bullLine.setData(toLineData(times, bull));

      // Bear/signal line (red)
      const bearLine = twChart.addSeries(LineSeries, {
        color: "#ef4444",
        lineWidth: 1,
        title: "Sig",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bearLine.setData(toLineData(times, bear));

      // Buy dots (aqua)
      const buyDotLine = twChart.addSeries(LineSeries, {
        color: "#06b6d4",
        lineWidth: 1,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        title: "",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      buyDotLine.setData(toLineData(times, buyDot));

      // Sell dots (yellow)
      const sellDotLine = twChart.addSeries(LineSeries, {
        color: "#eab308",
        lineWidth: 1,
        pointMarkersVisible: true,
        pointMarkersRadius: 5,
        title: "",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sellDotLine.setData(toLineData(times, sellDot));

      // Reference levels
      twChart.addSeries(LineSeries, { color: "#4b5563", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, title: "" })
        .setData(times.map(t => ({ time: t as any, value: 53 })));
      twChart.addSeries(LineSeries, { color: "#4b5563", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, title: "" })
        .setData(times.map(t => ({ time: t as any, value: -50 })));
      twChart.addSeries(LineSeries, { color: "#374151", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, title: "" })
        .setData(times.map(t => ({ time: t as any, value: 0 })));

      twChart.timeScale().fitContent();

      // Sync crosshair with main chart
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) twChart.timeScale().setVisibleLogicalRange(range);
      });
      twChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // ── MACD sub-chart ──
    if (showIndicators && showMACD && macdRef.current) {
      const macdChart = createChart(macdRef.current, {
        ...chartOptions(100),
        rightPriceScale: { borderColor: "#374151", scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      macdChartRef.current = macdChart;

      const { macdLine, signalLine, histogram } = calcMACD(ohlcBars);

      // Histogram
      const histSeries = macdChart.addSeries(HistogramSeries, {
        title: "MACD",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histSeries.setData(toHistogramData(times, histogram, "#22c55e55", "#ef444455"));

      // MACD line (blue)
      const macdLineSeries = macdChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
        title: "MACD",
        priceLineVisible: false,
        lastValueVisible: true,
      });
      macdLineSeries.setData(toLineData(times, macdLine));

      // Signal line (orange)
      const signalLineSeries = macdChart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 1,
        title: "Signal",
        priceLineVisible: false,
        lastValueVisible: true,
      });
      signalLineSeries.setData(toLineData(times, signalLine));

      // Zero line
      macdChart.addSeries(LineSeries, { color: "#374151", lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false, title: "" })
        .setData(times.map(t => ({ time: t as any, value: 0 })));

      macdChart.timeScale().fitContent();

      // Sync with main chart
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) macdChart.timeScale().setVisibleLogicalRange(range);
      });
      macdChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // ── Resize observer ──
    const resizeObserver = new ResizeObserver(() => {
      if (!mainRef.current) return;
      const w = mainRef.current.clientWidth;
      mainChartRef.current?.applyOptions({ width: w });
      trendwaveChartRef.current?.applyOptions({ width: w });
      macdChartRef.current?.applyOptions({ width: w });
    });
    resizeObserver.observe(mainRef.current);

    return () => {
      resizeObserver.disconnect();
      mainChartRef.current?.remove(); mainChartRef.current = null;
      trendwaveChartRef.current?.remove(); trendwaveChartRef.current = null;
      macdChartRef.current?.remove(); macdChartRef.current = null;
    };
  }, [bars, entryPrice, stopLoss, takeProfit, mainHeight, showAMA, showSupertrend, showTrendWave, showMACD, showIndicators]);

  return (
    <div className="flex flex-col gap-1">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap">
        {TIMEFRAMES.map(tf => (
          <Button
            key={tf.value}
            variant={timeframe === tf.value ? "default" : "outline"}
            size="sm"
            onClick={() => setTimeframe(tf.value)}
            className="h-7 px-3 text-xs"
          >
            {tf.label}
          </Button>
        ))}

        {showIndicators && (
          <div className="flex items-center gap-1 ml-2 border-l border-border pl-2">
            {[
              { key: "AMA", state: showAMA, toggle: () => setShowAMA(v => !v), color: "#d97706" },
              { key: "ST", state: showSupertrend, toggle: () => setShowSupertrend(v => !v), color: "#3b82f6" },
              { key: "TW", state: showTrendWave, toggle: () => setShowTrendWave(v => !v), color: "#22c55e" },
              { key: "MACD", state: showMACD, toggle: () => setShowMACD(v => !v), color: "#f97316" },
            ].map(ind => (
              <button
                key={ind.key}
                onClick={ind.toggle}
                className={`h-7 px-2 text-xs rounded border transition-all ${
                  ind.state
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground opacity-50"
                }`}
                style={ind.state ? { backgroundColor: ind.color + "33", borderColor: ind.color, color: ind.color } : {}}
              >
                {ind.key}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {symbol} · {timeframe}
          {bars.length > 0 && ` · ${bars.length} 根`}
        </span>
      </div>

      {/* Chart area */}
      <div className="rounded-lg overflow-hidden border border-border bg-card">
        {loading && (
          <div className="flex items-center justify-center bg-card" style={{ height: mainHeight }}>
            <div className="text-sm text-muted-foreground animate-pulse">加载 K 线数据...</div>
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center bg-card" style={{ height: mainHeight }}>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        )}
        {!error && !loading && (
          <>
            {/* Main candlestick chart */}
            <div ref={mainRef} style={{ height: mainHeight }} />

            {/* TrendWave sub-chart */}
            {showIndicators && showTrendWave && (
              <div className="border-t border-border">
                <div className="px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                  TrendWave <span className="text-green-400">Bull</span> / <span className="text-red-400">Bear</span>
                  <span className="ml-2 text-gray-500">OB:53 OS:-50</span>
                </div>
                <div ref={trendwaveRef} style={{ height: 120 }} />
              </div>
            )}

            {/* MACD sub-chart */}
            {showIndicators && showMACD && (
              <div className="border-t border-border">
                <div className="px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                  MACD <span className="text-blue-400">12</span>/<span className="text-blue-400">26</span>
                  <span className="text-orange-400 ml-1">Signal 9</span>
                </div>
                <div ref={macdRef} style={{ height: 100 }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
