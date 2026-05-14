import { eq, and, desc } from 'drizzle-orm';
import { getDb } from './db';
import { signalMonitors, signalMonitorCheckpoints, signalAlerts } from '../drizzle/schema';

// ─── Signal Monitors ────────────────────────────────────────────────────────

export async function createSignalMonitor(data: {
  originalSignalId: number;
  userId: number;
  monitoredPairs: string[];
  confirmationStrategy: any;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(signalMonitors).values({
    originalSignalId: data.originalSignalId,
    userId: data.userId,
    monitoredPairs: data.monitoredPairs,
    confirmationStrategy: data.confirmationStrategy,
    expiresAt: data.expiresAt.toISOString(),
  });

  return result;
}

export async function getSignalMonitor(monitorId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(signalMonitors)
    .where(eq(signalMonitors.id, monitorId))
    .limit(1);

  return result[0] || null;
}

export async function getActiveMonitors(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(signalMonitors)
    .where(and(
      eq(signalMonitors.userId, userId),
      eq(signalMonitors.status, 'monitoring')
    ))
    .orderBy(desc(signalMonitors.createdAt));
}

export async function getAllActiveMonitors() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(signalMonitors)
    .where(eq(signalMonitors.status, 'monitoring'))
    .orderBy(desc(signalMonitors.createdAt));
}

export async function updateMonitorStatus(monitorId: number, status: 'monitoring' | 'confirmed' | 'cancelled' | 'expired') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: any = { status };
  if (status === 'confirmed') {
    updateData.confirmedAt = new Date().toISOString();
  }

  return await db.update(signalMonitors)
    .set(updateData)
    .where(eq(signalMonitors.id, monitorId));
}

export async function updateMonitorLog(monitorId: number, log: any) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  return await db.update(signalMonitors)
    .set({ monitoringLog: log })
    .where(eq(signalMonitors.id, monitorId));
}

// ─── Signal Monitor Checkpoints ─────────────────────────────────────────────

export async function createCheckpoint(data: {
  monitorId: number;
  pair: string;
  entryPrice?: number;
  breakoutLevel?: number;
  confirmationLevel?: number;
  rsiValue?: number;
  macdValue?: number;
  macdSignal?: number;
  bbUpper?: number;
  bbLower?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  return await db.insert(signalMonitorCheckpoints).values({
    monitorId: data.monitorId,
    pair: data.pair,
    entryPrice: data.entryPrice?.toString(),
    breakoutLevel: data.breakoutLevel?.toString(),
    confirmationLevel: data.confirmationLevel?.toString(),
    rsiValue: data.rsiValue?.toString(),
    macdValue: data.macdValue?.toString(),
    macdSignal: data.macdSignal?.toString(),
    bbUpper: data.bbUpper?.toString(),
    bbLower: data.bbLower?.toString(),
  });
}

export async function getCheckpoints(monitorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(signalMonitorCheckpoints)
    .where(eq(signalMonitorCheckpoints.monitorId, monitorId));
}

export async function getCheckpoint(monitorId: number, pair: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(signalMonitorCheckpoints)
    .where(and(
      eq(signalMonitorCheckpoints.monitorId, monitorId),
      eq(signalMonitorCheckpoints.pair, pair)
    ))
    .limit(1);

  return result[0] || null;
}

export async function updateCheckpoint(checkpointId: number, data: {
  isBreakoutConfirmed?: boolean;
  isIndicatorConfirmed?: boolean;
  isFinalConfirmed?: boolean;
  confirmationTime?: Date;
  rsiValue?: number;
  macdValue?: number;
  macdSignal?: number;
  bbUpper?: number;
  bbLower?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: any = {};
  if (data.isBreakoutConfirmed !== undefined) updateData.isBreakoutConfirmed = data.isBreakoutConfirmed;
  if (data.isIndicatorConfirmed !== undefined) updateData.isIndicatorConfirmed = data.isIndicatorConfirmed;
  if (data.isFinalConfirmed !== undefined) updateData.isFinalConfirmed = data.isFinalConfirmed;
  if (data.confirmationTime) updateData.confirmationTime = data.confirmationTime.toISOString();
  if (data.rsiValue !== undefined) updateData.rsiValue = data.rsiValue.toString();
  if (data.macdValue !== undefined) updateData.macdValue = data.macdValue.toString();
  if (data.macdSignal !== undefined) updateData.macdSignal = data.macdSignal.toString();
  if (data.bbUpper !== undefined) updateData.bbUpper = data.bbUpper.toString();
  if (data.bbLower !== undefined) updateData.bbLower = data.bbLower.toString();

  return await db.update(signalMonitorCheckpoints)
    .set(updateData)
    .where(eq(signalMonitorCheckpoints.id, checkpointId));
}

// ─── Signal Alerts ──────────────────────────────────────────────────────────

export async function createAlert(data: {
  monitorId: number;
  checkpointId: number;
  pair: string;
  userId: number;
  alertType: 'breakout_confirmed' | 'indicator_confirmed' | 'final_confirmed' | 'expired' | 'manual_cancel';
  title: string;
  message: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  return await db.insert(signalAlerts).values({
    monitorId: data.monitorId,
    checkpointId: data.checkpointId,
    pair: data.pair,
    userId: data.userId,
    alertType: data.alertType,
    title: data.title,
    message: data.message,
  });
}

export async function getAlerts(monitorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(signalAlerts)
    .where(eq(signalAlerts.monitorId, monitorId))
    .orderBy(desc(signalAlerts.createdAt));
}

export async function getUserAlerts(userId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(signalAlerts)
    .where(eq(signalAlerts.userId, userId))
    .orderBy(desc(signalAlerts.createdAt))
    .limit(limit);
}

export async function updateAlertStatus(alertId: number, data: {
  emailSent?: boolean;
  emailSentAt?: Date;
  pushSent?: boolean;
  pushSentAt?: Date;
  userAction?: 'acknowledged' | 'ignored' | 'entered' | 'cancelled';
  actionTime?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: any = {};
  if (data.emailSent !== undefined) updateData.emailSent = data.emailSent;
  if (data.emailSentAt) updateData.emailSentAt = data.emailSentAt.toISOString();
  if (data.pushSent !== undefined) updateData.pushSent = data.pushSent;
  if (data.pushSentAt) updateData.pushSentAt = data.pushSentAt.toISOString();
  if (data.userAction) updateData.userAction = data.userAction;
  if (data.actionTime) updateData.actionTime = data.actionTime.toISOString();

  return await db.update(signalAlerts)
    .set(updateData)
    .where(eq(signalAlerts.id, alertId));
}
