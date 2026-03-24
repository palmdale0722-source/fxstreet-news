/**
 * MT4 数据推送接收路由
 * POST /api/mt4/push          - EA 推送行情数据（K线）
 * POST /api/mt4/indicators    - EA 推送自定义指标信号
 * GET  /api/mt4/status        - 查询 MT4 连接状态
 * GET  /api/mt4/bars/:symbol  - 查询指定货币对的 K 线数据
 */
import type { Express, Request, Response } from "express";
import { saveMt4Bars, getMt4Bars, getMt4ConnectionStatus, G8_SYMBOLS, type Mt4PushPayload } from "./mt4Service";
import { upsertIndicatorSignal, upsertTwValues, upsertTfSignals, getTwValues, getTfSignals } from "./db";

// MT4 API 密钥（用于 EA 鉴权）
function getMt4ApiKey(): string {
  return process.env.MT4_API_KEY || "mt4-bridge-key-change-me";
}

function authCheck(req: Request, res: Response): boolean {
  const apiKey = req.headers["x-mt4-api-key"] as string;
  if (!apiKey || apiKey !== getMt4ApiKey()) {
    res.status(401).json({ success: false, message: "Invalid API key" });
    return false;
  }
  return true;
}

export function registerMt4Routes(app: Express) {
  /**
   * POST /api/mt4/push
   * MT4 EA 推送行情数据（K线 OHLC）
   */
  app.post("/api/mt4/push", async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const payload = req.body as Mt4PushPayload;
    if (!payload.clientId) {
      res.status(400).json({ success: false, message: "clientId is required" });
      return;
    }
    if (!Array.isArray(payload.bars) || payload.bars.length === 0) {
      res.status(400).json({ success: false, message: "bars array is required and must not be empty" });
      return;
    }

    try {
      const result = await saveMt4Bars(payload);
      console.log(`[MT4] Received push from ${payload.clientId}: ${result.inserted} bars, symbols: ${result.symbols.join(", ")}`);
      res.json({
        success: true,
        inserted: result.inserted,
        symbols: result.symbols,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[MT4] Push error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  /**
   * POST /api/mt4/indicators
   * MT4 EA 推送自定义指标信号
   * Body: {
   *   clientId: string,
   *   signals: [{
   *     symbol: string,        // 货币对，如 EURUSD
   *     timeframe: string,     // 时间周期，如 M15
   *     indicatorName: string, // 指标名称（不含.ex4）
   *     value1?: string,       // 主值
   *     value2?: string,       // 副值/信号线
   *     value3?: string,       // 可选第三值
   *     signal?: "buy"|"sell"|"neutral"|"overbought"|"oversold",
   *     description?: string   // 信号描述
   *   }]
   * }
   */
  app.post("/api/mt4/indicators", async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;

    const { clientId, signals } = req.body as {
      clientId: string;
      signals: Array<{
        symbol: string;
        timeframe: string;
        indicatorName: string;
        value1?: string;
        value2?: string;
        value3?: string;
        signal?: "buy" | "sell" | "neutral" | "overbought" | "oversold";
        description?: string;
      }>;
    };

    if (!clientId) {
      res.status(400).json({ success: false, message: "clientId is required" });
      return;
    }
    if (!Array.isArray(signals) || signals.length === 0) {
      res.status(400).json({ success: false, message: "signals array is required" });
      return;
    }

    try {
      let saved = 0;
      for (const s of signals) {
        if (!s.symbol || !s.timeframe || !s.indicatorName) continue;
        await upsertIndicatorSignal({
          symbol: s.symbol.toUpperCase(),
          timeframe: s.timeframe,
          indicatorName: s.indicatorName,
          value1: s.value1 ?? null,
          value2: s.value2 ?? null,
          value3: s.value3 ?? null,
          signal: s.signal ?? "neutral",
          description: s.description ?? null,
          pushedAt: new Date(),
        });
        saved++;
      }
      console.log(`[MT4] Received ${saved} indicator signals from ${clientId}`);
      res.json({ success: true, saved, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[MT4] Indicator push error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  /**
   * POST /api/mt4/tw
   * MT4 EA 推送 TrendWave 多周期 Bull/Bear/Threshold 数值
   * Body: {
   *   clientId: string,
   *   rows: [{ symbol, timeframe, barTime, bull, bear, threshold }]
   * }
   */
  app.post("/api/mt4/tw", async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;
    const { clientId, rows } = req.body as {
      clientId: string;
      rows: Array<{
        symbol: string;
        timeframe: string;
        barTime: string;
        bull: string;
        bear: string;
        threshold?: string;
      }>;
    };
    if (!clientId) { res.status(400).json({ success: false, message: "clientId is required" }); return; }
    if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ success: false, message: "rows array is required" }); return; }
    try {
      const toInsert = rows
        .filter(r => r.symbol && r.timeframe && r.barTime && r.bull !== undefined && r.bear !== undefined)
        .map(r => ({
          symbol: r.symbol.toUpperCase(),
          timeframe: r.timeframe,
          barTime: new Date(r.barTime),
          bull: r.bull,
          bear: r.bear,
          threshold: r.threshold ?? null,
          pushedAt: new Date(),
        }));
      const saved = await upsertTwValues(toInsert);
      console.log(`[MT4] TrendWave: ${saved} rows from ${clientId}`);
      res.json({ success: true, saved, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[MT4] TW push error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  /**
   * POST /api/mt4/tf
   * MT4 EA 推送 TrendFollower 信号（仅 buy/sell，跳过 0）
   * Body: {
   *   clientId: string,
   *   signals: [{ symbol, timeframe, barTime, signal }]
   * }
   */
  app.post("/api/mt4/tf", async (req: Request, res: Response) => {
    if (!authCheck(req, res)) return;
    const { clientId, signals } = req.body as {
      clientId: string;
      signals: Array<{
        symbol: string;
        timeframe: string;
        barTime: string;
        signal: "buy" | "sell";
      }>;
    };
    if (!clientId) { res.status(400).json({ success: false, message: "clientId is required" }); return; }
    if (!Array.isArray(signals) || signals.length === 0) { res.status(400).json({ success: false, message: "signals array is required" }); return; }
    try {
      const toInsert = signals
        .filter(s => s.symbol && s.timeframe && s.barTime && (s.signal === "buy" || s.signal === "sell"))
        .map(s => ({
          symbol: s.symbol.toUpperCase(),
          timeframe: s.timeframe,
          barTime: new Date(s.barTime),
          signal: s.signal,
          pushedAt: new Date(),
        }));
      const saved = await upsertTfSignals(toInsert);
      console.log(`[MT4] TrendFollower: ${saved} signals from ${clientId}`);
      res.json({ success: true, saved, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[MT4] TF push error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  /**
   * GET /api/mt4/tw/:symbol
   * 查询指定货币对的 TrendWave 数值序列
   */
  app.get("/api/mt4/tw/:symbol", async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase().replace("/", "");
    const timeframe = (req.query.timeframe as string) || "M15";
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    try {
      const rows = await getTwValues(symbol, timeframe, limit);
      res.json({ success: true, symbol, timeframe, count: rows.length, rows });
    } catch (err) {
      res.status(500).json({ success: false, rows: [] });
    }
  });

  /**
   * GET /api/mt4/tf/:symbol
   * 查询指定货币对的 TrendFollower 信号历史
   */
  app.get("/api/mt4/tf/:symbol", async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase().replace("/", "");
    const timeframe = (req.query.timeframe as string) || "M15";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    try {
      const sigs = await getTfSignals(symbol, timeframe, limit);
      res.json({ success: true, symbol, timeframe, count: sigs.length, signals: sigs });
    } catch (err) {
      res.status(500).json({ success: false, signals: [] });
    }
  });

  /**
   * GET /api/mt4/status
   * 查询 MT4 连接状态（公开接口，供前端展示）
   */
  app.get("/api/mt4/status", async (_req: Request, res: Response) => {
    try {
      const statuses = await getMt4ConnectionStatus();
      res.json({ success: true, statuses });
    } catch (err) {
      console.error("[MT4] Status query error:", err);
      res.status(500).json({ success: false, statuses: [] });
    }
  });

  /**
   * GET /api/mt4/bars/:symbol
   * 查询指定货币对的最新 K 线（供调试用）
   */
  app.get("/api/mt4/bars/:symbol", async (req: Request, res: Response) => {
    const symbol = req.params.symbol.toUpperCase().replace("/", "");
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const timeframe = (req.query.timeframe as string) || "M15";

    if (!G8_SYMBOLS.includes(symbol)) {
      res.status(400).json({ success: false, message: `Unknown symbol: ${symbol}` });
      return;
    }

    try {
      const bars = await getMt4Bars(symbol, limit, timeframe);
      res.json({ success: true, symbol, timeframe, count: bars.length, bars });
    } catch (err) {
      console.error("[MT4] Bars query error:", err);
      res.status(500).json({ success: false, bars: [] });
    }
  });
}
