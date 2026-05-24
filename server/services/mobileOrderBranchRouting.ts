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

/** Fulfillment store for a mobile order (branch id often equals shop_warehouses.id). */
export async function getWarehouseIdForMobileOrder(
    client: any,
    tenantId: string,
    orderId: string
): Promise<string | null> {
    const reserved = await client.query(
        `SELECT warehouse_id FROM shop_inventory_movements
         WHERE tenant_id = $1 AND reference_id = $2 AND type = 'Reserve'
         LIMIT 1`,
        [tenantId, orderId]
    );
    if (reserved.length > 0 && reserved[0].warehouse_id) {
        return String(reserved[0].warehouse_id);
    }

    const rows = await client.query(
        `SELECT COALESCE(assigned_branch_id, branch_id) AS bid
     FROM mobile_orders
     WHERE id = $1 AND tenant_id = $2`,
        [orderId, tenantId]
    );
    if (rows.length === 0) return null;
    const bid = rows[0].bid;
    if (!bid) return null;
    const wh = await warehouseIdForBranch(client, tenantId, String(bid));
    if (wh) return wh;
    const whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    return whRes.length > 0 ? whRes[0].id : null;
}

async function canFulfillAtWarehouse(
    client: any,
    tenantId: string,
    demand: Demand,
    warehouseId: string
): Promise<boolean> {
    return (await getDemandShortfallsAtWarehouse(client, tenantId, demand, warehouseId)).length === 0;
}

/**
 * Pick a warehouse that can fulfill the full cart. Prefers the branch-linked warehouse, then
 * any tenant warehouse (same strategy as POS `resolveWarehouseForSaleDeduction`).
 */
async function findWarehouseThatCanFulfillDemand(
    client: any,
    tenantId: string,
    demand: Demand,
    preferredWarehouseId?: string | null
): Promise<string | null> {
    const warehouses = await client.query(
        `SELECT id FROM shop_warehouses WHERE tenant_id = $1 ORDER BY name ASC`,
        [tenantId]
    );
    const ordered: string[] = [];
    if (preferredWarehouseId) ordered.push(preferredWarehouseId);
    for (const w of warehouses as { id: string }[]) {
        if (!ordered.includes(w.id)) ordered.push(w.id);
    }
    for (const whId of ordered) {
        if (await canFulfillAtWarehouse(client, tenantId, demand, whId)) {
            return whId;
        }
    }
    return null;
}

async function getDemandShortfallsAtWarehouse(
    client: any,
    tenantId: string,
    demand: Demand,
    warehouseId: string
): Promise<Array<{ productId: string; needed: number; available: number }>> {
    const out: Array<{ productId: string; needed: number; available: number }> = [];
    for (const [productId, qty] of demand) {
        const sellable = await getSellableQuantityForWarehouse(client, tenantId, productId, warehouseId);
        if (sellable < qty) {
            out.push({
                productId,
                needed: qty,
                available: Math.max(0, sellable),
            });
        }
    }
    return out;
}

async function productNamesForIds(client: any, tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await client.query(
        `SELECT id, name FROM shop_products WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, ids]
    );
    const m = new Map<string, string>();
    for (const r of rows) {
        m.set(String(r.id), String(r.name ?? 'item'));
    }
    return m;
}

/** User-facing detail when no in-range branch can fulfill the full cart (delivery auto-route). */
async function buildInsufficientNearbyStockMessage(
    client: any,
    tenantId: string,
    demand: Demand,
    ranked: Array<{ row: any; id: string; d: number }>,
    tenantDefaultKm: number
): Promise<string> {
    let nearestWh: { warehouseId: string } | null = null;
    for (const { row, id, d } of ranked) {
        const maxKm = maxKmForBranch(row, tenantDefaultKm);
        if (d > maxKm) continue;
        const wh = await warehouseIdForBranch(client, tenantId, id);
        if (!wh) continue;
        nearestWh = { warehouseId: wh };
        break;
    }

    if (!nearestWh) {
        return (
            'Insufficient stock at nearby branches for this cart. ' +
            'A branch may be missing its warehouse link—contact the shop.'
        );
    }

    const shortfalls = await getDemandShortfallsAtWarehouse(client, tenantId, demand, nearestWh.warehouseId);
    const nameMap = await productNamesForIds(
        client,
        tenantId,
        shortfalls.map(s => s.productId)
    );

    const fmt = (n: number) => {
        const x = Math.round(n * 100) / 100;
        return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '');
    };

    const parts = shortfalls.map(s => {
        const label = nameMap.get(s.productId) || 'item';
        return `${label}: need ${fmt(s.needed)}, ~${fmt(s.available)} sellable at nearest delivering branch`;
    });

    return (
        `Insufficient stock at nearby branches for this cart (${parts.join('; ')}). ` +
        'The catalog shows stock across all locations; delivery ships from one nearby branch. ' +
        'Try fewer items or contact the shop.'
    );
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

/** Same default as DB routing when mobile_ordering_settings.max_delivery_radius_km is unset. */
export function tenantDefaultKmFromMobileSettings(maxDeliveryRadiusKm: unknown): number {
    if (maxDeliveryRadiusKm == null || String(maxDeliveryRadiusKm).trim() === '') {
        return 15;
    }
    const v = parseFloat(String(maxDeliveryRadiusKm));
    return Number.isFinite(v) && v > 0 ? v : 15;
}

/** Branch "Max delivery distance (km)" from POS, or tenant default when blank. */
export function effectiveBranchMaxDeliveryKm(branchMaxDeliveryDistanceKm: unknown, tenantDefaultKm: number): number {
    return maxKmForBranch({ max_delivery_distance_km: branchMaxDeliveryDistanceKm }, tenantDefaultKm);
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
        if (bid) {
            const activeCheck = await client.query(
                `SELECT id FROM shop_branches WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, TRUE) = TRUE`,
                [bid, tenantId]
            );
            if (activeCheck.length === 0) bid = null;
        }
        if (!bid) bid = await firstBranch();
        if (!bid) {
            return { effectiveBranchId: null, warehouseId: null, assignedBranchId: null, distanceKm: null };
        }
        const preferredWh = await warehouseIdForBranch(client, tenantId, bid);
        const wh = await findWarehouseThatCanFulfillDemand(client, tenantId, demand, preferredWh);
        if (!wh) {
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
        if (brows.length > 0) {
            const bRow = brows[0];
            const preferredWh = await warehouseIdForBranch(client, tenantId, bid);
            const wh = await findWarehouseThatCanFulfillDemand(client, tenantId, demand, preferredWh);
            if (!wh) {
                throw new Error(
                    'Insufficient stock for this order at the selected branch. Try another branch or different items.'
                );
            }
            const blat = parseFloat(bRow.latitude);
            const blng = parseFloat(bRow.longitude);
            if (Number.isFinite(blat) && Number.isFinite(blng)) {
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
            // Legacy / single-branch tenants may have stock in a non-linked warehouse and no branch GPS yet.
            const dist = await distanceKmToBranch(client, bid, custLat, custLng);
            return {
                effectiveBranchId: bid,
                warehouseId: wh,
                assignedBranchId: bid,
                distanceKm: dist,
            };
        }
        // Branch not found or inactive — fall through to auto-routing below
    }

    // ─── Delivery: auto-route — nearest branch that can fulfill and is within radius ───
    const geoRows = await fetchActiveBranchesWithGeo(client, tenantId);
    if (geoRows.length === 0) {
        const bid = input.branchId || (await firstBranch());
        const preferredWh = bid ? await warehouseIdForBranch(client, tenantId, bid) : null;
        const wh = await findWarehouseThatCanFulfillDemand(client, tenantId, demand, preferredWh);
        if (wh) {
            const dist = bid ? await distanceKmToBranch(client, bid, custLat, custLng) : null;
            return {
                effectiveBranchId: bid,
                warehouseId: wh,
                assignedBranchId: bid,
                distanceKm: dist,
            };
        }
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
        const preferredWh = await warehouseIdForBranch(client, tenantId, id);
        const wh = await findWarehouseThatCanFulfillDemand(client, tenantId, demand, preferredWh);
        if (!wh) {
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
        const bid = input.branchId || (await firstBranch());
        const preferredWh = bid ? await warehouseIdForBranch(client, tenantId, bid) : null;
        const wh = await findWarehouseThatCanFulfillDemand(client, tenantId, demand, preferredWh);
        if (wh) {
            const dist =
                ranked.length > 0 && sawInRange
                    ? ranked.find((r: { row: any; id: string; d: number }) => {
                          const maxKm = maxKmForBranch(r.row, tenantDefaultKm);
                          return r.d <= maxKm;
                      })?.d ?? null
                    : bid
                      ? await distanceKmToBranch(client, bid, custLat, custLng)
                      : null;
            return {
                effectiveBranchId: bid,
                warehouseId: wh,
                assignedBranchId: bid,
                distanceKm: dist,
            };
        }
        const detail = await buildInsufficientNearbyStockMessage(
            client,
            tenantId,
            demand,
            ranked,
            tenantDefaultKm
        );
        throw new Error(detail);
    }
    if (!sawInRange) {
        throw new Error('Delivery not available in your area');
    }
    throw new Error('Delivery not available in your area');
}
