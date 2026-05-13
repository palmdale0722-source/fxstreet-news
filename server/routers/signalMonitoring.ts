import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import {
  enterSignalMonitoring,
  ConfirmationStrategy,
} from '../signalMonitoringService';
import {
  getActiveMonitors,
  getSignalMonitor,
  getCheckpoints,
  getAlerts,
  updateMonitorStatus,
  updateAlertStatus,
} from '../signalMonitoringDb';

// ─── Validation Schemas ─────────────────────────────────────────────────────

const ConfirmationStrategySchema = z.object({
  priceConfirmation: z.object({
    type: z.enum(['breakout', 'retest', 'both']),
    breakoutThreshold: z.number().min(0),
    retestThreshold: z.number().min(0),
  }),
  indicatorConfirmation: z.object({
    rsi: z.object({
      enabled: z.boolean(),
      overbought: z.number().min(0).max(100).default(70),
      oversold: z.number().min(0).max(100).default(30),
    }),
    macd: z.object({
      enabled: z.boolean(),
      crossover: z.boolean(),
    }),
    bollinger: z.object({
      enabled: z.boolean(),
      touchBand: z.boolean(),
    }),
  }),
  timeCondition: z.object({
    monitoringDuration: z.number().min(1).max(168),  // 最多 7 天
    checkInterval: z.number().min(1).max(60),  // 最多 60 分钟
  }),
});

// ─── Signal Monitoring Router ───────────────────────────────────────────────

export const signalMonitoringRouter = router({
  // ─── Create Monitoring ──────────────────────────────────────────────────

  /**
   * 将交易信号进入监控期
   * 
   * @param signalId - 原始信号 ID
   * @param monitoredPairs - 要监控的货币对列表
   * @param confirmationStrategy - 确认策略配置
   * 
   * @returns 监控任务信息
   */
  enterMonitoring: protectedProcedure
    .input(z.object({
      signalId: z.bigint(),
      monitoredPairs: z.array(z.string()).min(1).max(10),
      confirmationStrategy: ConfirmationStrategySchema,
    }))
    .mutation(async ({ ctx, input }: any) => {
      return await enterSignalMonitoring({
        signalId: input.signalId,
        userId: BigInt(ctx.user.id),
        monitoredPairs: input.monitoredPairs,
        confirmationStrategy: input.confirmationStrategy as ConfirmationStrategy,
      });
    }),

  // ─── Get Monitors ───────────────────────────────────────────────────────

  /**
   * 获取用户的活跃监控列表
   * 
   * @returns 活跃监控列表
   */
  getActiveMonitors: protectedProcedure
    .query(async ({ ctx }: any) => {
      const monitors = await getActiveMonitors(BigInt(ctx.user.id));
      return monitors.map(m => ({
        id: m.id,
        originalSignalId: m.originalSignalId,
        status: m.status,
        monitoredPairs: m.monitoredPairs,
        confirmationStrategy: m.confirmationStrategy,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
        confirmedAt: m.confirmedAt,
      }));
    }),

  /**
   * 获取单个监控任务的详情
   * 
   * @param monitorId - 监控任务 ID
   * @returns 监控任务详情
   */
  getMonitor: protectedProcedure
    .input(z.object({
      monitorId: z.bigint(),
    }))
    .query(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      
      if (!monitor || monitor.userId !== BigInt(ctx.user.id)) {
        throw new Error('Monitor not found or access denied');
      }

      return {
        id: monitor.id,
        originalSignalId: monitor.originalSignalId,
        status: monitor.status,
        monitoredPairs: monitor.monitoredPairs,
        confirmationStrategy: monitor.confirmationStrategy,
        createdAt: monitor.createdAt,
        expiresAt: monitor.expiresAt,
        confirmedAt: monitor.confirmedAt,
        monitoringLog: monitor.monitoringLog,
        confirmationDetails: monitor.confirmationDetails,
      };
    }),

  // ─── Get Checkpoints ────────────────────────────────────────────────────

  /**
   * 获取监控任务的所有检查点
   * 
   * @param monitorId - 监控任务 ID
   * @returns 检查点列表
   */
  getCheckpoints: protectedProcedure
    .input(z.object({
      monitorId: z.bigint(),
    }))
    .query(async ({ ctx, input }: any) => {
      // 验证权限
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== BigInt(ctx.user.id)) {
        throw new Error('Monitor not found or access denied');
      }

      const checkpoints = await getCheckpoints(input.monitorId);
      
      return checkpoints.map(cp => ({
        id: cp.id,
        monitorId: cp.monitorId,
        pair: cp.pair,
        entryPrice: cp.entryPrice ? parseFloat(cp.entryPrice as string) : null,
        breakoutLevel: cp.breakoutLevel ? parseFloat(cp.breakoutLevel as string) : null,
        confirmationLevel: cp.confirmationLevel ? parseFloat(cp.confirmationLevel as string) : null,
        rsiValue: cp.rsiValue ? parseFloat(cp.rsiValue as string) : null,
        macdValue: cp.macdValue ? parseFloat(cp.macdValue as string) : null,
        macdSignal: cp.macdSignal ? parseFloat(cp.macdSignal as string) : null,
        bbUpper: cp.bbUpper ? parseFloat(cp.bbUpper as string) : null,
        bbLower: cp.bbLower ? parseFloat(cp.bbLower as string) : null,
        isBreakoutConfirmed: cp.isBreakoutConfirmed,
        isIndicatorConfirmed: cp.isIndicatorConfirmed,
        isFinalConfirmed: cp.isFinalConfirmed,
        checkpointTime: cp.checkpointTime,
        confirmationTime: cp.confirmationTime,
      }));
    }),

  // ─── Get Alerts ─────────────────────────────────────────────────────────

  /**
   * 获取监控任务的所有报警
   * 
   * @param monitorId - 监控任务 ID
   * @returns 报警列表
   */
  getAlerts: protectedProcedure
    .input(z.object({
      monitorId: z.bigint(),
    }))
    .query(async ({ ctx, input }: any) => {
      // 验证权限
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== BigInt(ctx.user.id)) {
        throw new Error('Monitor not found or access denied');
      }

      const alerts = await getAlerts(input.monitorId);
      
      return alerts.map(a => ({
        id: a.id,
        monitorId: a.monitorId,
        checkpointId: a.checkpointId,
        pair: a.pair,
        alertType: a.alertType,
        title: a.title,
        message: a.message,
        emailSent: a.emailSent,
        pushSent: a.pushSent,
        emailSentAt: a.emailSentAt,
        pushSentAt: a.pushSentAt,
        userAction: a.userAction,
        actionTime: a.actionTime,
        createdAt: a.createdAt,
      }));
    }),

  // ─── Update Monitor ─────────────────────────────────────────────────────

  /**
   * 取消监控
   * 
   * @param monitorId - 监控任务 ID
   */
  cancelMonitoring: protectedProcedure
    .input(z.object({
      monitorId: z.bigint(),
    }))
    .mutation(async ({ ctx, input }: any) => {
      // 验证权限
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== BigInt(ctx.user.id)) {
        throw new Error('Monitor not found or access denied');
      }

      await updateMonitorStatus(input.monitorId, 'cancelled');

      return {
        success: true,
        message: '已取消监控',
      };
    }),

  /**
   * 手动确认信号
   * 
   * @param monitorId - 监控任务 ID
   */
  manualConfirm: protectedProcedure
    .input(z.object({
      monitorId: z.bigint(),
    }))
    .mutation(async ({ ctx, input }: any) => {
      // 验证权限
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== BigInt(ctx.user.id)) {
        throw new Error('Monitor not found or access denied');
      }

      await updateMonitorStatus(input.monitorId, 'confirmed');

      return {
        success: true,
        message: '已手动确认信号',
      };
    }),

  // ─── Update Alert ───────────────────────────────────────────────────────

  /**
   * 更新报警状态
   * 
   * @param alertId - 报警 ID
   * @param userAction - 用户操作
   */
  updateAlertAction: protectedProcedure
    .input(z.object({
      alertId: z.bigint(),
      userAction: z.enum(['acknowledged', 'ignored', 'entered', 'cancelled']),
    }))
    .mutation(async ({ ctx, input }: any) => {
      await updateAlertStatus(input.alertId, {
        userAction: input.userAction,
        actionTime: new Date(),
      });

      return {
        success: true,
        message: '已更新报警状态',
      };
    }),
});

export type SignalMonitoringRouter = typeof signalMonitoringRouter;
