import { getSellableQuantityForWarehouse } from './inventoryBatchService.js';
import { haversineDistanceKm } from '../utils/haversine.js';

type Demand = Map<string, number>;

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
 * Stage 3: pick fulfillment warehouse / branch; set assigned branch + Haversine distance when coords allow.
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

    const firstBranch = async (): Promise<string | null> => {
        const r = await client.query('SELECT id FROM shop_branches WHERE tenant_id = $1 ORDER BY name ASC LIMIT 1', [tenantId]);
        return r.length > 0 ? r[0].id : null;
    };

    // ─── Pickup: branch from QR or first by name; distance optional ───
    if (isPickup) {
        let bid: string | null = input.branchId || null;
        if (!bid) bid = await firstBranch();
        if (!bid) {
            return { effectiveBranchId: null, warehouseId: null, assignedBranchId: null, distanceKm: null };
        }
        const wh = await warehouseIdForBranch(client, tenantId, bid);
        if (!wh || !(await canFulfillAtWarehouse(client, tenantId, demand, wh))) {
            throw new Error(
                'Insufficient stock at this branch for pickup. Try different items or quantities.'
            );
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
        const wh = await warehouseIdForBranch(client, tenantId, bid);
        if (!wh || !(await canFulfillAtWarehouse(client, tenantId, demand, wh))) {
            throw new Error(
                'Insufficient stock for this order at the selected branch. Try another branch or different items.'
            );
        }
        const dist = await distanceKmToBranch(client, bid, custLat, custLng);
        return {
            effectiveBranchId: bid,
            warehouseId: wh,
            assignedBranchId: bid,
            distanceKm: dist,
        };
    }

    // ─── Delivery: auto-route — nearest geo branch that can fulfill ───
    if (custLat != null && custLng != null) {
        const geoRows = await client.query(
            `SELECT id, latitude, longitude FROM shop_branches
       WHERE tenant_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
            [tenantId]
        );
        const ranked = geoRows
            .map((b: any) => ({
                id: b.id as string,
                d: haversineDistanceKm(custLat!, custLng!, parseFloat(b.latitude), parseFloat(b.longitude)),
            }))
            .sort((a: { d: number }, b: { d: number }) => a.d - b.d);

        for (const row of ranked) {
            const wh = await warehouseIdForBranch(client, tenantId, row.id);
            if (!wh) continue;
            if (await canFulfillAtWarehouse(client, tenantId, demand, wh)) {
                return {
                    effectiveBranchId: row.id,
                    warehouseId: wh,
                    assignedBranchId: row.id,
                    distanceKm: row.d,
                };
            }
        }
    }

    // ─── Fallback: any branch by name order ───
    const allBranches = await client.query(
        'SELECT id FROM shop_branches WHERE tenant_id = $1 ORDER BY name ASC',
        [tenantId]
    );
    for (const b of allBranches) {
        const bid = b.id as string;
        const wh = await warehouseIdForBranch(client, tenantId, bid);
        if (!wh) continue;
        if (await canFulfillAtWarehouse(client, tenantId, demand, wh)) {
            const dist = await distanceKmToBranch(client, bid, custLat, custLng);
            return {
                effectiveBranchId: bid,
                warehouseId: wh,
                assignedBranchId: bid,
                distanceKm: dist,
            };
        }
    }

    // ─── Legacy: first warehouse that can fulfill (warehouse id = branch id in this schema) ───
    const warehouses = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 ORDER BY id', [tenantId]);
    for (const wh of warehouses) {
        const wid = wh.id as string;
        if (await canFulfillAtWarehouse(client, tenantId, demand, wid)) {
            const dist = await distanceKmToBranch(client, wid, custLat, custLng);
            return {
                effectiveBranchId: wid,
                warehouseId: wid,
                assignedBranchId: wid,
                distanceKm: dist,
            };
        }
    }

    return { effectiveBranchId: null, warehouseId: null, assignedBranchId: null, distanceKm: null };
}
