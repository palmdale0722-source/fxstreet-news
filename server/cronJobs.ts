import { runFullUpdate } from "./fxService";
import { fetchSignalEmails } from "./imapService";
import { getActiveImapConfig, saveCurrencyStrengthCache, getCurrencyStrengthCache } from "./db";
import { analyzeNewTvIdeas } from "./tvIdeaAnalyzer";
import { generateCurrencyStrengthMatrix, generateEconomicSummaries } from "./currencyStrengthService";
import { fetchAllCountriesEconomicData } from "./dataScraperService";
import type { Express } from "express";

let cronTimer: NodeJS.Timeout | null = null;
let isRunning = false;

let imapTimer: NodeJS.Timeout | null = null;
let isImapRunning = false;

let isStrengthRunning = false;

// 每 4 小时执行一次货币强弱矩阵更新
const STRENGTH_MATRIX_INTERVAL_MS = 24 * 60 * 60 * 1000;
// 第 1 组（USD/EUR/JPY/GBP）在偶数小时（0、4、8、12、16、20）
const ALL_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CAD", "CHF"];
// 第 2 组（AUD/NZD/CAD/CHF）在奇数小时（2、6、10、14、18、22）
// 每小时执行一次其他更新任务
const CRON_INTERVAL_MS = 60 * 60 * 1000;
// 每 5 分钟拉取一次邮件
const IMAP_INTERVAL_MS = 5 * 60 * 1000;

export function startCronJobs() {
  console.log("[Cron] Starting scheduled jobs (interval: 1 hour)");

  // 启动时立即执行一次
  setTimeout(async () => {
    await safeRunUpdate("startup");
  }, 5000);

  // 之后每小时执行
  cronTimer = setInterval(async () => {
    await safeRunUpdate("scheduled");
  }, CRON_INTERVAL_MS);

  // 启动货币强弱矩阵更新（每天一次）
  startDailyStrengthMatrixUpdates();
}

// 启动每天货币强弱矩阵更新（每天上午 8 点）
function startDailyStrengthMatrixUpdates() {
  console.log("[StrengthMatrix] Starting daily updates (every 24 hours at 08:00)");

  // 计算距离下一个上午 8 点的延迟
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(8, 0, 0, 0);
  
  // 如果已经超过今天的 8 点，改为明天 8 点
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const delayToFirstRun = nextRun.getTime() - now.getTime();
  console.log(`[StrengthMatrix] Next update in ${Math.round(delayToFirstRun / 1000 / 60)} minutes`);

  // 第一次更新
  setTimeout(() => {
    safeRunStrengthMatrix("scheduled", ALL_CURRENCIES).catch(console.error);
    // 之后每 24 小时更新
    setInterval(() => {
      safeRunStrengthMatrix("scheduled", ALL_CURRENCIES).catch(console.error);
    }, STRENGTH_MATRIX_INTERVAL_MS);
  }, delayToFirstRun);
}

export function stopCronJobs() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log("[Cron] Stopped scheduled jobs");
  }
  if (imapTimer) {
    clearInterval(imapTimer);
    imapTimer = null;
    console.log("[Cron] Stopped IMAP jobs");
  }
}

// 启动 IMAP 邮件拉取定时任务
export function startImapJobs() {
  console.log("[IMAP] Starting IMAP polling (interval: 5 min)");

  // 启动后延迟 10s 执行一次
  setTimeout(() => safeRunImap("startup"), 10000);

  imapTimer = setInterval(() => safeRunImap("scheduled"), IMAP_INTERVAL_MS);
}

/** 重新启动 IMAP 定时任务（保存新配置后调用） */
export function restartImapJobs() {
  if (imapTimer) {
    clearInterval(imapTimer);
    imapTimer = null;
  }
  imapTimer = setInterval(() => safeRunImap("scheduled"), IMAP_INTERVAL_MS);
  // 立即执行一次
  safeRunImap("restart");
}

async function safeRunImap(trigger: string) {
  if (isImapRunning) {
    console.log(`[IMAP] Already running, skipping ${trigger}`);
    return;
  }
  // 优先从数据库读取配置，降级到环境变量
  const config = await getActiveImapConfig();
  if (!config) {
    console.log("[IMAP] No IMAP config found (neither DB nor env), skipping");
    return;
  }
  isImapRunning = true;
  try {
    const result = await fetchSignalEmails(config.email, config.password, 50, {
      host: config.host,
      port: config.port,
      tls: config.tls,
    });
    if (result.inserted > 0) {
      console.log(`[IMAP] Fetched ${result.fetched}, inserted ${result.inserted} new signals`);
    }
  } catch (e) {
    console.error(`[IMAP] Fetch error (${trigger}):`, e);
  } finally {
    isImapRunning = false;
  }
}

async function safeRunUpdate(trigger: string) {
  if (isRunning) {
    console.log(`[Cron] Update already running, skipping ${trigger} trigger`);
    return;
  }
  isRunning = true;
  console.log(`[Cron] Running update (trigger: ${trigger})`);
  try {
    const result = await runFullUpdate();
    console.log(`[Cron] Update complete:`, result);

    // 每次抓取完成后，延迟 5 秒对新增的 TradingView 交易想法进行 AI 分析
    setTimeout(async () => {
      try {
        const analyzeResult = await analyzeNewTvIdeas(2);
        if (analyzeResult.analyzed > 0) {
          console.log(`[Cron] TV Idea analysis: analyzed=${analyzeResult.analyzed}, notified=${analyzeResult.notified}`);
        }
      } catch (e) {
        console.error(`[Cron] TV Idea analysis failed:`, e);
      }
    }, 5000);

    // 延迟 30 秒后更新货币强弱矩阵（避免与 RSS 抓取并发）
    setTimeout(() => safeRunStrengthMatrix("post-update").catch(console.error), 30000);
  } catch (e) {
    console.error(`[Cron] Update failed:`, e);
  } finally {
    isRunning = false;
  }
}

/** 安全运行货币强弱矩阵生成（带防并发保护） */
export async function safeRunStrengthMatrix(trigger: string, currencyGroup?: string[]) {
  if (isStrengthRunning) {
    console.log(`[StrengthMatrix] Already running, skipping ${trigger}`);
    return;
  }
  isStrengthRunning = true;
  const groupLabel = currencyGroup ? `(${currencyGroup.join(", ")})` : "(all 8 currencies)";
  console.log(`[StrengthMatrix] Generating currency strength matrix ${groupLabel} (trigger: ${trigger})...`);
  try {
    const [matrix, economicData] = await Promise.all([
      generateCurrencyStrengthMatrix(currencyGroup),
      fetchAllCountriesEconomicData(),
    ]);
    const summaries = await generateEconomicSummaries(economicData);
    await saveCurrencyStrengthCache({
      matrixJson: JSON.stringify(matrix),
      economicSummariesJson: JSON.stringify(summaries),
    });
    console.log(`[StrengthMatrix] Done: ${matrix.scores.length} currencies scored, ${matrix.picks.length} picks generated`);
  } catch (e) {
    console.error(`[StrengthMatrix] Failed (${trigger}):`, e);
  } finally {
    isStrengthRunning = false;
  }
}

// 注册手动触发的 HTTP 接口
export function registerAdminRoutes(app: Express) {
  // 手动触发更新（无需认证，方便测试；生产环境可加 secret 验证）
  app.post("/api/admin/trigger-update", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    const adminSecret = process.env.ADMIN_SECRET || "fxstreet-admin-2026";
    if (secret !== adminSecret) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (isRunning) {
      res.status(409).json({ success: false, message: "Update already in progress" });
      return;
    }
    // 异步执行，立即返回
    safeRunUpdate("manual").catch(console.error);
    res.json({ success: true, message: "Update triggered successfully" });
  });

  // 查询更新状态
  app.get("/api/admin/status", (req, res) => {
    res.json({ isRunning, isStrengthRunning, timestamp: new Date().toISOString() });
  });

  // 手动触发货币强弱矩阵更新
  app.post("/api/admin/trigger-strength-matrix", async (req, res) => {
    const secret = req.headers["x-admin-secret"] || req.query.secret;
    const adminSecret = process.env.ADMIN_SECRET || "fxstreet-admin-2026";
    if (secret !== adminSecret) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (isStrengthRunning) {
      res.status(409).json({ success: false, message: "Strength matrix generation already in progress" });
      return;
    }
    safeRunStrengthMatrix("manual").catch(console.error);
    res.json({ success: true, message: "Strength matrix generation triggered" });
  });
}
