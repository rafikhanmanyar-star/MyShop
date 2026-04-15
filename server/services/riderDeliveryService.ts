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
        return ` AND d.status = 'DELIVERED' `;
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
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.distance_km AS branch_to_customer_km,
              o.payment_method, o.created_at,
              COALESCE(NULLIF(TRIM(c.name), ''), c.phone, 'Customer') AS customer_name
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
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.distance_km AS branch_to_customer_km,
              o.delivery_notes, o.payment_method, o.created_at,
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

    async markDelivered(tenantId: string, riderId: string, mobileOrderId: string) {
        const chk = await this.db.query(
            `SELECT d.status FROM delivery_orders d
       WHERE d.tenant_id = $1 AND d.rider_id = $2 AND d.order_id = $3`,
            [tenantId, riderId, mobileOrderId]
        );
        if (chk.length === 0) throw new Error('Delivery task not found');
        const st = chk[0].status;
        if (st !== 'PICKED' && st !== 'ON_THE_WAY') {
            throw new Error('Mark the order as picked before completing delivery.');
        }

        await this.db.query(
            `UPDATE delivery_orders
       SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND rider_id = $2 AND order_id = $3`,
            [tenantId, riderId, mobileOrderId]
        );

        const m = getMobileOrderService();
        await m.updateOrderStatus(tenantId, mobileOrderId, 'Delivered', 'rider', 'rider');

        await this.db.query(
            `UPDATE riders SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [riderId, tenantId]
        );

        return { ok: true };
    }

    /** Advance Pending → … → OutForDelivery so the shop sees the order out with the rider. */
    private async advanceMobileOrderTowardDelivery(tenantId: string, mobileOrderId: string) {
        const m = getMobileOrderService();
        let row = await this.db.query(`SELECT status FROM mobile_orders WHERE id = $1 AND tenant_id = $2`, [
            mobileOrderId,
            tenantId,
        ]);
        const status = row[0]?.status as string;
        const chain = ['Pending', 'Confirmed', 'Packed', 'OutForDelivery'] as const;
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
