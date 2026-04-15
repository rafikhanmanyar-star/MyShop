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
}

let riderServiceInstance: RiderService | null = null;

export function getRiderService(): RiderService {
    if (!riderServiceInstance) riderServiceInstance = new RiderService();
    return riderServiceInstance;
}
