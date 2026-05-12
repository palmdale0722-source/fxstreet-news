/**
 * 价格提醒监控服务
 * 每分钟检查所有待触发的价格提醒，触及目标价后发送 Manus 通知
 */
import { getAllPendingAlerts, triggerPriceAlert } from "./db";
import { getMt4Bars } from "./mt4Service";
import { getForexQuote } from "./forexQuote";
import { notifyOwner } from "./_core/notification";

let monitorTimer: NodeJS.Timeout | null = null;
let isMonitorRunning = false;

// 缓存最近获取的价格（避免同一品种重复请求）
const priceCache: Map<string, { price: number; fetchedAt: number }> = new Map();
const PRICE_CACHE_TTL_MS = 30 * 1000; // 30 秒缓存

/**
 * 获取货币对当前价格（优先 MT4，降级 Yahoo Finance）
 */
async function getCurrentPrice(symbol: string): Promise<number | null> {
  // 检查缓存
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }

  try {
    // 优先从 MT4 获取最新 K 线收盘价
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
    // MT4 失败，继续尝试 Yahoo Finance
  }

  try {
    // 降级到 Yahoo Finance
    const quote = await getForexQuote(symbol);
    if (quote && quote.currentPrice > 0) {
      priceCache.set(symbol, { price: quote.currentPrice, fetchedAt: Date.now() });
      return quote.currentPrice;
    }
  } catch (e) {
    console.warn(`[PriceAlert] Failed to get price for ${symbol}:`, e);
  }

  return null;
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
      const currentPrice = await getCurrentPrice(symbol);
      if (currentPrice === null) continue;

      for (const alert of alerts) {
        const targetPrice = parseFloat(alert.targetPrice);
        if (isNaN(targetPrice)) continue;

        // 判断是否触发
        const triggered =
          (alert.condition === "above" && currentPrice >= targetPrice) ||
          (alert.condition === "below" && currentPrice <= targetPrice);

        if (triggered) {
          console.log(`[PriceAlert] Alert #${alert.id} triggered: ${symbol} ${alert.condition} ${targetPrice} (current: ${currentPrice})`);

          // 标记为已触发
          await triggerPriceAlert(alert.id, currentPrice.toString());

          // 发送 Manus 通知
          const conditionText = alert.condition === "above" ? "突破上方" : "跌破下方";
          const noteText = alert.note ? `\n备注：${alert.note}` : "";
          const companionText = alert.companionId ? `\n关联伴飞 #${alert.companionId}` : "";

          await notifyOwner({
            title: `🔔 价格提醒触发：${symbol}`,
            content: `${symbol} 已${conditionText}目标价 ${targetPrice}\n当前价格：${currentPrice}${noteText}${companionText}\n\n触发时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
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
  console.log("[PriceAlert] Starting price alert monitor (interval: 1 min)");

  // 启动后延迟 10 秒首次检查（等待 MT4 数据就绪）
  setTimeout(() => {
    checkPriceAlerts().catch(console.error);
  }, 10 * 1000);

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
