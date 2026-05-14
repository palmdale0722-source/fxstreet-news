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

  enterMonitoring: protectedProcedure
    .input(z.object({
      signalId: z.number(),
      monitoredPairs: z.array(z.string()).min(1).max(10),
      confirmationStrategy: ConfirmationStrategySchema,
    }))
    .mutation(async ({ ctx, input }: any) => {
      return await enterSignalMonitoring({
        signalId: input.signalId,
        userId: ctx.user.id,
        monitoredPairs: input.monitoredPairs,
        confirmationStrategy: input.confirmationStrategy as ConfirmationStrategy,
      });
    }),

  // ─── Get Monitors ───────────────────────────────────────────────────────

  getActiveMonitors: protectedProcedure
    .query(async ({ ctx }: any) => {
      const monitors = await getActiveMonitors(ctx.user.id);
      return monitors.map((m: any) => ({
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

  getMonitor: protectedProcedure
    .input(z.object({
      monitorId: z.number(),
    }))
    .query(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      
      if (!monitor || monitor.userId !== ctx.user.id) {
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

  getCheckpoints: protectedProcedure
    .input(z.object({
      monitorId: z.number(),
    }))
    .query(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== ctx.user.id) {
        throw new Error('Monitor not found or access denied');
      }

      const checkpoints = await getCheckpoints(input.monitorId);
      
      return checkpoints.map((cp: any) => ({
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

  getAlerts: protectedProcedure
    .input(z.object({
      monitorId: z.number(),
    }))
    .query(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== ctx.user.id) {
        throw new Error('Monitor not found or access denied');
      }

      const alerts = await getAlerts(input.monitorId);
      
      return alerts.map((a: any) => ({
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

  cancelMonitoring: protectedProcedure
    .input(z.object({
      monitorId: z.number(),
    }))
    .mutation(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== ctx.user.id) {
        throw new Error('Monitor not found or access denied');
      }

      await updateMonitorStatus(input.monitorId, 'cancelled');

      return {
        success: true,
        message: '已取消监控',
      };
    }),

  manualConfirm: protectedProcedure
    .input(z.object({
      monitorId: z.number(),
    }))
    .mutation(async ({ ctx, input }: any) => {
      const monitor = await getSignalMonitor(input.monitorId);
      if (!monitor || monitor.userId !== ctx.user.id) {
        throw new Error('Monitor not found or access denied');
      }

      await updateMonitorStatus(input.monitorId, 'confirmed');

      return {
        success: true,
        message: '已手动确认信号',
      };
    }),

  // ─── Update Alert ───────────────────────────────────────────────────────

  updateAlertAction: protectedProcedure
    .input(z.object({
      alertId: z.number(),
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
