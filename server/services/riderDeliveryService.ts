import { getDatabaseService } from './databaseService.js';
import { getMobileOrderService } from './mobileOrderService.js';
import { haversineDistanceKm } from '../utils/haversine.js';

function safeNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export type RiderOrderBucket = 'assigned' | 'active' | 'completed';

function bucketWhere(bucket?: RiderOrderBucket): string {
    if (bucket === 'assigned') {
        return ` AND d.status = 'ASSIGNED' AND d.accepted_at IS NULL `;
    }
    if (bucket === 'active') {
        return ` AND (
            (d.status = 'ASSIGNED' AND d.accepted_at IS NOT NULL)
            OR d.status IN ('PICKED', 'ON_THE_WAY')
        ) `;
    }
    if (bucket === 'completed') {
        return ` AND d.status IN ('DELIVERED', 'FAILED') `;
    }
    return '';
}

/**
 * Stage 6: Rider-facing delivery task APIs (assigned delivery_orders for this rider).
 * Stage 7: Live GPS via RiderService.updateLocation (nearest-rider + distance in-app).
 */
export class RiderDeliveryService {
    private db = getDatabaseService();

    async listForRider(
        tenantId: string,
        riderId: string,
        opts?: { bucket?: RiderOrderBucket; limit?: number; offset?: number }
    ) {
        const limit = Math.min(Math.max(Number(opts?.limit) || 30, 1), 100);
        const offset = Math.max(Number(opts?.offset) || 0, 0);
        const take = limit + 1;
        const bw = bucketWhere(opts?.bucket);

        const rows = await this.db.query(
            `SELECT d.id AS delivery_order_id, d.status AS delivery_status, d.assigned_at, d.accepted_at, d.picked_at, d.delivered_at,
              d.arrived_at, d.cod_expected, d.cod_collected,
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.distance_km AS branch_to_customer_km,
              o.estimated_delivery_at, o.payment_method, o.delivery_notes, o.created_at,
              COALESCE(NULLIF(TRIM(c.name), ''), c.phone, 'Customer') AS customer_name,
              (SELECT COUNT(*)::int FROM mobile_order_items i WHERE i.order_id = o.id AND i.tenant_id = o.tenant_id) AS item_count
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       LEFT JOIN mobile_customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2
       ${bw}
       ORDER BY d.created_at DESC
       LIMIT $3 OFFSET $4`,
            [tenantId, riderId, take, offset]
        );

        const hasMore = rows.length > limit;
        const slice = (hasMore ? rows.slice(0, limit) : rows) as any[];

        const rlat = await this.db.query(
            `SELECT current_latitude, current_longitude FROM riders WHERE id = $1 AND tenant_id = $2`,
            [riderId, tenantId]
        );
        let riderLat: number | null = null;
        let riderLng: number | null = null;
        if (rlat.length > 0 && rlat[0].current_latitude != null && rlat[0].current_longitude != null) {
            riderLat = parseFloat(rlat[0].current_latitude);
            riderLng = parseFloat(rlat[0].current_longitude);
        }

        const orders = slice.map((r) => {
            let distance_km: number | null = null;
            const lat = r.delivery_lat != null ? parseFloat(String(r.delivery_lat)) : NaN;
            const lng = r.delivery_lng != null ? parseFloat(String(r.delivery_lng)) : NaN;
            if (
                riderLat != null &&
                riderLng != null &&
                Number.isFinite(lat) &&
                Number.isFinite(lng)
            ) {
                distance_km =
                    Math.round(haversineDistanceKm(lat, lng, riderLat, riderLng) * 100) / 100;
            }
            return {
                ...r,
                grand_total: safeNum(r.grand_total),
                distance_km,
            };
        });

        return { orders, hasMore };
    }

    async getDetailForRider(tenantId: string, riderId: string, mobileOrderId: string) {
        const rows = await this.db.query(
            `SELECT d.id AS delivery_order_id, d.status AS delivery_status, d.assigned_at, d.accepted_at, d.picked_at, d.delivered_at,
              d.arrived_at, d.cod_expected, d.cod_collected, d.delivery_proof_type,
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.distance_km AS branch_to_customer_km,
              o.delivery_notes, o.estimated_delivery_at, o.payment_method, o.created_at,
              COALESCE(NULLIF(TRIM(c.name), ''), c.phone, 'Customer') AS customer_name,
              c.phone AS customer_phone
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       LEFT JOIN mobile_customers c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND o.id = $3`,
            [tenantId, riderId, mobileOrderId]
        );
        if (rows.length === 0) return null;
        const head = rows[0] as any;

        const items = await this.db.query(
            `SELECT product_name, product_sku, quantity, subtotal
       FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
            [mobileOrderId, tenantId]
        );

        let distKm: number | null = null;
        const lat = head.delivery_lat != null ? parseFloat(head.delivery_lat) : NaN;
        const lng = head.delivery_lng != null ? parseFloat(head.delivery_lng) : NaN;
        const rlat = await this.db.query(
            `SELECT current_latitude, current_longitude FROM riders WHERE id = $1 AND tenant_id = $2`,
            [riderId, tenantId]
        );
        if (
            rlat.length > 0 &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            rlat[0].current_latitude != null &&
            rlat[0].current_longitude != null
        ) {
            distKm = Math.round(
                haversineDistanceKm(
                    lat,
                    lng,
                    parseFloat(rlat[0].current_latitude),
                    parseFloat(rlat[0].current_longitude)
                ) * 10000
            ) / 10000;
        }

        return {
            ...head,
            grand_total: safeNum(head.grand_total),
            distance_km: distKm,
            items: (items as any[]).map((i) => ({
                product_name: i.product_name,
                product_sku: i.product_sku,
                quantity: safeNum(i.quantity),
                subtotal: safeNum(i.subtotal),
            })),
        };
    }

    async accept(tenantId: string, riderId: string, mobileOrderId: string) {
        const res = await this.db.query(
            `UPDATE delivery_orders
       SET accepted_at = COALESCE(accepted_at, NOW()), updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3 AND status = 'ASSIGNED'
       RETURNING id`,
            [tenantId, riderId, mobileOrderId]
        );
        if (res.length === 0) throw new Error('No active assignment for this order, or already past acceptance.');
        return { ok: true };
    }

    async markOnTheWay(tenantId: string, riderId: string, mobileOrderId: string) {
        const res = await this.db.query(
            `UPDATE delivery_orders
       SET status = 'ON_THE_WAY', updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3 AND status = 'PICKED'
       RETURNING id`,
            [tenantId, riderId, mobileOrderId]
        );
        if (res.length === 0) {
            throw new Error('Pick up the order before marking on the way.');
        }
        const m = getMobileOrderService();
        const row = await this.db.query(`SELECT status FROM mobile_orders WHERE id = $1 AND tenant_id = $2`, [
            mobileOrderId,
            tenantId,
        ]);
        const st = String(row[0]?.status || '');
        if (st === 'Packed') {
            try {
                await m.updateOrderStatus(tenantId, mobileOrderId, 'OutForDelivery', 'rider', 'rider');
            } catch (e: any) {
                const msg = String(e?.message || e);
                if (!msg.includes('Cannot transition')) throw e;
            }
        }
        return { ok: true };
    }

    async rejectAssignment(tenantId: string, riderId: string, mobileOrderId: string) {
        const del = await this.db.query(
            `DELETE FROM delivery_orders
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3
         AND status = 'ASSIGNED' AND accepted_at IS NULL
       RETURNING id`,
            [tenantId, riderId, mobileOrderId]
        );
        if (del.length === 0) {
            throw new Error('This delivery can no longer be declined.');
        }

        const remaining = await this.db.query(
            `SELECT COUNT(*)::int AS n FROM delivery_orders
       WHERE tenant_id = $1 AND rider_id = $2 AND status <> 'DELIVERED'`,
            [tenantId, riderId]
        );
        const n = remaining[0]?.n ?? 0;
        if (n === 0) {
            await this.db.execute(
                `UPDATE riders SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
                [riderId, tenantId]
            );
        }
        return { ok: true };
    }

    async markPicked(tenantId: string, riderId: string, mobileOrderId: string) {
        const chk = await this.db.query(
            `SELECT d.id, d.status FROM delivery_orders d
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.order_id = $3`,
            [tenantId, riderId, mobileOrderId]
        );
        if (chk.length === 0) throw new Error('Delivery task not found');
        if (chk[0].status !== 'ASSIGNED') {
            throw new Error('Order is not waiting for pickup.');
        }

        await this.db.query(
            `UPDATE delivery_orders
       SET status = 'PICKED', picked_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3`,
            [tenantId, riderId, mobileOrderId]
        );

        await this.advanceMobileOrderTowardDelivery(tenantId, mobileOrderId);
        return { ok: true };
    }

    async markArrived(tenantId: string, riderId: string, mobileOrderId: string) {
        const res = await this.db.query(
            `UPDATE delivery_orders
       SET arrived_at = COALESCE(arrived_at, NOW()), updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3
         AND status IN ('PICKED', 'ON_THE_WAY')
       RETURNING id`,
            [tenantId, riderId, mobileOrderId]
        );
        if (res.length === 0) throw new Error('Order is not in an active delivery state.');
        return { ok: true };
    }

    async markDelivered(
        tenantId: string,
        riderId: string,
        mobileOrderId: string,
        opts?: {
            proofType?: string;
            proofData?: string;
            codCollected?: number;
        }
    ) {
        const chk = await this.db.query(
            `SELECT d.status, o.grand_total, o.payment_method
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.order_id = $3`,
            [tenantId, riderId, mobileOrderId]
        );
        if (chk.length === 0) throw new Error('Delivery task not found');
        const st = chk[0].status;
        if (st !== 'PICKED' && st !== 'ON_THE_WAY') {
            throw new Error('Mark the order as picked before completing delivery.');
        }

        const pm = String(chk[0].payment_method || '').toLowerCase();
        const isCod = pm.includes('cod') || pm === 'cash' || pm === '';
        const expected = safeNum(chk[0].grand_total);
        const collected =
            opts?.codCollected != null && Number.isFinite(Number(opts.codCollected))
                ? Number(opts.codCollected)
                : isCod
                  ? expected
                  : null;

        await this.db.query(
            `UPDATE delivery_orders
       SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW(),
           cod_expected = COALESCE(cod_expected, $4),
           cod_collected = $5,
           delivery_proof_type = $6,
           delivery_proof_data = $7
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3`,
            [
                tenantId,
                riderId,
                mobileOrderId,
                isCod ? expected : null,
                collected,
                opts?.proofType || null,
                opts?.proofData || null,
            ]
        );

        const m = getMobileOrderService();
        await m.updateOrderStatus(tenantId, mobileOrderId, 'Delivered', 'rider', 'rider');

        await this.db.query(
            `UPDATE riders SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [riderId, tenantId]
        );

        return { ok: true };
    }

    async markFailed(
        tenantId: string,
        riderId: string,
        mobileOrderId: string,
        body: { reason: string; notes?: string; proofData?: string }
    ) {
        const reason = String(body.reason || '').trim();
        if (!reason) throw new Error('Failure reason is required.');

        const res = await this.db.query(
            `UPDATE delivery_orders
       SET status = 'FAILED', failed_at = NOW(), failed_reason = $4, failed_notes = $5,
           delivery_proof_type = 'failed_photo', delivery_proof_data = $6, updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3
         AND status IN ('ASSIGNED', 'PICKED', 'ON_THE_WAY')
       RETURNING id`,
            [
                tenantId,
                riderId,
                mobileOrderId,
                reason,
                body.notes?.trim() || null,
                body.proofData || null,
            ]
        );
        if (res.length === 0) throw new Error('Cannot mark this delivery as failed.');

        const remaining = await this.db.query(
            `SELECT COUNT(*)::int AS n FROM delivery_orders
       WHERE tenant_id = $1 AND rider_id = $2 AND status NOT IN ('DELIVERED', 'FAILED')`,
            [tenantId, riderId]
        );
        if ((remaining[0]?.n ?? 0) === 0) {
            await this.db.execute(
                `UPDATE riders SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
                [riderId, tenantId]
            );
        }
        return { ok: true };
    }

    async getDashboardSummary(tenantId: string, riderId: string) {
        const rider = await this.db.query(
            `SELECT name, status, current_latitude, current_longitude FROM riders WHERE id = $1 AND tenant_id = $2`,
            [riderId, tenantId]
        );
        const counts = await this.db.query(
            `SELECT
         SUM(CASE WHEN status = 'ASSIGNED' AND accepted_at IS NULL THEN 1 ELSE 0 END)::int AS assigned_pending,
         SUM(CASE WHEN status = 'ASSIGNED' AND accepted_at IS NOT NULL THEN 1 ELSE 0 END)::int AS pickup_pending,
         SUM(CASE WHEN status IN ('PICKED', 'ON_THE_WAY') THEN 1 ELSE 0 END)::int AS deliveries_pending,
         SUM(CASE WHEN status = 'DELIVERED' AND delivered_at >= CURRENT_DATE THEN 1 ELSE 0 END)::int AS delivered_today,
         SUM(CASE WHEN status = 'DELIVERED' AND delivered_at >= CURRENT_DATE THEN COALESCE(cod_collected, cod_expected, 0) ELSE 0 END)::numeric AS cod_collected_today,
         SUM(CASE WHEN status IN ('PICKED', 'ON_THE_WAY', 'ASSIGNED') AND accepted_at IS NOT NULL
           AND (
             LOWER(COALESCE(o.payment_method, '')) LIKE '%cod%'
             OR LOWER(COALESCE(o.payment_method, '')) IN ('cash', '')
           )
           THEN COALESCE(d.cod_expected, o.grand_total, 0) ELSE 0 END)::numeric AS cod_pending
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2`,
            [tenantId, riderId]
        );
        const c = counts[0] || {};
        return {
            rider: rider[0] || null,
            assigned_pending: c.assigned_pending ?? 0,
            pickup_pending: c.pickup_pending ?? 0,
            deliveries_pending: c.deliveries_pending ?? 0,
            delivered_today: c.delivered_today ?? 0,
            cod_collected_today: safeNum(c.cod_collected_today),
            cod_pending: safeNum(c.cod_pending),
        };
    }

    async getCashSummary(tenantId: string, riderId: string) {
        const rows = await this.db.query(
            `SELECT d.order_id, d.status, d.cod_expected, d.cod_collected, d.delivered_at,
              o.order_number, o.grand_total, o.payment_method
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2
         AND (
           d.status IN ('PICKED', 'ON_THE_WAY', 'ASSIGNED')
           OR (d.status = 'DELIVERED' AND d.delivered_at >= CURRENT_DATE - INTERVAL '7 days')
         )
       ORDER BY d.updated_at DESC
       LIMIT 100`,
            [tenantId, riderId]
        );

        let pending = 0;
        let collectedToday = 0;
        const items: Array<{
            order_id: string;
            order_number: string;
            status: string;
            expected: number;
            collected: number | null;
        }> = [];

        for (const r of rows as any[]) {
            const pm = String(r.payment_method || '').toLowerCase();
            const isCod = pm.includes('cod') || pm === 'cash' || pm === '';
            if (!isCod) continue;
            const expected = safeNum(r.cod_expected ?? r.grand_total);
            const collected = r.cod_collected != null ? safeNum(r.cod_collected) : null;
            if (r.status === 'DELIVERED') {
                const deliveredAt = r.delivered_at ? new Date(r.delivered_at) : null;
                if (deliveredAt && deliveredAt.toDateString() === new Date().toDateString()) {
                    collectedToday += collected ?? expected;
                }
            } else {
                pending += expected;
            }
            items.push({
                order_id: r.order_id,
                order_number: r.order_number,
                status: r.status,
                expected,
                collected,
            });
        }

        return { cod_pending: pending, cod_collected_today: collectedToday, orders: items };
    }

    /** Advance Pending → … → OutForDelivery so the shop sees the order out with the rider. */
    private async advanceMobileOrderTowardDelivery(tenantId: string, mobileOrderId: string) {
        const m = getMobileOrderService();
        let row = await this.db.query(`SELECT status FROM mobile_orders WHERE id = $1 AND tenant_id = $2`, [
            mobileOrderId,
            tenantId,
        ]);
        const status = row[0]?.status as string;
        /** Shop kitchen steps only — OutForDelivery is set on markOnTheWay */
        const chain = ['Pending', 'Confirmed', 'Packed'] as const;
        const idx = chain.findIndex((x) => x === status);
        if (idx < 0) return;

        for (let step = idx + 1; step < chain.length; step++) {
            const next = chain[step] as 'Pending' | 'Confirmed' | 'Packed' | 'OutForDelivery';
            try {
                await m.updateOrderStatus(tenantId, mobileOrderId, next, 'rider', 'rider');
            } catch (e: any) {
                const msg = String(e?.message || e);
                if (msg.includes('Cannot transition')) break;
                throw e;
            }
        }
    }
}

let riderDeliveryServiceInstance: RiderDeliveryService | null = null;
export function getRiderDeliveryService(): RiderDeliveryService {
    if (!riderDeliveryServiceInstance) riderDeliveryServiceInstance = new RiderDeliveryService();
    return riderDeliveryServiceInstance;
}
