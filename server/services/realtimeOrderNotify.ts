import { getDatabaseService } from './databaseService.js';

/** Broadcast on `mobile_order_updated` — consumed by POS, Order Center, rider, and customer SSE. */
export async function notifyMobileOrderUpdated(payload: Record<string, unknown>): Promise<void> {
    const db = getDatabaseService();
    if (db.getType() !== 'postgres') return;
    try {
        await db.execute(`SELECT pg_notify('mobile_order_updated', $1)`, [JSON.stringify(payload)]);
    } catch (e) {
        console.warn('[realtime] pg_notify failed:', e);
    }
}
