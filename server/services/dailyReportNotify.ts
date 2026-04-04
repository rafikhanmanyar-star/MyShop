import { getDatabaseService } from './databaseService.js';

export type RealtimeNotifyType =
  | 'daily_report_updated'
  | 'sales_return_created'
  | 'sale_created'
  | 'settings_edit_lock_changed';

/** PostgreSQL NOTIFY for multi-user daily report refresh and realtime shop events (SSE clients LISTEN). */
export async function notifyDailyReportUpdated(
  tenantId: string,
  eventType: RealtimeNotifyType = 'daily_report_updated'
): Promise<void> {
  const db = getDatabaseService();
  if (db.getType() !== 'postgres') return;
  try {
    await db.execute(`SELECT pg_notify('daily_report_updated', $1)`, [
      JSON.stringify({ type: eventType, tenantId }),
    ]);
  } catch (e) {
    console.warn('[dailyReport] pg_notify failed:', e);
  }
}
