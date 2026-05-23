import webpush from 'web-push';
import { randomUUID } from 'node:crypto';
import { getDatabaseService } from './databaseService.js';

export type PushSubscriberType = 'rider' | 'customer' | 'shop_user';

function vapidConfigured(): boolean {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    return !!(pub && priv);
}

function ensureVapid() {
    const pub = process.env.VAPID_PUBLIC_KEY!;
    const priv = process.env.VAPID_PRIVATE_KEY!;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@myshop.local';
    webpush.setVapidDetails(subject, pub, priv);
}

export class PushNotificationService {
    private db = getDatabaseService();

    getPublicKey(): string | null {
        return process.env.VAPID_PUBLIC_KEY || null;
    }

    async upsertSubscription(
        tenantId: string,
        subscriberType: PushSubscriberType,
        subscriberId: string,
        sub: { endpoint: string; keys: { p256dh: string; auth: string } },
        userAgent?: string
    ) {
        const id = randomUUID();
        const isPg = this.db.getType() === 'postgres';
        if (isPg) {
            await this.db.query(
                `INSERT INTO push_subscriptions (id, tenant_id, subscriber_type, subscriber_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, subscriber_type, subscriber_id, endpoint)
         DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, updated_at = NOW()`,
                [
                    id,
                    tenantId,
                    subscriberType,
                    subscriberId,
                    sub.endpoint,
                    sub.keys.p256dh,
                    sub.keys.auth,
                    userAgent || null,
                ]
            );
        } else {
            await this.db.query(
                `INSERT OR REPLACE INTO push_subscriptions (id, tenant_id, subscriber_type, subscriber_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), datetime('now'))`,
                [
                    id,
                    tenantId,
                    subscriberType,
                    subscriberId,
                    sub.endpoint,
                    sub.keys.p256dh,
                    sub.keys.auth,
                    userAgent || null,
                ]
            );
        }
        return { ok: true };
    }

    async sendToRider(
        tenantId: string,
        riderId: string,
        payload: { title: string; body: string; url?: string; tag?: string }
    ) {
        if (!vapidConfigured()) return { sent: 0, skipped: true };
        ensureVapid();
        const rows = await this.db.query(
            `SELECT endpoint, p256dh, auth FROM push_subscriptions
       WHERE tenant_id = $1 AND subscriber_type = 'rider' AND subscriber_id = $2`,
            [tenantId, riderId]
        );
        let sent = 0;
        const data = JSON.stringify(payload);
        for (const row of rows as { endpoint: string; p256dh: string; auth: string }[]) {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: row.endpoint,
                        keys: { p256dh: row.p256dh, auth: row.auth },
                    },
                    data
                );
                sent += 1;
            } catch (e: any) {
                if (e?.statusCode === 410 || e?.statusCode === 404) {
                    await this.db.execute(
                        `DELETE FROM push_subscriptions WHERE tenant_id = $1 AND endpoint = $2`,
                        [tenantId, row.endpoint]
                    );
                }
            }
        }
        return { sent, skipped: false };
    }

    async notifyRiderNewAssignment(
        tenantId: string,
        riderId: string,
        orderNumber: string,
        orderId: string
    ) {
        return this.sendToRider(tenantId, riderId, {
            title: 'New delivery',
            body: `Order #${orderNumber} assigned to you`,
            url: `/order/${orderId}`,
            tag: `assign-${orderId}`,
        });
    }
}

let pushInstance: PushNotificationService | null = null;
export function getPushNotificationService(): PushNotificationService {
    if (!pushInstance) pushInstance = new PushNotificationService();
    return pushInstance;
}
