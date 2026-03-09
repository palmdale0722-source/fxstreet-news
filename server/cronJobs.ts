import { runFullUpdate } from "./fxService";
import type { Express } from "express";

let cronTimer: NodeJS.Timeout | null = null;
let isRunning = false;

// 每小时执行一次
const CRON_INTERVAL_MS = 60 * 60 * 1000;

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
}

export function stopCronJobs() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log("[Cron] Stopped scheduled jobs");
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
  } catch (e) {
    console.error(`[Cron] Update failed:`, e);
  } finally {
    isRunning = false;
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
    res.json({ isRunning, timestamp: new Date().toISOString() });
  });
}
