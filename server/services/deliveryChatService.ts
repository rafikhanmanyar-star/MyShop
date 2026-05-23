import { randomUUID } from 'node:crypto';
import { getDatabaseService } from './databaseService.js';
import { notifyMobileOrderUpdated } from './realtimeOrderNotify.js';

export type ChatSenderRole = 'rider' | 'shop' | 'customer';

export type ChatMessageRow = {
    id: string;
    tenant_id: string;
    order_id: string;
    sender_role: ChatSenderRole;
    sender_id: string | null;
    body: string;
    created_at: string;
};

type OrderAccessOpts = { riderId?: string; customerId?: string };

export class DeliveryChatService {
    private db = getDatabaseService();

    private async getOrderRow(tenantId: string, orderId: string) {
        const rows = await this.db.query(
            `SELECT o.id, o.customer_id, o.payment_method, o.status, o.order_number, d.rider_id
       FROM mobile_orders o
       LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1 AND o.id = $2 LIMIT 1`,
            [tenantId, orderId]
        );
        if (rows.length === 0) throw new Error('Order not found');
        return rows[0] as {
            id: string;
            customer_id: string;
            payment_method: string;
            status: string;
            order_number: string;
            rider_id: string | null;
        };
    }

    private async assertOrderAccess(tenantId: string, orderId: string, opts?: OrderAccessOpts) {
        const row = await this.getOrderRow(tenantId, orderId);

        if (opts?.customerId) {
            if (row.customer_id !== opts.customerId) throw new Error('Access denied');
            if (String(row.payment_method) === 'SelfCollection') {
                throw new Error('Chat is not available for pickup orders.');
            }
            if (row.status === 'Cancelled') throw new Error('This order was cancelled.');
            return row;
        }

        if (opts?.riderId) {
            if (row.rider_id && row.rider_id !== opts.riderId) {
                throw new Error('Not assigned to this delivery');
            }
            return row;
        }

        return row;
    }

    async listMessages(
        tenantId: string,
        orderId: string,
        limit = 80,
        opts?: OrderAccessOpts
    ): Promise<ChatMessageRow[]> {
        await this.assertOrderAccess(tenantId, orderId, opts);
        const take = Math.min(Math.max(limit, 1), 200);
        const rows = await this.db.query(
            `SELECT id, tenant_id, order_id, sender_role, sender_id, body, created_at
       FROM delivery_chat_messages
       WHERE tenant_id = $1 AND order_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
            [tenantId, orderId, take]
        );
        return rows as ChatMessageRow[];
    }

    async sendMessage(
        tenantId: string,
        orderId: string,
        role: ChatSenderRole,
        senderId: string | null,
        body: string,
        opts?: OrderAccessOpts
    ): Promise<ChatMessageRow> {
        const text = String(body || '').trim();
        if (!text || text.length > 2000) throw new Error('Message is required (max 2000 characters).');
        const row = await this.assertOrderAccess(tenantId, orderId, opts);

        const id = randomUUID();
        const isPg = this.db.getType() === 'postgres';
        if (isPg) {
            await this.db.query(
                `INSERT INTO delivery_chat_messages (id, tenant_id, order_id, sender_role, sender_id, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, tenantId, orderId, role, senderId, text]
            );
        } else {
            await this.db.query(
                `INSERT INTO delivery_chat_messages (id, tenant_id, order_id, sender_role, sender_id, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
                [id, tenantId, orderId, role, senderId, text]
            );
        }

        const rows = await this.db.query(
            `SELECT id, tenant_id, order_id, sender_role, sender_id, body, created_at
       FROM delivery_chat_messages WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId]
        );

        void notifyMobileOrderUpdated({
            tenantId,
            orderId,
            orderNumber: row.order_number,
            riderId: row.rider_id ?? undefined,
            source: 'chat_message',
            senderRole: role,
            messagePreview: text.slice(0, 120),
        });

        return rows[0] as ChatMessageRow;
    }

    async listThreadsForRider(tenantId: string, riderId: string) {
        const rows = await this.db.query(
            `SELECT o.id AS order_id, o.order_number,
              COALESCE(NULLIF(TRIM(c.name), ''), c.phone, 'Customer') AS customer_name,
              d.status AS delivery_status,
              (SELECT body FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT sender_role FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_sender_role,
              (SELECT created_at FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       LEFT JOIN mobile_customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2
         AND d.status NOT IN ('DELIVERED', 'FAILED')
       ORDER BY d.updated_at DESC
       LIMIT 30`,
            [tenantId, riderId]
        );
        return rows;
    }

    /** Customer: active delivery orders eligible for chat. */
    async listThreadsForCustomer(tenantId: string, customerId: string) {
        const rows = await this.db.query(
            `SELECT o.id AS order_id, o.order_number, o.status,
              d.status AS delivery_status,
              (SELECT body FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT sender_role FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_sender_role,
              (SELECT created_at FROM delivery_chat_messages m
               WHERE m.tenant_id = o.tenant_id AND m.order_id = o.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
       FROM mobile_orders o
       LEFT JOIN delivery_orders d ON d.order_id = o.id AND d.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1 AND o.customer_id = $2
         AND o.payment_method <> 'SelfCollection'
         AND o.status <> 'Cancelled'
         AND (d.id IS NULL OR d.status NOT IN ('FAILED'))
       ORDER BY o.created_at DESC
       LIMIT 20`,
            [tenantId, customerId]
        );
        return rows;
    }
}

let instance: DeliveryChatService | null = null;
export function getDeliveryChatService(): DeliveryChatService {
    if (!instance) instance = new DeliveryChatService();
    return instance;
}
