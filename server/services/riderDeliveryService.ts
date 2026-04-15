import { getDatabaseService } from './databaseService.js';
import { getMobileOrderService } from './mobileOrderService.js';

function safeNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Stage 6: Rider-facing delivery task APIs (assigned delivery_orders for this rider).
 */
export class RiderDeliveryService {
    private db = getDatabaseService();

    async listForRider(tenantId: string, riderId: string) {
        const rows = await this.db.query(
            `SELECT d.id AS delivery_order_id, d.status AS delivery_status, d.assigned_at, d.accepted_at, d.picked_at, d.delivered_at,
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.payment_method, o.created_at
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1 AND d.rider_id = $2
       ORDER BY d.created_at DESC
       LIMIT 100`,
            [tenantId, riderId]
        );
        return (rows as any[]).map((r) => ({
            ...r,
            grand_total: safeNum(r.grand_total),
        }));
    }

    async getDetailForRider(tenantId: string, riderId: string, mobileOrderId: string) {
        const rows = await this.db.query(
            `SELECT d.id AS delivery_order_id, d.status AS delivery_status, d.assigned_at, d.accepted_at, d.picked_at, d.delivered_at,
              o.id AS order_id, o.order_number, o.status AS order_status, o.grand_total,
              o.delivery_address, o.delivery_lat, o.delivery_lng, o.delivery_notes, o.payment_method, o.created_at
       FROM delivery_orders d
       INNER JOIN mobile_orders o ON o.id = d.order_id AND o.tenant_id = d.tenant_id
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
            const { haversineDistanceKm } = await import('../utils/haversine.js');
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
