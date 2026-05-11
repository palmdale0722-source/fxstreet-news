import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries } from "lightweight-charts";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

type Timeframe = "M15" | "H1" | "H4" | "D1";

interface CandlestickChartProps {
  symbol: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  direction?: "buy" | "sell";
  height?: number;
}

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "M15", value: "M15" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

export function CandlestickChart({
  symbol,
  entryPrice,
  stopLoss,
  takeProfit,
  direction,
  height = 400,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");

  // MT4 bars API call via fetch (not tRPC since it's a REST endpoint)
  const [bars, setBars] = useState<Array<{ barTime: string; open: string; high: string; low: string; close: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch bars data
  useEffect(() => {
    const mt4Symbol = symbol.replace("/", "");
    setLoading(true);
    setError(null);
    const limit = timeframe === "D1" ? 60 : timeframe === "H4" ? 60 : timeframe === "H1" ? 96 : 200;
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

  // Render chart
  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    // Add candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    // Convert bars to chart format (sorted ascending)
    const chartData = [...bars]
      .reverse()
      .map(b => ({
        time: Math.floor(new Date(b.barTime).getTime() / 1000) as any,
        open: parseFloat(b.open),
        high: parseFloat(b.high),
        low: parseFloat(b.low),
        close: parseFloat(b.close),
      }))
      .filter(b => !isNaN(b.open) && !isNaN(b.high) && !isNaN(b.low) && !isNaN(b.close));

    candleSeries.setData(chartData);

    // Add price lines for entry, SL, TP
    if (entryPrice) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: "#60a5fa",
        lineWidth: 2,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: "入场",
      });
    }
    if (stopLoss) {
      candleSeries.createPriceLine({
        price: stopLoss,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "止损",
      });
    }
    if (takeProfit) {
      candleSeries.createPriceLine({
        price: takeProfit,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "止盈",
      });
    }

    chart.timeScale().fitContent();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, entryPrice, stopLoss, takeProfit, height]);

  return (
    <div className="flex flex-col gap-2">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1">
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
        <span className="ml-auto text-xs text-muted-foreground">
          {symbol} · {timeframe}
          {bars.length > 0 && ` · ${bars.length} 根`}
        </span>
      </div>

      {/* Chart container */}
      <div className="relative rounded-lg overflow-hidden border border-border bg-card">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
            <div className="text-sm text-muted-foreground">加载中...</div>
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center bg-card" style={{ height }}>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        )}
        {!error && (
          <div ref={containerRef} style={{ height }} />
        )}
      </div>
    </div>
  );
}
