import { getDatabaseService } from './databaseService.js';

export type RiderStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export interface RiderRow {
    id: string;
    tenant_id: string;
    name: string;
    phone_number: string;
    is_active: boolean;
    current_latitude: string | number | null;
    current_longitude: string | number | null;
    status: RiderStatus;
    created_at: Date | string;
    updated_at: Date | string;
}

/**
 * Delivery riders (Stage 4 schema). Assignment & rider app APIs build on this in later stages.
 */
export class RiderService {
    private db = getDatabaseService();

    async listByTenant(tenantId: string): Promise<RiderRow[]> {
        return this.db.query(
            `SELECT id, tenant_id, name, phone_number, is_active, current_latitude, current_longitude,
              status, created_at, updated_at
       FROM riders WHERE tenant_id = $1 ORDER BY name ASC`,
            [tenantId]
        ) as Promise<RiderRow[]>;
    }

    async getById(tenantId: string, riderId: string): Promise<RiderRow | null> {
        const rows = await this.db.query(
            `SELECT id, tenant_id, name, phone_number, is_active, current_latitude, current_longitude,
              status, created_at, updated_at
       FROM riders WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
            [riderId, tenantId]
        );
        return rows.length > 0 ? (rows[0] as RiderRow) : null;
    }

    /** Stage 7: persist GPS for nearest-rider assignment + distance in rider app. */
    async updateLocation(
        tenantId: string,
        riderId: string,
        latitude: number,
        longitude: number
    ): Promise<void> {
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new Error('Invalid latitude');
        }
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error('Invalid longitude');
        }
        const res = await this.db.query(
            `UPDATE riders
       SET current_latitude = $1, current_longitude = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING id`,
            [latitude, longitude, riderId, tenantId]
        );
        if (res.length === 0) throw new Error('Rider not found');
    }

    /**
     * Rider-controlled availability (server sets BUSY when assigning a delivery).
     * AVAILABLE: open for new assignments. OFFLINE: not on shift.
     */
    async setAvailabilityStatus(tenantId: string, riderId: string, next: 'AVAILABLE' | 'OFFLINE'): Promise<void> {
        const row = await this.getById(tenantId, riderId);
        if (!row) throw new Error('Rider not found');
        if (next === 'AVAILABLE' && row.status === 'BUSY') {
            throw new Error(
                'You have an active delivery. Complete or finish it before going available for new assignments.'
            );
        }
        await this.db.execute(
            `UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
            [next, riderId, tenantId]
        );
    }
}

let riderServiceInstance: RiderService | null = null;

export function getRiderService(): RiderService {
    if (!riderServiceInstance) riderServiceInstance = new RiderService();
    return riderServiceInstance;
}
