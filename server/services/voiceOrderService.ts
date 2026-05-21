import fs from 'fs';
import path from 'path';
import { getDatabaseService } from './databaseService.js';
import { getMobileOrderService } from './mobileOrderService.js';
import { transcribeVoiceAudio, type TranscriptionProvider } from './voiceTranscriptionService.js';

function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateVoiceOrderNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `VO-${datePart}-${randPart}`;
}

export const VOICE_ORDER_STATUSES = [
    'Pending',
    'Received',
    'Preparing',
    'InvoiceCreated',
    'Accepted',
    'Rejected',
    'OutForDelivery',
    'Delivered',
    'Cancelled',
] as const;

export type VoiceOrderStatus = (typeof VOICE_ORDER_STATUSES)[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
    Pending: ['Received', 'Cancelled'],
    Received: ['Preparing', 'Rejected', 'Cancelled'],
    Preparing: ['InvoiceCreated', 'Rejected', 'Cancelled'],
    InvoiceCreated: ['Accepted', 'Rejected', 'Cancelled'],
    Accepted: ['OutForDelivery', 'Cancelled'],
    OutForDelivery: ['Delivered', 'Cancelled'],
    Delivered: [],
    Rejected: [],
    Cancelled: [],
};

export interface VoiceOrderSettings {
    tenant_id: string;
    is_enabled: boolean;
    max_recording_seconds: number;
    max_upload_bytes: number;
    transcription_enabled: boolean;
    transcription_provider: TranscriptionProvider;
    transcription_api_key_set?: boolean;
    push_enabled: boolean;
    sms_enabled: boolean;
}

export interface CreateVoiceOrderInput {
    customerId: string;
    branchId?: string;
    notes?: string;
    deliveryMode?: 'delivery' | 'pickup';
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    audioDurationSeconds?: number;
}

function rowToSettings(row: Record<string, unknown>): VoiceOrderSettings {
    const bool = (v: unknown, def: boolean) => {
        if (v === true || v === 1 || v === '1' || v === 'true') return true;
        if (v === false || v === 0 || v === '0' || v === 'false') return false;
        return def;
    };
    return {
        tenant_id: String(row.tenant_id),
        is_enabled: bool(row.is_enabled, false),
        max_recording_seconds: Number(row.max_recording_seconds) || 120,
        max_upload_bytes: Number(row.max_upload_bytes) || 10 * 1024 * 1024,
        transcription_enabled: bool(row.transcription_enabled, false),
        transcription_provider: (String(row.transcription_provider || 'none') as TranscriptionProvider),
        transcription_api_key_set: !!(row.transcription_api_key != null && String(row.transcription_api_key).trim()),
        push_enabled: bool(row.push_enabled, true),
        sms_enabled: bool(row.sms_enabled, false),
    };
}

function enrichOrderRow(o: Record<string, unknown>): Record<string, unknown> {
    let transcription_items: unknown[] = [];
    try {
        const raw = o.transcription_items_json;
        if (raw) transcription_items = JSON.parse(String(raw));
    } catch { /* ignore */ }
    return {
        ...o,
        transcription_items,
        audio_duration: o.audio_duration_seconds,
    };
}

export class VoiceOrderService {
    private db = getDatabaseService();

    async ensureSettings(tenantId: string): Promise<VoiceOrderSettings> {
        const rows = await this.db.query(
            `SELECT * FROM voice_order_settings WHERE tenant_id = $1`,
            [tenantId]
        );
        if (rows.length > 0) return rowToSettings(rows[0]);
        await this.db.execute(
            `INSERT INTO voice_order_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
            [tenantId]
        );
        const again = await this.db.query(`SELECT * FROM voice_order_settings WHERE tenant_id = $1`, [tenantId]);
        return rowToSettings(again[0] || { tenant_id: tenantId });
    }

    async getSettings(tenantId: string, includeApiKey = false): Promise<VoiceOrderSettings & { transcription_api_key?: string }> {
        const s = await this.ensureSettings(tenantId);
        if (!includeApiKey) return s;
        const rows = await this.db.query(
            `SELECT transcription_api_key FROM voice_order_settings WHERE tenant_id = $1`,
            [tenantId]
        );
        return { ...s, transcription_api_key: rows[0]?.transcription_api_key as string | undefined };
    }

    async updateSettings(tenantId: string, patch: Partial<VoiceOrderSettings & { transcription_api_key?: string }>) {
        await this.ensureSettings(tenantId);
        const fields: string[] = [];
        const params: unknown[] = [tenantId];
        let idx = 2;
        const map: Record<string, unknown> = {
            is_enabled: patch.is_enabled,
            max_recording_seconds: patch.max_recording_seconds,
            max_upload_bytes: patch.max_upload_bytes,
            transcription_enabled: patch.transcription_enabled,
            transcription_provider: patch.transcription_provider,
            transcription_api_key: patch.transcription_api_key,
            push_enabled: patch.push_enabled,
            sms_enabled: patch.sms_enabled,
        };
        for (const [col, val] of Object.entries(map)) {
            if (val === undefined) continue;
            fields.push(`${col} = $${idx}`);
            params.push(val);
            idx++;
        }
        if (fields.length === 0) return this.getSettings(tenantId);
        fields.push(`updated_at = ${this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()'}`);
        await this.db.execute(
            `UPDATE voice_order_settings SET ${fields.join(', ')} WHERE tenant_id = $1`,
            params
        );
        return this.getSettings(tenantId);
    }

    async isVoiceOrderingEnabled(tenantId: string): Promise<boolean> {
        const mobileRows = await this.db.query(
            `SELECT is_enabled FROM mobile_ordering_settings WHERE tenant_id = $1`,
            [tenantId]
        );
        const mobileOn = mobileRows[0]?.is_enabled === true || mobileRows[0]?.is_enabled === 1;
        if (!mobileOn) return false;
        const s = await this.ensureSettings(tenantId);
        return s.is_enabled;
    }

    async createOrder(tenantId: string, input: CreateVoiceOrderInput) {
        const enabled = await this.isVoiceOrderingEnabled(tenantId);
        if (!enabled) throw new Error('Voice ordering is not enabled for this shop.');

        const id = generateId('vo');
        const orderNumber = generateVoiceOrderNumber();
        const deliveryMode = input.deliveryMode === 'pickup' ? 'pickup' : 'delivery';

        await this.db.execute(
            `INSERT INTO voice_orders (
                id, tenant_id, order_number, customer_id, branch_id, status, notes,
                delivery_mode, delivery_address, delivery_lat, delivery_lng, audio_duration_seconds
            ) VALUES ($1,$2,$3,$4,$5,'Pending',$6,$7,$8,$9,$10,$11)`,
            [
                id,
                tenantId,
                orderNumber,
                input.customerId,
                input.branchId || null,
                input.notes || null,
                deliveryMode,
                input.deliveryAddress || null,
                input.deliveryLat ?? null,
                input.deliveryLng ?? null,
                input.audioDurationSeconds ?? null,
            ]
        );
        await this.recordStatus(tenantId, id, null, 'Pending', input.customerId, 'customer');
        const rows = await this.getOrderById(tenantId, id);
        return rows;
    }

    async attachAudio(
        tenantId: string,
        orderId: string,
        relativeUrl: string,
        mimeType: string,
        durationSeconds: number,
        filePath: string
    ) {
        const settings = await this.getSettings(tenantId, true);
        const minDur = 2;
        const maxDur = settings.max_recording_seconds || 120;
        if (durationSeconds < minDur) throw new Error(`Recording must be at least ${minDur} seconds.`);
        if (durationSeconds > maxDur + 1) throw new Error(`Recording exceeds maximum ${maxDur} seconds.`);

        await this.db.execute(
            `UPDATE voice_orders SET audio_url = $1, audio_mime_type = $2, audio_duration_seconds = $3,
             updated_at = ${this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()'}
             WHERE id = $4 AND tenant_id = $5`,
            [relativeUrl, mimeType, durationSeconds, orderId, tenantId]
        );

        if (settings.transcription_enabled && fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            const provider = settings.transcription_provider || 'none';
            const key = (settings as { transcription_api_key?: string }).transcription_api_key;
            void this.runTranscription(tenantId, orderId, provider, key, buf, mimeType);
        }

        return this.getOrderById(tenantId, orderId);
    }

    private async runTranscription(
        tenantId: string,
        orderId: string,
        provider: TranscriptionProvider,
        apiKey: string | undefined,
        buf: Buffer,
        mimeType: string
    ) {
        try {
            const result = await transcribeVoiceAudio(provider, apiKey, buf, mimeType);
            if (!result) return;
            await this.db.execute(
                `UPDATE voice_orders SET transcription_text = $1, transcription_items_json = $2,
                 updated_at = ${this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()'}
                 WHERE id = $3 AND tenant_id = $4`,
                [result.text, JSON.stringify(result.items), orderId, tenantId]
            );
        } catch (e) {
            console.warn('Voice transcription error:', e);
        }
    }

    async getOrderById(tenantId: string, orderId: string, customerId?: string) {
        const params: unknown[] = [tenantId, orderId];
        let customerClause = '';
        if (customerId) {
            customerClause = ' AND vo.customer_id = $3';
            params.push(customerId);
        }
        const rows = await this.db.query(
            `SELECT vo.*,
              mc.name AS customer_name, mc.phone AS customer_phone,
              b.name AS branch_name, b.code AS branch_code,
              mo.order_number AS mobile_order_number, mo.status AS mobile_order_status,
              s.sale_number AS invoice_number, s.grand_total AS invoice_grand_total
             FROM voice_orders vo
             JOIN mobile_customers mc ON mc.id = vo.customer_id AND mc.tenant_id = vo.tenant_id
             LEFT JOIN shop_branches b ON b.id = vo.branch_id
             LEFT JOIN mobile_orders mo ON mo.id = vo.mobile_order_id
             LEFT JOIN shop_sales s ON s.id = vo.created_invoice_id
             WHERE vo.tenant_id = $1 AND vo.id = $2${customerClause}`,
            params
        );
        if (!rows.length) return null;
        const history = await this.db.query(
            `SELECT * FROM voice_order_status_history WHERE voice_order_id = $1 ORDER BY created_at ASC`,
            [orderId]
        );
        return enrichOrderRow({ ...rows[0], status_history: history });
    }

    async listOrders(
        tenantId: string,
        opts: { status?: string; branchId?: string; customerId?: string; limit?: number; cursor?: string } = {}
    ) {
        const limit = Math.min(opts.limit || 50, 100);
        const params: unknown[] = [tenantId];
        let where = 'WHERE vo.tenant_id = $1';
        let idx = 2;
        if (opts.status && opts.status !== 'All') {
            where += ` AND vo.status = $${idx}`;
            params.push(opts.status);
            idx++;
        }
        if (opts.branchId) {
            where += ` AND vo.branch_id = $${idx}`;
            params.push(opts.branchId);
            idx++;
        }
        if (opts.customerId) {
            where += ` AND vo.customer_id = $${idx}`;
            params.push(opts.customerId);
            idx++;
        }
        if (opts.cursor) {
            where += ` AND vo.created_at < $${idx}`;
            params.push(opts.cursor);
            idx++;
        }
        params.push(limit + 1);
        const rows = await this.db.query(
            `SELECT vo.*, mc.name AS customer_name, mc.phone AS customer_phone,
              b.name AS branch_name
             FROM voice_orders vo
             JOIN mobile_customers mc ON mc.id = vo.customer_id AND mc.tenant_id = vo.tenant_id
             LEFT JOIN shop_branches b ON b.id = vo.branch_id
             ${where}
             ORDER BY vo.created_at DESC
             LIMIT $${idx}`,
            params
        );
        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map(enrichOrderRow);
        const nextCursor = hasMore ? String(items[items.length - 1]?.created_at) : null;
        return { items, hasMore, nextCursor };
    }

    async updateStatus(
        tenantId: string,
        orderId: string,
        newStatus: VoiceOrderStatus,
        changedBy: string,
        changedByType: string,
        note?: string
    ) {
        const rows = await this.db.query(
            `SELECT status FROM voice_orders WHERE id = $1 AND tenant_id = $2`,
            [orderId, tenantId]
        );
        if (!rows.length) throw new Error('Voice order not found');
        const current = String(rows[0].status);
        const allowed = VALID_TRANSITIONS[current] || [];
        if (!allowed.includes(newStatus) && current !== newStatus) {
            throw new Error(`Cannot change status from ${current} to ${newStatus}`);
        }
        const nowExpr = this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()';
        let extra = '';
        if (newStatus === 'Received') extra = `, received_at = ${nowExpr}`;
        await this.db.execute(
            `UPDATE voice_orders SET status = $1, updated_at = ${nowExpr}${extra}
             WHERE id = $2 AND tenant_id = $3`,
            [newStatus, orderId, tenantId]
        );
        await this.recordStatus(tenantId, orderId, current, newStatus, changedBy, changedByType, note);
        return this.getOrderById(tenantId, orderId);
    }

    async linkInvoice(
        tenantId: string,
        orderId: string,
        saleId: string,
        changedBy: string,
        opts?: { createMobileOrder?: boolean; paymentMethod?: string }
    ) {
        const order = await this.getOrderById(tenantId, orderId);
        if (!order) throw new Error('Voice order not found');

        const saleRows = await this.db.query(
            `SELECT id, branch_id, grand_total FROM shop_sales WHERE id = $1 AND tenant_id = $2`,
            [saleId, tenantId]
        );
        if (!saleRows.length) throw new Error('Invoice (sale) not found');

        const nowExpr = this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()';
        await this.db.execute(
            `UPDATE voice_orders SET created_invoice_id = $1, status = 'InvoiceCreated',
             invoice_created_at = ${nowExpr}, updated_at = ${nowExpr}
             WHERE id = $2 AND tenant_id = $3`,
            [saleId, orderId, tenantId]
        );
        await this.recordStatus(tenantId, orderId, String(order.status), 'InvoiceCreated', changedBy, 'shop_user');

        let mobileOrderId: string | null = order.mobile_order_id as string | null;
        if (opts?.createMobileOrder !== false && !mobileOrderId) {
            mobileOrderId = await this.createMobileOrderFromSale(tenantId, order, saleId, opts?.paymentMethod);
            if (mobileOrderId) {
                await this.db.execute(
                    `UPDATE voice_orders SET mobile_order_id = $1 WHERE id = $2 AND tenant_id = $3`,
                    [mobileOrderId, orderId, tenantId]
                );
            }
        }

        return this.getOrderById(tenantId, orderId);
    }

    private async createMobileOrderFromSale(
        tenantId: string,
        voiceOrder: Record<string, unknown>,
        saleId: string,
        paymentMethod?: string
    ): Promise<string | null> {
        const items = await this.db.query(
            `SELECT product_id, quantity FROM shop_sale_items WHERE sale_id = $1 AND tenant_id = $2`,
            [saleId, tenantId]
        );
        if (!items.length) return null;

        const pm = paymentMethod
            || (voiceOrder.delivery_mode === 'pickup' ? 'SelfCollection' : 'COD');
        try {
            const result = await getMobileOrderService().placeOrder(tenantId, {
                customerId: String(voiceOrder.customer_id),
                branchId: (voiceOrder.branch_id as string) || undefined,
                items: items.map((i: { product_id: string; quantity: number }) => ({
                    productId: i.product_id,
                    quantity: Number(i.quantity),
                })),
                deliveryAddress: voiceOrder.delivery_address as string | undefined,
                deliveryLat: voiceOrder.delivery_lat != null ? Number(voiceOrder.delivery_lat) : undefined,
                deliveryLng: voiceOrder.delivery_lng != null ? Number(voiceOrder.delivery_lng) : undefined,
                deliveryNotes: voiceOrder.notes ? `Voice order ${voiceOrder.order_number}: ${voiceOrder.notes}` : `Voice order ${voiceOrder.order_number}`,
                paymentMethod: pm,
            });
            const placed = result as { order?: { id?: string } };
            return placed?.order?.id || null;
        } catch (e) {
            console.warn('Could not create mobile order from voice invoice:', e);
            return null;
        }
    }

    async customerApprove(tenantId: string, orderId: string, customerId: string) {
        const order = await this.getOrderById(tenantId, orderId, customerId);
        if (!order) throw new Error('Voice order not found');
        if (order.status !== 'InvoiceCreated') {
            throw new Error('Invoice must be created before approval');
        }
        const nowExpr = this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()';
        await this.db.execute(
            `UPDATE voice_orders SET customer_approved_at = ${nowExpr}, status = 'Accepted', updated_at = ${nowExpr}
             WHERE id = $1 AND tenant_id = $2`,
            [orderId, tenantId]
        );
        await this.recordStatus(tenantId, orderId, 'InvoiceCreated', 'Accepted', customerId, 'customer');
        return this.getOrderById(tenantId, orderId, customerId);
    }

    async getAnalytics(tenantId: string, days = 30) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceIso = since.toISOString();
        const isSqlite = this.db.getType() === 'sqlite';
        const stats = isSqlite
            ? await this.db.query(
                `SELECT
                  COUNT(*) AS total,
                  SUM(CASE WHEN status IN ('InvoiceCreated','Accepted','Delivered') THEN 1 ELSE 0 END) AS invoiced,
                  SUM(CASE WHEN status = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
                  AVG((julianday(invoice_created_at) - julianday(created_at)) * 86400) AS avg_seconds_to_invoice
                 FROM voice_orders WHERE tenant_id = $1 AND created_at >= $2`,
                [tenantId, sinceIso]
            )
            : await this.db.query(
                `SELECT
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status IN ('InvoiceCreated', 'Accepted', 'Delivered'))::int AS invoiced,
                  COUNT(*) FILTER (WHERE status = 'Delivered')::int AS delivered,
                  AVG(EXTRACT(EPOCH FROM (invoice_created_at - created_at))) FILTER (WHERE invoice_created_at IS NOT NULL) AS avg_seconds_to_invoice
                 FROM voice_orders WHERE tenant_id = $1 AND created_at >= $2`,
                [tenantId, sinceIso]
            );
        const topCustomers = await this.db.query(
            `SELECT mc.name, mc.phone, COUNT(*) AS order_count
             FROM voice_orders vo
             JOIN mobile_customers mc ON mc.id = vo.customer_id
             WHERE vo.tenant_id = $1 AND vo.created_at >= $2
             GROUP BY mc.id, mc.name, mc.phone
             ORDER BY order_count DESC LIMIT 10`,
            [tenantId, sinceIso]
        );
        const row = stats[0] || {};
        const total = Number(row.total) || 0;
        const invoiced = Number(row.invoiced) || 0;
        return {
            periodDays: days,
            totalVoiceOrders: total,
            conversionRate: total > 0 ? Math.round((invoiced / total) * 1000) / 10 : 0,
            deliveryCompletionRate: invoiced > 0 ? Math.round((Number(row.delivered) / invoiced) * 1000) / 10 : 0,
            avgProcessingSeconds: row.avg_seconds_to_invoice != null ? Math.round(Number(row.avg_seconds_to_invoice)) : null,
            topCustomers,
        };
    }

    private async recordStatus(
        tenantId: string,
        voiceOrderId: string,
        fromStatus: string | null,
        toStatus: string,
        changedBy: string,
        changedByType: string,
        note?: string
    ) {
        await this.db.execute(
            `INSERT INTO voice_order_status_history (id, tenant_id, voice_order_id, from_status, to_status, changed_by, changed_by_type, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [generateId('vosh'), tenantId, voiceOrderId, fromStatus, toStatus, changedBy, changedByType, note || null]
        );
    }
}

let instance: VoiceOrderService | null = null;
export function getVoiceOrderService(): VoiceOrderService {
    if (!instance) instance = new VoiceOrderService();
    return instance;
}
