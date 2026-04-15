import { haversineDistanceKm } from '../utils/haversine.js';

export type DeliveryOrderStatus = 'ASSIGNED' | 'PICKED' | 'ON_THE_WAY' | 'DELIVERED';

function newDeliveryOrderId(): string {
    return `dord_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Stage 5: Auto-assign nearest AVAILABLE rider for a home-delivery mobile order.
 * Uses customer GPS when present, else assigned branch coordinates.
 * Concurrency: only one order wins per rider via UPDATE ... WHERE status = 'AVAILABLE' RETURNING.
 */
export async function tryAutoAssignRiderForMobileOrder(
    client: any,
    tenantId: string,
    mobileOrderId: string,
    opts: {
        deliveryLat?: number | null;
        deliveryLng?: number | null;
        assignedBranchId?: string | null;
    }
): Promise<{ riderId: string; riderDistanceKm: number | null; deliveryOrderId: string } | null> {
    const rows = await client.query(
        `SELECT id, current_latitude, current_longitude
     FROM riders
     WHERE tenant_id = $1 AND is_active = TRUE AND status = 'AVAILABLE'`,
        [tenantId]
    );
    if (!rows || rows.length === 0) return null;

    let refLat: number | null = null;
    let refLng: number | null = null;
    const la = opts.deliveryLat != null ? Number(opts.deliveryLat) : NaN;
    const ln = opts.deliveryLng != null ? Number(opts.deliveryLng) : NaN;
    if (Number.isFinite(la) && Number.isFinite(ln)) {
        refLat = la;
        refLng = ln;
    } else if (opts.assignedBranchId) {
        const br = await client.query(
            `SELECT latitude, longitude FROM shop_branches WHERE id = $1 AND tenant_id = $2`,
            [opts.assignedBranchId, tenantId]
        );
        if (br.length > 0) {
            const blat = parseFloat(br[0].latitude);
            const blng = parseFloat(br[0].longitude);
            if (Number.isFinite(blat) && Number.isFinite(blng)) {
                refLat = blat;
                refLng = blng;
            }
        }
    }

    type Cand = { id: string; d: number };
    const candidates: Cand[] = (rows as any[]).map((r: any) => {
        const rlat = r.current_latitude != null ? parseFloat(r.current_latitude) : NaN;
        const rlng = r.current_longitude != null ? parseFloat(r.current_longitude) : NaN;
        let d = Number.POSITIVE_INFINITY;
        if (refLat != null && refLng != null && Number.isFinite(rlat) && Number.isFinite(rlng)) {
            d = haversineDistanceKm(refLat, refLng, rlat, rlng);
        }
        return { id: r.id as string, d };
    });

    candidates.sort((a, b) => {
        if (a.d !== b.d) return a.d - b.d;
        return a.id.localeCompare(b.id);
    });

    for (const candidate of candidates) {
        const claimed = await client.query(
            `UPDATE riders
       SET status = 'BUSY', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'AVAILABLE'
       RETURNING id`,
            [candidate.id, tenantId]
        );
        if (!claimed || claimed.length === 0) continue;

        const distKm =
            refLat != null &&
            refLng != null &&
            Number.isFinite(candidate.d) &&
            candidate.d !== Number.POSITIVE_INFINITY
                ? Math.round(candidate.d * 10000) / 10000
                : null;

        const deliveryOrderId = newDeliveryOrderId();
        await client.query(
            `INSERT INTO delivery_orders (
          id, tenant_id, order_id, rider_id, status,
          assigned_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'ASSIGNED', NOW(), NOW(), NOW())`,
            [deliveryOrderId, tenantId, mobileOrderId, candidate.id]
        );

        return {
            riderId: candidate.id,
            riderDistanceKm: distKm,
            deliveryOrderId,
        };
    }

    return null;
}

/**
 * POS: assign a specific AVAILABLE rider to a home-delivery order (when auto-assign did not run or failed).
 * Same delivery_orders row + rider BUSY semantics as {@link tryAutoAssignRiderForMobileOrder}.
 */
export async function manuallyAssignRiderForMobileOrder(
    client: any,
    tenantId: string,
    mobileOrderId: string,
    riderId: string,
    opts: {
        deliveryLat?: number | null;
        deliveryLng?: number | null;
        assignedBranchId?: string | null;
    }
): Promise<{ riderId: string; riderDistanceKm: number | null; deliveryOrderId: string }> {
    const riderRows = await client.query(
        `SELECT id, current_latitude, current_longitude, status, is_active
     FROM riders WHERE id = $1 AND tenant_id = $2`,
        [riderId, tenantId]
    );
    if (!riderRows || riderRows.length === 0) {
        throw new Error('Rider not found');
    }
    const rr = riderRows[0] as any;
    const isActive = rr.is_active === true || rr.is_active === 1;
    if (!isActive) {
        throw new Error('This rider account is disabled.');
    }
    if (String(rr.status) !== 'AVAILABLE') {
        throw new Error('Rider must be Available to assign. (Busy riders already have a delivery.)');
    }

    const claimed = await client.query(
        `UPDATE riders
       SET status = 'BUSY', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'AVAILABLE'
       RETURNING id`,
        [riderId, tenantId]
    );
    if (!claimed || claimed.length === 0) {
        throw new Error('Could not assign this rider — they may have just been assigned elsewhere.');
    }

    let refLat: number | null = null;
    let refLng: number | null = null;
    const la = opts.deliveryLat != null ? Number(opts.deliveryLat) : NaN;
    const ln = opts.deliveryLng != null ? Number(opts.deliveryLng) : NaN;
    if (Number.isFinite(la) && Number.isFinite(ln)) {
        refLat = la;
        refLng = ln;
    } else if (opts.assignedBranchId) {
        const br = await client.query(
            `SELECT latitude, longitude FROM shop_branches WHERE id = $1 AND tenant_id = $2`,
            [opts.assignedBranchId, tenantId]
        );
        if (br.length > 0) {
            const blat = parseFloat(br[0].latitude);
            const blng = parseFloat(br[0].longitude);
            if (Number.isFinite(blat) && Number.isFinite(blng)) {
                refLat = blat;
                refLng = blng;
            }
        }
    }

    const rlat = rr.current_latitude != null ? parseFloat(String(rr.current_latitude)) : NaN;
    const rlng = rr.current_longitude != null ? parseFloat(String(rr.current_longitude)) : NaN;
    let distKm: number | null = null;
    if (
        refLat != null &&
        refLng != null &&
        Number.isFinite(rlat) &&
        Number.isFinite(rlng)
    ) {
        distKm = Math.round(haversineDistanceKm(refLat, refLng, rlat, rlng) * 10000) / 10000;
    }

    const deliveryOrderId = newDeliveryOrderId();
    await client.query(
        `INSERT INTO delivery_orders (
          id, tenant_id, order_id, rider_id, status,
          assigned_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'ASSIGNED', NOW(), NOW(), NOW())`,
        [deliveryOrderId, tenantId, mobileOrderId, riderId]
    );

    return {
        riderId,
        riderDistanceKm: distKm,
        deliveryOrderId,
    };
}
