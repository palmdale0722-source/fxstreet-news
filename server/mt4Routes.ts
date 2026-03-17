/**
 * MT4 数据推送接收路由
 * POST /api/mt4/push  - EA 推送行情数据
 * GET  /api/mt4/status - 查询 MT4 连接状态
 * GET  /api/mt4/bars/:symbol - 查询指定货币对的 K 线数据
 */
import type { Express, Request, Response } from "express";
import { saveMt4Bars, getMt4Bars, getMt4ConnectionStatus, G8_SYMBOLS, type Mt4PushPayload } from "./mt4Service";

// MT4 API 密钥（用于 EA 鉴权）
// 从环境变量读取，未设置时使用默认值
function getMt4ApiKey(): string {
  return process.env.MT4_API_KEY || "mt4-bridge-key-change-me";
}

export function registerMt4Routes(app: Express) {
  /**
   * POST /api/mt4/push
   * MT4 EA 推送行情数据
   * Header: X-MT4-API-Key: <api_key>
   * Body: { clientId, accountNumber?, broker?, timeframe?, bars: [...] }
   */
  app.post("/api/mt4/push", async (req: Request, res: Response) => {
    // 鉴权
    const apiKey = req.headers["x-mt4-api-key"] as string;
    if (!apiKey || apiKey !== getMt4ApiKey()) {
      res.status(401).json({ success: false, message: "Invalid API key" });
      return;
    }

    const payload = req.body as Mt4PushPayload;

    // 基本校验
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
   * Query: ?limit=50&timeframe=M15
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
