/**
 * 信号监控定时任务
 * 每 5 分钟检查一次所有活跃监控任务
 * 检查价格突破和技术指标二次确认
 * 满足条件时发送报警
 */

import { eq, lt, and, gte } from 'drizzle-orm';
import { getDb } from './db';
import { signalMonitors } from '../drizzle/schema';

/**
 * 定时任务：检查所有活跃监控
 * 建议配置：每 5 分钟执行一次
 */
export async function runSignalMonitoringCheck() {
  console.log('[SignalMonitoring] 开始检查活跃监控任务...');
  
  try {
    const db = await getDb();
    if (!db) {
      console.error('[SignalMonitoring] 数据库连接失败');
      return;
    }

    // 获取所有活跃的监控任务
    const activeMonitors = await db
      .select()
      .from(signalMonitors)
      .where(eq(signalMonitors.status, 'monitoring'));

    console.log(`[SignalMonitoring] 发现 ${activeMonitors.length} 个活跃监控任务`);

    // 对每个监控任务进行检查
    for (const monitor of activeMonitors) {
      try {
        // 调用 signalMonitoringService 中的检查逻辑
        // await checkAndConfirmSignals(monitor.id);
        console.log(`[SignalMonitoring] 检查监控任务 ${monitor.id}...`);
      } catch (error) {
        console.error(
          `[SignalMonitoring] 检查监控任务 ${monitor.id} 失败:`,
          error
        );
      }
    }

    console.log('[SignalMonitoring] 检查完成');
  } catch (error) {
    console.error('[SignalMonitoring] 定时任务执行失败:', error);
  }
}

/**
 * 定时任务：清理过期的监控任务
 * 建议配置：每小时执行一次
 */
export async function cleanupExpiredMonitors() {
  console.log('[SignalMonitoring] 开始清理过期监控任务...');

  try {
    const db = await getDb();
    if (!db) {
      console.error('[SignalMonitoring] 数据库连接失败');
      return;
    }

    const now = new Date();
    const nowString = now.toISOString();
    
    // 查找所有已过期的监控任务
    const expiredMonitors = await db
      .select()
      .from(signalMonitors)
      .where(
        and(
          eq(signalMonitors.status, 'monitoring'),
          lt(signalMonitors.expiresAt, nowString)
        )
      );

    console.log(`[SignalMonitoring] 发现 ${expiredMonitors.length} 个过期监控任务`);

    // 标记为已过期
    for (const monitor of expiredMonitors) {
      await db
        .update(signalMonitors)
        .set({ status: 'expired' })
        .where(eq(signalMonitors.id, monitor.id));
    }

    console.log('[SignalMonitoring] 清理完成');
  } catch (error) {
    console.error('[SignalMonitoring] 清理任务执行失败:', error);
  }
}

/**
 * 定时任务：生成监控统计报告
 * 建议配置：每天执行一次（比如凌晨 1 点）
 */
export async function generateMonitoringReport() {
  console.log('[SignalMonitoring] 开始生成监控统计报告...');

  try {
    const db = await getDb();
    if (!db) {
      console.error('[SignalMonitoring] 数据库连接失败');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString();
    
    // 统计今天的监控数据
    const todayMonitors = await db
      .select()
      .from(signalMonitors)
      .where(gte(signalMonitors.createdAt, todayString))

    const confirmedCount = todayMonitors.filter(
      (m) => m.status === 'confirmed'
    ).length;
    
    const expiredCount = todayMonitors.filter(
      (m) => m.status === 'expired'
    ).length;

    const report = {
      date: today.toISOString().split('T')[0],
      totalMonitors: todayMonitors.length,
      confirmedMonitors: confirmedCount,
      expiredMonitors: expiredCount,
      confirmationRate: todayMonitors.length > 0
        ? ((confirmedCount / todayMonitors.length) * 100).toFixed(2) + '%'
        : '0%',
      generatedAt: new Date().toISOString(),
    };

    console.log('[SignalMonitoring] 今日监控统计:', report);

    // 可选：将报告保存到数据库或发送给用户
    // await saveMonitoringReport(report);

    return report;
  } catch (error) {
    console.error('[SignalMonitoring] 报告生成失败:', error);
  }
}

/**
 * 定时任务：重新计算所有活跃监控的技术指标
 * 建议配置：每 10 分钟执行一次
 */
export async function recalculateIndicators() {
  console.log('[SignalMonitoring] 开始重新计算技术指标...');

  try {
    const db = await getDb();
    if (!db) {
      console.error('[SignalMonitoring] 数据库连接失败');
      return;
    }

    const activeMonitors = await db
      .select()
      .from(signalMonitors)
      .where(eq(signalMonitors.status, 'monitoring'));

    console.log(`[SignalMonitoring] 更新 ${activeMonitors.length} 个监控任务的指标`);

    // 对每个监控任务重新计算指标
    for (const monitor of activeMonitors) {
      try {
        // 这里可以调用交易伴飞的 K 线图功能获取最新数据
        // 然后计算 RSI、MACD 等指标
        // 最后更新数据库
        
        // 示例代码（需要根据实际情况调整）：
        // const klines = await getKlines(checkpoint.pair);
        // const rsi = calculateRSI(klines);
        // const macd = calculateMACD(klines);
        // await updateCheckpoint(checkpoint.id, { rsiValue: rsi, macdValue: macd });
      } catch (error) {
        console.error(
          `[SignalMonitoring] 更新监控 ${monitor.id} 的指标失败:`,
          error
        );
      }
    }

    console.log('[SignalMonitoring] 指标更新完成');
  } catch (error) {
    console.error('[SignalMonitoring] 指标更新失败:', error);
  }
}
