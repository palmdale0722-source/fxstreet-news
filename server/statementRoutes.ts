/**
 * MT4 对账单导入路由
 * POST /api/statement/preview  - 预览解析结果（不写入数据库）
 * POST /api/statement/import   - 解析并批量写入 trade_journal
 */
import type { Express, Request, Response } from "express";
import { parseDetailedStatement } from "./statementParser";
import { createTradeJournalEntry, getDb } from "./db";
import { tradeJournal } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { sdk } from "./_core/sdk";

/**
 * 从请求中获取已登录用户，失败返回 null
 */
async function getAuthUser(req: Request) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export function registerStatementRoutes(app: Express) {
  /**
   * POST /api/statement/preview
   * 仅解析不写入，返回解析结果预览（前 10 条 + 汇总）
   */
  app.post("/api/statement/preview", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "请先登录" });
      return;
    }

    const { html } = req.body as { html: string };
    if (!html || typeof html !== "string" || html.length < 100) {
      res.status(400).json({ success: false, message: "请提供有效的 HTML 内容" });
      return;
    }

    try {
      const result = parseDetailedStatement(html);
      const preview = result.trades.slice(0, 10).map(t => ({
        ticket: t.ticket,
        pair: t.pair,
        direction: t.direction,
        lotSize: t.lotSize,
        openTime: t.openTime.toISOString(),
        closeTime: t.closeTime?.toISOString() ?? null,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        pnl: t.pnl,
        status: t.status,
        ea: t.ea,
        tags: t.tags,
      }));

      res.json({
        success: true,
        total: result.trades.length,
        preview,
        summary: result.summary,
        parseErrors: result.errors,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: `解析失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  /**
   * POST /api/statement/import
   * Body: { html: string, mode: "skip" | "overwrite" }
   *   - html: DetailedStatement.htm 的完整 HTML 内容
   *   - mode: "skip" 跳过已存在的 ticket，"overwrite" 覆盖已存在的 ticket
   */
  app.post("/api/statement/import", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, message: "请先登录" });
      return;
    }

    const { html, mode = "skip" } = req.body as { html: string; mode?: "skip" | "overwrite" };
    if (!html || typeof html !== "string" || html.length < 100) {
      res.status(400).json({ success: false, message: "请提供有效的 HTML 内容" });
      return;
    }

    try {
      const result = parseDetailedStatement(html);
      const { trades, summary, errors: parseErrors } = result;

      if (trades.length === 0) {
        res.json({
          success: false,
          message: "未解析到任何交易记录，请确认文件格式正确",
          summary,
          parseErrors,
        });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ success: false, message: "数据库连接失败" });
        return;
      }

      // 查询该用户所有已导入的记录，提取 ticket 标识
      const existingRecords = await db
        .select({ id: tradeJournal.id, tags: tradeJournal.tags })
        .from(tradeJournal)
        .where(eq(tradeJournal.userId, user.id));

      const existingTicketMap = new Map<string, number>(); // ticket -> record id
      for (const rec of existingRecords) {
        const m = (rec.tags || "").match(/ticket:(\d+)/);
        if (m) existingTicketMap.set(m[1], rec.id);
      }

      let inserted = 0;
      let skipped = 0;
      let overwritten = 0;
      const importErrors: string[] = [];

      for (const trade of trades) {
        const existingId = existingTicketMap.get(trade.ticket);

        if (existingId !== undefined && mode === "skip") {
          skipped++;
          continue;
        }

        // tags 中加入 ticket 标识，方便后续去重
        const tagsWithTicket = trade.tags
          ? `${trade.tags},ticket:${trade.ticket}`
          : `ticket:${trade.ticket}`;

        const entry = {
          userId: user.id,
          pair: trade.pair,
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice ?? undefined,
          stopLoss: trade.stopLoss ?? undefined,
          takeProfit: trade.takeProfit ?? undefined,
          lotSize: trade.lotSize,
          pnl: trade.pnl,
          openTime: trade.openTime,
          closeTime: trade.closeTime ?? undefined,
          status: trade.status,
          summary: trade.ea ? `EA: ${trade.ea}` : undefined,
          lesson: undefined,
          tags: tagsWithTicket,
        };

        try {
          if (existingId !== undefined && mode === "overwrite") {
            await db.update(tradeJournal)
              .set(entry as Record<string, unknown>)
              .where(and(eq(tradeJournal.id, existingId), eq(tradeJournal.userId, user.id)));
            overwritten++;
          } else {
            await createTradeJournalEntry(entry);
            inserted++;
          }
        } catch (err) {
          importErrors.push(`Ticket ${trade.ticket}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      console.log(`[Statement] User ${user.id} import: +${inserted} new, ${skipped} skipped, ${overwritten} overwritten`);

      res.json({
        success: true,
        message: `导入完成：新增 ${inserted} 条，跳过 ${skipped} 条${overwritten > 0 ? `，覆盖 ${overwritten} 条` : ""}`,
        inserted,
        skipped,
        overwritten,
        total: trades.length,
        summary,
        parseErrors: [...parseErrors, ...importErrors],
      });
    } catch (err) {
      console.error("[Statement] Import error:", err);
      res.status(500).json({
        success: false,
        message: `解析失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
