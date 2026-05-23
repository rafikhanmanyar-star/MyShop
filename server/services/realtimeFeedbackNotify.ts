import { getDatabaseService } from './databaseService.js';

/** Broadcast on `customer_feedback_updated` — POS SSE + customer notification stream. */
export async function notifyCustomerFeedbackUpdated(payload: Record<string, unknown>): Promise<void> {
    const db = getDatabaseService();
    if (db.getType() !== 'postgres') return;
    try {
        await db.execute(`SELECT pg_notify('customer_feedback_updated', $1)`, [JSON.stringify(payload)]);
    } catch (e) {
        console.warn('[realtime] customer_feedback_updated notify failed:', e);
    }
}
