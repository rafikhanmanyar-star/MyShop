import { getDatabaseService } from './databaseService.js';

/** PostgreSQL NOTIFY for multi-user daily report refresh (SSE clients LISTEN). */
export async function notifyDailyReportUpdated(tenantId: string): Promise<void> {
  const db = getDatabaseService();
  if (db.getType() !== 'postgres') return;
  try {
    await db.execute(`SELECT pg_notify('daily_report_updated', $1)`, [
      JSON.stringify({ type: 'daily_report_updated', tenantId }),
    ]);
  } catch (e) {
    console.warn('[dailyReport] pg_notify failed:', e);
  }
}
