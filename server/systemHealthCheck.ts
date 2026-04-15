/**
 * 全系统自检服务
 * 检查各模块健康状态，生成报告并推送通知
 */
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  news,
  signals,
  signalAnalyses,
  tvIdeas,
  currencyStrengthCache,
  imapConfig,
  systemHealthReports,
} from "../drizzle/schema";
import { desc, gte, count, sql } from "drizzle-orm";

export type CheckStatus = "ok" | "warn" | "error";

export interface ModuleCheckResult {
  module: string;
  status: CheckStatus;
  message: string;
  detail?: string;
  lastActivityAt?: string | null;
}

export interface HealthReport {
  id?: number;
  runAt: string;
  overallStatus: CheckStatus;
  checks: ModuleCheckResult[];
  summary: string;
  durationMs: number;
}

// ─── 各模块检查函数 ────────────────────────────────────────────────────────────

async function checkDatabase(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "数据库连接", status: "error", message: "数据库实例未初始化" };
    await db.execute(sql`SELECT 1`);
    return { module: "数据库连接", status: "ok", message: "数据库连接正常" };
  } catch (e: any) {
    return { module: "数据库连接", status: "error", message: "数据库连接失败", detail: e.message };
  }
}

async function checkImapConfig(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "IMAP 邮件拉取", status: "error", message: "数据库不可用" };

    // 检查 IMAP 配置（数据库或环境变量）
    const dbConfig = await db.select().from(imapConfig).limit(1);
    const hasDbConfig = dbConfig.length > 0 && dbConfig[0].email;
    const hasEnvConfig = !!(process.env.IMAP_EMAIL && process.env.IMAP_PASSWORD);

    if (!hasDbConfig && !hasEnvConfig) {
      return { module: "IMAP 邮件拉取", status: "error", message: "未找到 IMAP 配置（数据库和环境变量均未设置）" };
    }

    // 获取最新信号时间
    const latestSignal = await db.select({ createdAt: signals.createdAt }).from(signals).orderBy(desc(signals.createdAt)).limit(1);
    const lastActivity = latestSignal[0]?.createdAt ?? null;

    // 判断状态：如果最新信号超过 6 小时，发出警告
    if (lastActivity) {
      const lastTime = new Date(lastActivity + "Z").getTime();
      const hoursSince = (Date.now() - lastTime) / 1000 / 3600;
      if (hoursSince > 6) {
        return {
          module: "IMAP 邮件拉取",
          status: "warn",
          message: `IMAP 配置存在，但最近 ${Math.round(hoursSince)} 小时无新信号入库（可能是邮箱无新邮件，也可能是连接问题）`,
          lastActivityAt: lastActivity,
        };
      }
    }

    // 检查最近 2 小时内是否有新信号入库
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const twoHoursAgoStr = twoHoursAgo.toISOString().replace("T", " ").slice(0, 19);
    const recentSignals = await db.select({ cnt: count() }).from(signals).where(gte(signals.createdAt, twoHoursAgoStr));
    const recentCount = recentSignals[0]?.cnt ?? 0;

    return {
      module: "IMAP 邮件拉取",
      status: "ok",
      message: `IMAP 配置正常，最近 2 小时新增 ${recentCount} 条信号`,
      lastActivityAt: lastActivity,
    };
  } catch (e: any) {
    return { module: "IMAP 邮件拉取", status: "error", message: "检查 IMAP 状态时出错", detail: e.message };
  }
}

async function checkSignalAnalysis(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "交易信号 AI 分析", status: "error", message: "数据库不可用" };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneDayAgoStr = oneDayAgo.toISOString().replace("T", " ").slice(0, 19);

    const recentAnalyses = await db.select({ cnt: count() }).from(signalAnalyses).where(gte(signalAnalyses.analyzedAt, oneDayAgoStr));
    const recentCount = recentAnalyses[0]?.cnt ?? 0;

    const latestAnalysis = await db.select({ analyzedAt: signalAnalyses.analyzedAt }).from(signalAnalyses).orderBy(desc(signalAnalyses.analyzedAt)).limit(1);
    const lastActivity = latestAnalysis[0]?.analyzedAt ?? null;

    if (recentCount === 0) {
      return {
        module: "交易信号 AI 分析",
        status: "warn",
        message: "最近 24 小时无 AI 分析记录（可能是无新信号，或分析器未触发）",
        lastActivityAt: lastActivity,
      };
    }

    return {
      module: "交易信号 AI 分析",
      status: "ok",
      message: `AI 分析正常，最近 24 小时完成 ${recentCount} 条分析`,
      lastActivityAt: lastActivity,
    };
  } catch (e: any) {
    return { module: "交易信号 AI 分析", status: "error", message: "检查 AI 分析状态时出错", detail: e.message };
  }
}

async function checkNewsUpdate(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "RSS 新闻抓取", status: "error", message: "数据库不可用" };

    const latestNews = await db.select({ publishedAt: news.publishedAt }).from(news).orderBy(desc(news.publishedAt)).limit(1);
    const lastActivity = latestNews[0]?.publishedAt ?? null;

    if (!lastActivity) {
      return { module: "RSS 新闻抓取", status: "error", message: "数据库中无新闻数据" };
    }

    const lastTime = new Date(lastActivity + "Z").getTime();
    const hoursSince = (Date.now() - lastTime) / 1000 / 3600;

    if (hoursSince > 4) {
      return {
        module: "RSS 新闻抓取",
        status: "warn",
        message: `最新新闻距今已 ${Math.round(hoursSince)} 小时，可能存在抓取延迟`,
        lastActivityAt: lastActivity,
      };
    }

    return {
      module: "RSS 新闻抓取",
      status: "ok",
      message: `新闻抓取正常，最新新闻距今 ${Math.round(hoursSince)} 小时`,
      lastActivityAt: lastActivity,
    };
  } catch (e: any) {
    return { module: "RSS 新闻抓取", status: "error", message: "检查新闻状态时出错", detail: e.message };
  }
}

async function checkCurrencyStrength(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "货币强弱矩阵", status: "error", message: "数据库不可用" };

    const latest = await db.select({ updatedAt: currencyStrengthCache.updatedAt }).from(currencyStrengthCache).orderBy(desc(currencyStrengthCache.updatedAt)).limit(1);
    const lastActivity = latest[0]?.updatedAt ?? null;

    if (!lastActivity) {
      return { module: "货币强弱矩阵", status: "warn", message: "货币强弱矩阵尚未生成" };
    }

    const lastTime = new Date(lastActivity + "Z").getTime();
    const hoursSince = (Date.now() - lastTime) / 1000 / 3600;

    if (hoursSince > 30) {
      return {
        module: "货币强弱矩阵",
        status: "warn",
        message: `货币强弱矩阵距上次更新已 ${Math.round(hoursSince)} 小时（正常为每天更新）`,
        lastActivityAt: lastActivity,
      };
    }

    return {
      module: "货币强弱矩阵",
      status: "ok",
      message: `货币强弱矩阵正常，距上次更新 ${Math.round(hoursSince)} 小时`,
      lastActivityAt: lastActivity,
    };
  } catch (e: any) {
    return { module: "货币强弱矩阵", status: "error", message: "检查货币强弱矩阵时出错", detail: e.message };
  }
}

async function checkTvIdeas(): Promise<ModuleCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { module: "TradingView 想法采集", status: "error", message: "数据库不可用" };

    const latest = await db.select({ createdAt: tvIdeas.createdAt }).from(tvIdeas).orderBy(desc(tvIdeas.createdAt)).limit(1);
    const lastActivity = latest[0]?.createdAt ?? null;

    if (!lastActivity) {
      return { module: "TradingView 想法采集", status: "warn", message: "尚未采集到 TradingView 交易想法" };
    }

    const lastTime = new Date(lastActivity + "Z").getTime();
    const hoursSince = (Date.now() - lastTime) / 1000 / 3600;

    if (hoursSince > 4) {
      return {
        module: "TradingView 想法采集",
        status: "warn",
        message: `最新 TradingView 想法距今已 ${Math.round(hoursSince)} 小时，可能存在采集延迟`,
        lastActivityAt: lastActivity,
      };
    }

    return {
      module: "TradingView 想法采集",
      status: "ok",
      message: `TradingView 采集正常，最新想法距今 ${Math.round(hoursSince)} 小时`,
      lastActivityAt: lastActivity,
    };
  } catch (e: any) {
    return { module: "TradingView 想法采集", status: "error", message: "检查 TradingView 状态时出错", detail: e.message };
  }
}

async function checkLlmApi(): Promise<ModuleCheckResult> {
  try {
    const startTime = Date.now();
    const response = await invokeLLM({
      messages: [
        { role: "user", content: "Reply with exactly: OK" },
      ],
    });
    const elapsed = Date.now() - startTime;
    const content = (response as any)?.choices?.[0]?.message?.content ?? "";

    if (!content) {
      return { module: "LLM API", status: "error", message: "LLM API 返回空响应" };
    }

    return {
      module: "LLM API",
      status: "ok",
      message: `LLM API 正常，响应时间 ${elapsed}ms`,
    };
  } catch (e: any) {
    return { module: "LLM API", status: "error", message: "LLM API 调用失败", detail: e.message };
  }
}

// ─── 主自检函数 ────────────────────────────────────────────────────────────────

export async function runSystemHealthCheck(): Promise<HealthReport> {
  const startTime = Date.now();
  const runAt = new Date().toISOString().replace("T", " ").slice(0, 19);

  console.log("[HealthCheck] Starting system health check...");

  // 并行执行所有检查（LLM 检查单独执行，避免超时影响其他检查）
  const [dbCheck, imapCheck, signalCheck, newsCheck, strengthCheck, tvCheck] = await Promise.all([
    checkDatabase(),
    checkImapConfig(),
    checkSignalAnalysis(),
    checkNewsUpdate(),
    checkCurrencyStrength(),
    checkTvIdeas(),
  ]);

  // LLM 检查单独执行（有超时风险）
  const llmCheck = await checkLlmApi().catch((e) => ({
    module: "LLM API",
    status: "error" as CheckStatus,
    message: "LLM API 检查超时或失败",
    detail: e.message,
  }));

  const checks: ModuleCheckResult[] = [dbCheck, imapCheck, signalCheck, newsCheck, strengthCheck, tvCheck, llmCheck];

  // 计算整体状态
  const hasError = checks.some((c) => c.status === "error");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overallStatus: CheckStatus = hasError ? "error" : hasWarn ? "warn" : "ok";

  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const errorCount = checks.filter((c) => c.status === "error").length;

  const summary = `系统自检完成：${okCount} 项正常，${warnCount} 项警告，${errorCount} 项异常。整体状态：${
    overallStatus === "ok" ? "✅ 健康" : overallStatus === "warn" ? "⚠️ 需关注" : "❌ 存在故障"
  }`;

  const durationMs = Date.now() - startTime;

  const report: HealthReport = {
    runAt,
    overallStatus,
    checks,
    summary,
    durationMs,
  };

  // 保存到数据库
  try {
    const db = await getDb();
    if (db) {
      const inserted = await db.insert(systemHealthReports).values({
        runAt,
        overallStatus,
        checksJson: JSON.stringify(checks),
        summary,
        durationMs,
      });
      report.id = (inserted as any)[0]?.insertId;
    }
  } catch (e) {
    console.error("[HealthCheck] Failed to save report to DB:", e);
  }

  // 推送 Manus 通知
  const notifyTitle = `系统自检报告 - ${overallStatus === "ok" ? "✅ 全部正常" : overallStatus === "warn" ? "⚠️ 有警告" : "❌ 有故障"}`;
  const notifyContent = [
    `**自检时间：** ${new Date(runAt + "Z").toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    `**耗时：** ${durationMs}ms`,
    "",
    ...checks.map((c) => {
      const icon = c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
      return `${icon} **${c.module}**：${c.message}`;
    }),
    "",
    `**总结：** ${summary}`,
  ].join("\n");

  await notifyOwner({ title: notifyTitle, content: notifyContent }).catch((e) =>
    console.error("[HealthCheck] Failed to send notification:", e)
  );

  console.log(`[HealthCheck] Done in ${durationMs}ms. Status: ${overallStatus}`);
  return report;
}

// ─── 获取历史报告 ──────────────────────────────────────────────────────────────

export async function getHealthReports(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(systemHealthReports)
    .orderBy(desc(systemHealthReports.createdAt))
    .limit(limit);
}
