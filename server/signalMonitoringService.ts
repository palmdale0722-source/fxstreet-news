import {
  createSignalMonitor,
  getSignalMonitor,
  getCheckpoint,
  updateCheckpoint,
  createAlert,
  getAlerts,
  updateMonitorStatus,
  getAllActiveMonitors,
} from './signalMonitoringDb';
import { getDb } from './db';
import { notifyOwner } from './_core/notification';
import { signals } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfirmationStrategy {
  priceConfirmation: {
    type: 'breakout' | 'retest' | 'both';
    breakoutThreshold: number;
    retestThreshold: number;
  };
  indicatorConfirmation: {
    rsi: { enabled: boolean; overbought: number; oversold: number };
    macd: { enabled: boolean; crossover: boolean };
    bollinger: { enabled: boolean; touchBand: boolean };
  };
  timeCondition: {
    monitoringDuration: number;
    checkInterval: number;
  };
}

export interface TechnicalIndicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  bbUpper: number;
  bbLower: number;
  currentPrice: number;
}

// ─── Create Monitoring Task ─────────────────────────────────────────────────

export async function enterSignalMonitoring(data: {
  signalId: bigint;
  userId: bigint;
  monitoredPairs: string[];
  confirmationStrategy: ConfirmationStrategy;
}) {
  try {
    // 1. 直接通过 ID 查询信号，避免分页查找遗漏
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const signalRows = await db.select().from(signals).where(eq(signals.id, Number(data.signalId))).limit(1);
    const signal = signalRows[0];
    if (!signal) {
      throw new Error('Signal not found');
    }

    // 2. 计算过期时间
    const expiresAt = new Date(
      Date.now() + data.confirmationStrategy.timeCondition.monitoringDuration * 3600000
    );

    // 3. 创建监控任务
    const monitor = await createSignalMonitor({
      originalSignalId: data.signalId,
      userId: data.userId,
      monitoredPairs: data.monitoredPairs,
      confirmationStrategy: data.confirmationStrategy,
      expiresAt,
    });

    console.log(`[SignalMonitoring] Created monitor for signal #${data.signalId}`);

    return {
      success: true,
      monitorId: monitor[0].insertId,
      message: `已进入监控期，监控 ${data.monitoredPairs.length} 个品种`,
    };
  } catch (error) {
    console.error('[SignalMonitoring] Error creating monitor:', error);
    throw error;
  }
}

// ─── Check Monitoring Conditions ────────────────────────────────────────────

export async function checkMonitoringConditions(monitorId: bigint) {
  try {
    // 1. 获取监控任务
    const monitor = await getSignalMonitor(monitorId);
    if (!monitor || monitor.status !== 'monitoring') {
      return;
    }

    // 2. 检查是否过期
    if (new Date() > new Date(monitor.expiresAt || 0)) {
      await updateMonitorStatus(monitorId, 'expired');

      // 发送过期报警
      const userId = monitor.userId;
      await createAlert({
        monitorId,
        checkpointId: BigInt(0),
        pair: 'N/A',
        userId,
        alertType: 'expired',
        title: '⏰ 监控过期',
        message: `信号监控已过期，未达到确认条件。请查看详情并决定后续操作。`,
      });

      await notifyOwner({
        title: `信号监控过期：#${monitorId}`,
        content: `监控任务已过期，未达到确认条件`,
      });

      console.log(`[SignalMonitoring] Monitor #${monitorId} expired`);
      return;
    }

    const strategy = monitor.confirmationStrategy as ConfirmationStrategy;
    const monitoredPairs = monitor.monitoredPairs as string[];

    // 3. 逐个检查每个货币对
    for (const pair of monitoredPairs) {
      await checkPairConfirmation(monitorId, pair, strategy);
    }
  } catch (error) {
    console.error('[SignalMonitoring] Error checking monitor:', error);
  }
}

async function checkPairConfirmation(
  monitorId: bigint,
  pair: string,
  strategy: ConfirmationStrategy
) {
  try {
    // 1. 获取检查点
    const checkpoint = await getCheckpoint(monitorId, pair);
    if (!checkpoint || checkpoint.isFinalConfirmed) {
      return;
    }

    // 2. 获取当前技术指标（从交易伴飞 K 线图获取）
    const technicalData = await getTechnicalIndicators(pair);
    if (!technicalData) {
      console.warn(`[SignalMonitoring] No technical data for ${pair}`);
      return;
    }

    // 3. 检查价格确认条件
    const priceConfirmed = checkPriceConfirmation(checkpoint, technicalData, strategy);

    // 4. 检查技术指标确认条件
    const indicatorConfirmed = checkIndicatorConfirmation(
      checkpoint,
      technicalData,
      strategy
    );

    // 5. 更新检查点状态
    if (priceConfirmed && !checkpoint.isBreakoutConfirmed) {
      await updateCheckpoint(checkpoint.id, {
        isBreakoutConfirmed: true,
        rsiValue: technicalData.rsi,
        macdValue: technicalData.macd,
        macdSignal: technicalData.macdSignal,
        bbUpper: technicalData.bbUpper,
        bbLower: technicalData.bbLower,
      });

      console.log(`[SignalMonitoring] ${pair} price confirmed`);

      // 发送价格确认报警
      const monitor = await getSignalMonitor(monitorId);
      if (monitor) {
        await createAlert({
          monitorId,
          checkpointId: checkpoint.id,
          pair,
          userId: monitor.userId,
          alertType: 'breakout_confirmed',
          title: `📈 ${pair} 价格确认`,
          message: `${pair} 已突破关键位 ${checkpoint.breakoutLevel}，当前价格 ${technicalData.currentPrice}`,
        });
      }
    }

    if (indicatorConfirmed && !checkpoint.isIndicatorConfirmed) {
      await updateCheckpoint(checkpoint.id, {
        isIndicatorConfirmed: true,
        rsiValue: technicalData.rsi,
        macdValue: technicalData.macd,
        macdSignal: technicalData.macdSignal,
        bbUpper: technicalData.bbUpper,
        bbLower: technicalData.bbLower,
      });

      console.log(`[SignalMonitoring] ${pair} indicator confirmed`);

      // 发送指标确认报警
      const monitor = await getSignalMonitor(monitorId);
      if (monitor) {
        await createAlert({
          monitorId,
          checkpointId: checkpoint.id,
          pair,
          userId: monitor.userId,
          alertType: 'indicator_confirmed',
          title: `📊 ${pair} 指标确认`,
          message: `${pair} 技术指标二次确认，RSI: ${technicalData.rsi}, MACD: ${technicalData.macd}`,
        });
      }
    }

    // 6. 如果两个条件都满足，触发最终确认
    if (priceConfirmed && indicatorConfirmed && !checkpoint.isFinalConfirmed) {
      await updateCheckpoint(checkpoint.id, {
        isFinalConfirmed: true,
        confirmationTime: new Date(),
      });

      console.log(`[SignalMonitoring] ${pair} final confirmed`);

      // 发送最终确认报警
      const monitor = await getSignalMonitor(monitorId);
      if (monitor) {
        await sendConfirmationAlert(monitor.userId, {
          monitorId,
          checkpointId: checkpoint.id,
          pair,
          currentPrice: technicalData.currentPrice,
          technicalData,
        });
      }
    }
  } catch (error) {
    console.error(`[SignalMonitoring] Error checking ${pair}:`, error);
  }
}

// ─── Confirmation Logic ──────────────────────────────────────────────────────

function checkPriceConfirmation(
  checkpoint: any,
  technicalData: TechnicalIndicators,
  strategy: ConfirmationStrategy
): boolean {
  const config = strategy.priceConfirmation;
  const currentPrice = technicalData.currentPrice;
  const breakoutLevel = parseFloat(checkpoint.breakoutLevel || '0');
  const confirmationLevel = parseFloat(checkpoint.confirmationLevel || '0');

  if (config.type === 'breakout' || config.type === 'both') {
    // 检查是否突破关键位（转换为 pips）
    const breakoutPips = Math.abs(currentPrice - breakoutLevel) / 0.0001;
    if (breakoutPips >= config.breakoutThreshold) {
      return true;
    }
  }

  if (config.type === 'retest' || config.type === 'both') {
    // 检查是否回测到确认位
    const retestPips = Math.abs(currentPrice - confirmationLevel) / 0.0001;
    if (retestPips <= config.retestThreshold) {
      return true;
    }
  }

  return false;
}

function checkIndicatorConfirmation(
  checkpoint: any,
  technicalData: TechnicalIndicators,
  strategy: ConfirmationStrategy
): boolean {
  const config = strategy.indicatorConfirmation;
  let confirmations = 0;
  let requiredConfirmations = 0;

  // RSI 确认
  if (config.rsi.enabled) {
    requiredConfirmations++;
    const isOverbought = technicalData.rsi > config.rsi.overbought;
    const isOversold = technicalData.rsi < config.rsi.oversold;
    if (isOverbought || isOversold) {
      confirmations++;
    }
  }

  // MACD 确认
  if (config.macd.enabled) {
    requiredConfirmations++;
    if (config.macd.crossover) {
      // 检查 MACD 是否穿过信号线
      const oldMacdAboveSignal = parseFloat(checkpoint.macdValue || '0') > parseFloat(checkpoint.macdSignal || '0');
      const newMacdAboveSignal = technicalData.macd > technicalData.macdSignal;
      if (oldMacdAboveSignal !== newMacdAboveSignal) {
        confirmations++;
      }
    }
  }

  // 布林带确认
  if (config.bollinger.enabled) {
    requiredConfirmations++;
    if (config.bollinger.touchBand) {
      const bbUpper = parseFloat(checkpoint.bbUpper || '0');
      const bbLower = parseFloat(checkpoint.bbLower || '0');
      if (technicalData.currentPrice > bbUpper || technicalData.currentPrice < bbLower) {
        confirmations++;
      }
    }
  }

  // 如果没有启用任何指标，则不需要指标确认
  if (requiredConfirmations === 0) {
    return true;
  }

  return confirmations >= requiredConfirmations;
}

// ─── Get Technical Indicators ───────────────────────────────────────────────

async function getTechnicalIndicators(pair: string): Promise<TechnicalIndicators | null> {
  try {
    // TODO: 从交易伴飞获取 K 线图数据
    // 这里需要调用交易伴飞的 API 获取最新的技术指标
    // 暂时返回 mock 数据

    // 模拟数据 - 实际应该从交易伴飞 API 获取
    return {
      rsi: 50 + Math.random() * 30,
      macd: Math.random() * 0.001,
      macdSignal: Math.random() * 0.001,
      bbUpper: 1.1 + Math.random() * 0.01,
      bbLower: 1.0 + Math.random() * 0.01,
      currentPrice: 1.05 + Math.random() * 0.05,
    };
  } catch (error) {
    console.error(`[SignalMonitoring] Error getting technical indicators for ${pair}:`, error);
    return null;
  }
}

// ─── Send Confirmation Alert ────────────────────────────────────────────────

async function sendConfirmationAlert(
  userId: bigint,
  data: {
    monitorId: bigint;
    checkpointId: bigint;
    pair: string;
    currentPrice: number;
    technicalData: TechnicalIndicators;
  }
) {
  try {
    // 1. 创建报警记录
    const alert = await createAlert({
      monitorId: data.monitorId,
      checkpointId: data.checkpointId,
      pair: data.pair,
      userId,
      alertType: 'final_confirmed',
      title: `✅ 信号确认：${data.pair}`,
      message: `
货币对 ${data.pair} 已达到确认条件，建议考虑入场。

当前价格：${data.currentPrice}
RSI：${data.technicalData.rsi.toFixed(2)}
MACD：${data.technicalData.macd.toFixed(4)}
布林带：上 ${data.technicalData.bbUpper.toFixed(5)} / 下 ${data.technicalData.bbLower.toFixed(5)}

请在 FXStreet 平台查看详细信息并决定是否入场。
      `.trim(),
    });

    // 2. 发送邮件
    try {
      // TODO: 需要获取用户邮箱并发送邮件
      // await sendEmail({
      //   to: user.email,
      //   subject: `🔔 FXStreet 交易信号确认通知：${data.pair}`,
      //   template: 'signal-confirmation',
      //   data: {...}
      // });
      console.log(`[SignalMonitoring] Email sent for ${data.pair}`);
    } catch (error) {
      console.error('[SignalMonitoring] Failed to send email:', error);
    }

    // 3. 发送推送通知
    try {
      // TODO: 需要集成推送通知服务
      console.log(`[SignalMonitoring] Push notification sent for ${data.pair}`);
    } catch (error) {
      console.error('[SignalMonitoring] Failed to send push notification:', error);
    }

    // 4. 发送系统内通知
    await notifyOwner({
      title: `✅ 信号确认：${data.pair}`,
      content: `${data.pair} 已达到确认条件，当前价格 ${data.currentPrice}。请查看详情并决定是否入场。`,
    });

    console.log(`[SignalMonitoring] Alert sent for ${data.pair}`);
  } catch (error) {
    console.error('[SignalMonitoring] Error sending confirmation alert:', error);
  }
}

// ─── Scheduled Monitoring Task ──────────────────────────────────────────────

export async function runScheduledMonitoring() {
  try {
    console.log('[SignalMonitoring] Starting scheduled monitoring check');

    // 获取所有活跃监控
    const activeMonitors = await getAllActiveMonitors();

    console.log(`[SignalMonitoring] Found ${activeMonitors.length} active monitors`);

    // 逐个检查
    for (const monitor of activeMonitors) {
      await checkMonitoringConditions(monitor.id);
    }

    console.log('[SignalMonitoring] Scheduled monitoring check completed');
  } catch (error) {
    console.error('[SignalMonitoring] Error in scheduled monitoring:', error);
  }
}
