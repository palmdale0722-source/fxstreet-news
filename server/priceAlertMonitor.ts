/**
 * 价格提醒监控服务
 * 每分钟检查所有待触发的价格提醒，使用 MT4 M15 K 线收盘价做判断
 * 触及目标价后发送 Manus 通知
 */
import { getAllPendingAlerts, triggerPriceAlert } from "./db";
import { getMt4Bars } from "./mt4Service";
import { notifyOwner } from "./_core/notification";

let monitorTimer: NodeJS.Timeout | null = null;
let isMonitorRunning = false;

// 缓存最近获取的 MT4 价格（避免同一品种重复请求，30 秒 TTL）
const priceCache: Map<string, { price: number; fetchedAt: number }> = new Map();
const PRICE_CACHE_TTL_MS = 30 * 1000;

/**
 * 从 MT4 M15 数据获取货币对最新收盘价
 * symbol 格式：EUR/USD → EURUSD（去掉斜杠）
 */
async function getMt4CurrentPrice(symbol: string): Promise<number | null> {
  // 检查缓存
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    const mt4Symbol = symbol.replace("/", "");
    const bars = await getMt4Bars(mt4Symbol, 1);
    if (bars && bars.length > 0) {
      const price = parseFloat(bars[0].close);
      if (!isNaN(price) && price > 0) {
        priceCache.set(symbol, { price, fetchedAt: Date.now() });
        return price;
      }
    }
  } catch (e) {
    console.warn(`[PriceAlert] Failed to get MT4 price for ${symbol}:`, e);
  }

  return null; // MT4 无数据时不触发，等待下次检查
}

/**
 * 检查所有待触发的价格提醒
 */
async function checkPriceAlerts() {
  if (isMonitorRunning) return;
  isMonitorRunning = true;

  try {
    const pendingAlerts = await getAllPendingAlerts();
    if (pendingAlerts.length === 0) return;

    // 按品种分组，避免重复请求同一品种价格
    const symbolGroups = new Map<string, typeof pendingAlerts>();
    for (const alert of pendingAlerts) {
      const group = symbolGroups.get(alert.symbol) ?? [];
      group.push(alert);
      symbolGroups.set(alert.symbol, group);
    }

    for (const [symbol, alerts] of Array.from(symbolGroups.entries())) {
      const currentPrice = await getMt4CurrentPrice(symbol);
      if (currentPrice === null) {
        // MT4 暂无该品种数据，跳过本次检查
        continue;
      }

      for (const alert of alerts) {
        const targetPrice = parseFloat(alert.targetPrice);
        if (isNaN(targetPrice)) continue;

        // 判断是否触发
        const triggered =
          (alert.condition === "above" && currentPrice >= targetPrice) ||
          (alert.condition === "below" && currentPrice <= targetPrice);

        if (triggered) {
          console.log(`[PriceAlert] Alert #${alert.id} triggered: ${symbol} ${alert.condition} ${targetPrice} (MT4 M15 close: ${currentPrice})`);

          // 标记为已触发
          await triggerPriceAlert(alert.id, currentPrice.toString());

          // 发送 Manus 通知
          const conditionText = alert.condition === "above" ? "突破上方" : "跌破下方";
          const noteText = alert.note ? `\n备注：${alert.note}` : "";
          const companionText = alert.companionId ? `\n关联伴飞 #${alert.companionId}` : "";

          await notifyOwner({
            title: `🔔 价格提醒触发：${symbol}`,
            content: `${symbol} 已${conditionText}目标价 ${targetPrice}\nMT4 M15 收盘价：${currentPrice}${noteText}${companionText}\n\n触发时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
          }).catch(e => console.warn("[PriceAlert] Notification failed:", e));
        }
      }
    }
  } catch (e) {
    console.error("[PriceAlert] Monitor error:", e);
  } finally {
    isMonitorRunning = false;
  }
}

/**
 * 启动价格提醒监控（每分钟检查一次）
 */
export function startPriceAlertMonitor() {
  if (monitorTimer) return; // 已在运行
  console.log("[PriceAlert] Starting price alert monitor (MT4 M15, interval: 1 min)");

  // 启动后延迟 15 秒首次检查（等待 MT4 数据就绪）
  setTimeout(() => {
    checkPriceAlerts().catch(console.error);
  }, 15 * 1000);

  // 之后每 60 秒检查一次
  monitorTimer = setInterval(() => {
    checkPriceAlerts().catch(console.error);
  }, 60 * 1000);
}

/**
 * 停止价格提醒监控
 */
export function stopPriceAlertMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[PriceAlert] Monitor stopped");
  }
}
