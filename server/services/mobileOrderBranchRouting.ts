import { getSellableQuantityForWarehouse } from './inventoryBatchService.js';
import { haversineDistanceKm } from '../utils/haversine.js';

type Demand = Map<string, number>;

/** Invalidate when branch geo/radius/active flags change (shopService). */
const branchGeoCache = new Map<string, { at: number; rows: any[] }>();
const BRANCH_GEO_TTL_MS = 60_000;

export function invalidateBranchGeoCache(tenantId?: string): void {
    if (tenantId) branchGeoCache.delete(tenantId);
    else branchGeoCache.clear();
}

async function warehouseIdForBranch(client: any, tenantId: string, branchId: string): Promise<string | null> {
    const whRes = await client.query('SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2', [branchId, tenantId]);
    return whRes.length > 0 ? whRes[0].id : null;
}

async function canFulfillAtWarehouse(
    client: any,
    tenantId: string,
    demand: Demand,
    warehouseId: string
): Promise<boolean> {
    for (const [productId, qty] of demand) {
        const sellable = await getSellableQuantityForWarehouse(client, tenantId, productId, warehouseId);
        if (sellable < qty) return false;
    }
    return true;
}

async function getTenantDefaultRadiusKm(client: any, tenantId: string): Promise<number> {
    const r = await client.query(
        'SELECT max_delivery_radius_km FROM mobile_ordering_settings WHERE tenant_id = $1',
        [tenantId]
    );
    if (r.length === 0 || r[0].max_delivery_radius_km == null || String(r[0].max_delivery_radius_km).trim() === '') {
        return 15;
    }
    const v = parseFloat(r[0].max_delivery_radius_km);
    return Number.isFinite(v) && v > 0 ? v : 15;
}

function maxKmForBranch(branchRow: { max_delivery_distance_km?: unknown }, tenantDefault: number): number {
    const b = branchRow.max_delivery_distance_km;
    if (b != null && String(b).trim() !== '') {
        const v = parseFloat(String(b));
        if (Number.isFinite(v) && v > 0) return v;
    }
    return tenantDefault;
}

async function fetchActiveBranchesWithGeo(client: any, tenantId: string) {
    const hit = branchGeoCache.get(tenantId);
    if (hit && Date.now() - hit.at < BRANCH_GEO_TTL_MS) {
        return hit.rows;
    }
    const rows = await client.query(
        `SELECT id, latitude, longitude, max_delivery_distance_km
       FROM shop_branches
       WHERE tenant_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        [tenantId]
    );
    branchGeoCache.set(tenantId, { at: Date.now(), rows });
    return rows;
}

async function distanceKmToBranch(
    client: any,
    branchId: string,
    custLat: number | null,
    custLng: number | null
): Promise<number | null> {
    if (custLat == null || custLng == null) return null;
    const rows = await client.query(
        'SELECT latitude, longitude FROM shop_branches WHERE id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL',
        [branchId]
    );
    if (rows.length === 0) return null;
    const lat = parseFloat(rows[0].latitude);
    const lng = parseFloat(rows[0].longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return haversineDistanceKm(custLat, custLng, lat, lng);
}

/**
 * Pick fulfillment warehouse / branch; set assigned branch + Haversine distance when coords allow.
 * Delivery orders require customer coordinates and must fall within the assigned branch radius.
 */
export async function resolveBranchWarehouseForPlaceOrder(
    client: any,
    tenantId: string,
    input: { branchId?: string; deliveryLat?: number; deliveryLng?: number; paymentMethod?: string },
    demand: Demand
): Promise<{
    effectiveBranchId: string | null;
    warehouseId: string | null;
    assignedBranchId: string | null;
    distanceKm: number | null;
}> {
    const rawPm = (input.paymentMethod || 'COD').trim();
    const isPickup = rawPm === 'SelfCollection';
    const needsDeliveryGeo = !isPickup;

    let custLat: number | null = null;
    let custLng: number | null = null;
    if (input.deliveryLat != null && input.deliveryLng != null) {
        const la = Number(input.deliveryLat);
        const ln = Number(input.deliveryLng);
        if (Number.isFinite(la) && Number.isFinite(ln)) {
            custLat = la;
            custLng = ln;
        }
    }

    if (needsDeliveryGeo && (custLat == null || custLng == null)) {
        throw new Error(
            'Delivery location is required. Enable GPS or pick your location on the map, then try again.'
        );
    }

    const tenantDefaultKm = await getTenantDefaultRadiusKm(client, tenantId);

    const firstBranch = async (): Promise<string | null> => {
        const r = await client.query(
            `SELECT id FROM shop_branches
       WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY name ASC LIMIT 1`,
            [tenantId]
        );
        return r.length > 0 ? r[0].id : null;
    };

    // ─── Pickup: branch from QR or first by name; no delivery-radius rejection ───
    if (isPickup) {
        let bid: string | null = input.branchId || null;
        if (!bid) bid = await firstBranch();
        if (!bid) {
            return { effectiveBranchId: null, warehouseId: null, assignedBranchId: null, distanceKm: null };
        }
        const wh = await warehouseIdForBranch(client, tenantId, bid);
        if (!wh || !(await canFulfillAtWarehouse(client, tenantId, demand, wh))) {
            throw new Error('Insufficient stock at this branch for pickup. Try different items or quantities.');
        }
        const dist = await distanceKmToBranch(client, bid, custLat, custLng);
        return {
            effectiveBranchId: bid,
            warehouseId: wh,
            assignedBranchId: bid,
            distanceKm: dist,
        };
    }

    // ─── Delivery: explicit branch (e.g. QR) ───
    if (input.branchId) {
        const bid = input.branchId;
        const brows = await client.query(
            `SELECT id, latitude, longitude, max_delivery_distance_km FROM shop_branches
       WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
            [bid, tenantId]
        );
        if (brows.length === 0) {
            throw new Error('Invalid or inactive branch.');
        }
        const bRow = brows[0];
        const wh = await warehouseIdForBranch(client, tenantId, bid);
        if (!wh || !(await canFulfillAtWarehouse(client, tenantId, demand, wh))) {
            throw new Error(
                'Insufficient stock for this order at the selected branch. Try another branch or different items.'
            );
        }
        const blat = parseFloat(bRow.latitude);
        const blng = parseFloat(bRow.longitude);
        if (!Number.isFinite(blat) || !Number.isFinite(blng)) {
            throw new Error('This branch does not have coordinates configured for delivery.');
        }
        const dist = haversineDistanceKm(custLat!, custLng!, blat, blng);
        const maxKm = maxKmForBranch(bRow, tenantDefaultKm);
        if (dist > maxKm) {
            throw new Error('Delivery not available in your area');
        }
        return {
            effectiveBranchId: bid,
            warehouseId: wh,
            assignedBranchId: bid,
            distanceKm: dist,
        };
    }

    // ─── Delivery: auto-route — nearest branch that can fulfill and is within radius ───
    const geoRows = await fetchActiveBranchesWithGeo(client, tenantId);
    if (geoRows.length === 0) {
        throw new Error(
            'Delivery is not available. The shop has not configured branch locations yet. Please try again later.'
        );
    }

    const ranked = geoRows
        .map((b: any) => ({
            row: b,
            id: b.id as string,
            d: haversineDistanceKm(
                custLat!,
                custLng!,
                parseFloat(b.latitude),
                parseFloat(b.longitude)
            ),
        }))
        .sort((a: { d: number }, b: { d: number }) => a.d - b.d);

    let sawInRange = false;
    let inRangeButNoStock = false;

    for (const { row, id, d } of ranked) {
        const maxKm = maxKmForBranch(row, tenantDefaultKm);
        if (d > maxKm) continue;
        sawInRange = true;
        const wh = await warehouseIdForBranch(client, tenantId, id);
        if (!wh) continue;
        if (!(await canFulfillAtWarehouse(client, tenantId, demand, wh))) {
            inRangeButNoStock = true;
            continue;
        }
        return {
            effectiveBranchId: id,
            warehouseId: wh,
            assignedBranchId: id,
            distanceKm: d,
        };
    }

    if (inRangeButNoStock) {
        throw new Error(
            'Insufficient stock at nearby branches for this cart. Try fewer items or different products.'
        );
    }
    if (!sawInRange) {
        throw new Error('Delivery not available in your area');
    }
    throw new Error('Delivery not available in your area');
}
