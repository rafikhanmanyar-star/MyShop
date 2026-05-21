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
    Accepted: ['Preparing', 'OutForDelivery', 'Cancelled'],
    OutForDelivery: ['Delivered', 'Cancelled'],
    Delivered: [],
    Rejected: [],
    Cancelled: [],
};

function generateMobileOrderNumber(): string {
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MO-${datePart}-${randPart}`;
}

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
            `INSERT INTO voice_order_settings (tenant_id, is_enabled) VALUES ($1, TRUE)
             ON CONFLICT (tenant_id) DO NOTHING`,
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

        const statusRows = await this.db.query(
            `SELECT status FROM voice_orders WHERE id = $1 AND tenant_id = $2`,
            [orderId, tenantId]
        );
        if (statusRows[0]?.status === 'Pending') {
            await this.updateStatus(tenantId, orderId, 'Received', 'system', 'system', 'Audio received');
        }

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
        const row = rows[0] as Record<string, unknown>;
        let invoice_items: unknown[] = [];
        if (row.created_invoice_id) {
            invoice_items = await this.db.query(
                `SELECT si.product_id, si.quantity, si.unit_price, si.tax_amount, si.discount_amount, si.subtotal,
                  p.name AS product_name, p.sku AS product_sku
                 FROM shop_sale_items si
                 JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
                 WHERE si.sale_id = $1 AND si.tenant_id = $2
                 ORDER BY si.created_at ASC`,
                [row.created_invoice_id, tenantId]
            );
        }
        let mobile_order_items: unknown[] = [];
        if (row.mobile_order_id) {
            mobile_order_items = await this.db.query(
                `SELECT product_id, product_name, product_sku, quantity, unit_price, tax_amount, discount_amount, subtotal
                 FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2`,
                [row.mobile_order_id, tenantId]
            );
        }
        return enrichOrderRow({
            ...row,
            status_history: history,
            invoice_items,
            mobile_order_items,
        });
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
              b.name AS branch_name,
              mo.order_number AS mobile_order_number, mo.status AS mobile_order_status,
              s.sale_number AS invoice_number, s.grand_total AS invoice_grand_total
             FROM voice_orders vo
             JOIN mobile_customers mc ON mc.id = vo.customer_id AND mc.tenant_id = vo.tenant_id
             LEFT JOIN shop_branches b ON b.id = vo.branch_id
             LEFT JOIN mobile_orders mo ON mo.id = vo.mobile_order_id AND mo.tenant_id = vo.tenant_id
             LEFT JOIN shop_sales s ON s.id = vo.created_invoice_id AND s.tenant_id = vo.tenant_id
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
            mobileOrderId = await this.createMobileOrderFromInvoice(
                tenantId,
                order,
                saleId,
                opts?.paymentMethod
            );
            if (!mobileOrderId) {
                throw new Error('Could not create delivery order from invoice. Add line items to the POS sale and try again.');
            }
            await this.db.execute(
                `UPDATE voice_orders SET mobile_order_id = $1 WHERE id = $2 AND tenant_id = $3`,
                [mobileOrderId, orderId, tenantId]
            );
        }

        const currentAfter = await this.db.query(
            `SELECT status FROM voice_orders WHERE id = $1 AND tenant_id = $2`,
            [orderId, tenantId]
        );
        const st = String(currentAfter[0]?.status || 'InvoiceCreated');
        if (st === 'InvoiceCreated') {
            await this.updateStatus(tenantId, orderId, 'Accepted', changedBy, 'shop_user', 'Invoice linked — ready for delivery');
        }

        return this.getOrderById(tenantId, orderId);
    }

    /**
     * Creates a mobile_orders row from a completed POS sale (no extra stock reservation).
     * Stock was already deducted at checkout; inventory_deducted=TRUE skips mobile fulfillment deduction.
     */
    private async createMobileOrderFromInvoice(
        tenantId: string,
        voiceOrder: Record<string, unknown>,
        saleId: string,
        paymentMethod?: string
    ): Promise<string | null> {
        const saleRows = await this.db.query(
            `SELECT id, branch_id, subtotal, tax_total, discount_total, grand_total, payment_method
             FROM shop_sales WHERE id = $1 AND tenant_id = $2`,
            [saleId, tenantId]
        );
        if (!saleRows.length) return null;

        const sale = saleRows[0] as Record<string, unknown>;
        const itemRows = await this.db.query(
            `SELECT si.product_id, si.quantity, si.unit_price, si.tax_amount, si.discount_amount, si.subtotal,
              p.name AS product_name, p.sku AS product_sku
             FROM shop_sale_items si
             JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
             WHERE si.sale_id = $1 AND si.tenant_id = $2`,
            [saleId, tenantId]
        );
        if (!itemRows.length) return null;

        const pm = paymentMethod
            || (voiceOrder.delivery_mode === 'pickup' ? 'SelfCollection' : String(sale.payment_method || 'COD'));
        const deliveryNotes = voiceOrder.notes
            ? `Voice ${voiceOrder.order_number}: ${voiceOrder.notes}`
            : `Voice order ${voiceOrder.order_number}`;
        const branchId = (voiceOrder.branch_id as string) || (sale.branch_id as string) || null;
        const deliveryLat = voiceOrder.delivery_lat != null ? Number(voiceOrder.delivery_lat) : null;
        const deliveryLng = voiceOrder.delivery_lng != null ? Number(voiceOrder.delivery_lng) : null;

        const orderId = await this.db.transaction(async (client: any) => {
            const mordId = generateId('mord');
            const orderNumber = generateMobileOrderNumber();
            const nowExpr = this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()';

            await client.query(
                `INSERT INTO mobile_orders (
                  id, tenant_id, customer_id, branch_id, order_number, status,
                  subtotal, tax_total, discount_total, delivery_fee, grand_total,
                  payment_method, payment_status,
                  delivery_address, delivery_lat, delivery_lng, delivery_notes,
                  assigned_branch_id, inventory_deducted, pos_synced, pos_synced_at,
                  created_at, updated_at
                ) VALUES (
                  $1,$2,$3,$4,$5,'Pending',
                  $6,$7,$8,$9,$10,
                  $11,'Unpaid',
                  $12,$13,$14,$15,
                  $16,TRUE,TRUE,${nowExpr},
                  ${nowExpr},${nowExpr}
                )`,
                [
                    mordId,
                    tenantId,
                    String(voiceOrder.customer_id),
                    branchId,
                    orderNumber,
                    sale.subtotal,
                    sale.tax_total,
                    sale.discount_total ?? 0,
                    0,
                    sale.grand_total,
                    pm,
                    voiceOrder.delivery_address || null,
                    deliveryLat,
                    deliveryLng,
                    deliveryNotes,
                    branchId,
                ]
            );

            for (const line of itemRows as Record<string, unknown>[]) {
                await client.query(
                    `INSERT INTO mobile_order_items (
                      id, tenant_id, order_id, product_id, product_name, product_sku,
                      quantity, unit_price, tax_amount, discount_amount, subtotal
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                    [
                        generateId('moi'),
                        tenantId,
                        mordId,
                        line.product_id,
                        line.product_name,
                        line.product_sku,
                        line.quantity,
                        line.unit_price,
                        line.tax_amount ?? 0,
                        line.discount_amount ?? 0,
                        line.subtotal,
                    ]
                );
            }

            await client.query(
                `INSERT INTO mobile_order_status_history (id, tenant_id, order_id, from_status, to_status, changed_by, changed_by_type, note)
                 VALUES ($1,$2,$3,NULL,'Pending','system','system',$4)`,
                [generateId('mosh'), tenantId, mordId, `Created from voice order ${voiceOrder.order_number}`]
            );

            if (pm !== 'SelfCollection') {
                try {
                    const { tryAutoAssignRiderForMobileOrder } = await import('./deliveryAssignment.js');
                    await tryAutoAssignRiderForMobileOrder(client, tenantId, mordId, {
                        deliveryLat,
                        deliveryLng,
                        assignedBranchId: branchId,
                    });
                } catch (riderErr) {
                    console.warn('Voice order rider auto-assign skipped:', riderErr);
                }
            }

            return mordId;
        });

        return orderId;
    }

    /** Keep voice order status aligned with linked mobile_orders delivery pipeline. */
    async syncStatusFromMobileOrder(tenantId: string, mobileOrderId: string, mobileStatus: string) {
        const rows = await this.db.query(
            `SELECT id, status FROM voice_orders WHERE tenant_id = $1 AND mobile_order_id = $2`,
            [tenantId, mobileOrderId]
        );
        if (!rows.length) return;

        const voiceId = String(rows[0].id);
        const current = String(rows[0].status);
        const map: Partial<Record<string, VoiceOrderStatus>> = {
            OutForDelivery: 'OutForDelivery',
            Delivered: 'Delivered',
            Cancelled: 'Cancelled',
        };
        const target = map[mobileStatus];
        if (!target || current === target) return;

        try {
            await this.updateStatus(tenantId, voiceId, target, 'system', 'system', `Synced from delivery order (${mobileStatus})`);
        } catch {
            const nowExpr = this.db.getType() === 'sqlite' ? "datetime('now')" : 'NOW()';
            await this.db.execute(
                `UPDATE voice_orders SET status = $1, updated_at = ${nowExpr} WHERE id = $2 AND tenant_id = $3`,
                [target, voiceId, tenantId]
            );
            await this.recordStatus(tenantId, voiceId, current, target, 'system', 'system', `Synced from delivery (${mobileStatus})`);
        }
    }

    /** Customer order history: mobile orders + voice orders still awaiting invoice. */
    async getCustomerOrderFeed(tenantId: string, customerId: string, cursor?: string, limit = 20) {
        const mobile = await getMobileOrderService().getCustomerOrders(tenantId, customerId, cursor, limit);
        const voicePending = await this.listOrders(tenantId, {
            customerId,
            limit: 30,
        });
        const awaiting = (voicePending.items as Record<string, unknown>[]).filter(
            (v) => !v.mobile_order_id
        );

        const voiceCards = awaiting.map((v) => ({
            id: v.mobile_order_id || v.id,
            order_number: (v.mobile_order_number as string) || (v.order_number as string),
            status: v.mobile_order_id
                ? (v.mobile_order_status as string)
                : v.status === 'Pending'
                  ? 'AwaitingShop'
                  : (v.status as string),
            grand_total: v.invoice_grand_total ?? null,
            payment_method: v.delivery_mode === 'pickup' ? 'SelfCollection' : 'COD',
            payment_status: 'Unpaid',
            delivery_address: v.delivery_address,
            created_at: v.created_at,
            updated_at: v.updated_at,
            order_type: 'voice' as const,
            voice_order_id: v.id,
        }));

        const mobileCards = (mobile.items as Record<string, unknown>[]).map((m) => ({
            ...m,
            order_type: 'mobile' as const,
            voice_order_id: null,
        }));

        const merged = [...voiceCards, ...mobileCards].sort(
            (a, b) =>
                new Date(String((a as { created_at?: string }).created_at || 0)).getTime() -
                new Date(String((b as { created_at?: string }).created_at || 0)).getTime()
        );

        return {
            items: merged.slice(0, limit),
            nextCursor: mobile.nextCursor,
            hasMore: mobile.hasMore || voiceCards.length > 0,
        };
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
