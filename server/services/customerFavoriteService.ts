import crypto from 'crypto';
import { getDatabaseService } from './databaseService.js';

/**
 * Persists per-customer product favorites for the mobile app.
 * All operations are scoped by tenant_id + customer_id (never trust client tenant).
 */
export class CustomerFavoriteService {
    private db = getDatabaseService();

    async addFavorite(tenantId: string, customerId: string, productId: string): Promise<void> {
        const rows = await this.db.query(
            `SELECT id FROM shop_products
             WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE AND mobile_visible = TRUE
               AND COALESCE(sales_deactivated, FALSE) = FALSE`,
            [productId, tenantId]
        );
        if (rows.length === 0) throw new Error('Product not found');

        const now = new Date().toISOString();
        await this.db.execute(
            `INSERT INTO customer_favorites (id, tenant_id, customer_id, product_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $5)
             ON CONFLICT (tenant_id, customer_id, product_id) DO UPDATE SET updated_at = $5`,
            [crypto.randomUUID(), tenantId, customerId, productId, now]
        );
    }

    async removeFavorite(tenantId: string, customerId: string, productId: string): Promise<void> {
        await this.db.execute(
            'DELETE FROM customer_favorites WHERE tenant_id = $1 AND customer_id = $2 AND product_id = $3',
            [tenantId, customerId, productId]
        );
    }

    /** All favorited product IDs for a customer (for mobile cache sync). */
    async listFavoriteProductIds(tenantId: string, customerId: string): Promise<string[]> {
        const rows = await this.db.query(
            `SELECT cf.product_id
             FROM customer_favorites cf
             INNER JOIN shop_products p ON p.id = cf.product_id AND p.tenant_id = cf.tenant_id
             WHERE cf.tenant_id = $1 AND cf.customer_id = $2
               AND p.is_active = TRUE AND p.mobile_visible = TRUE
               AND COALESCE(p.sales_deactivated, FALSE) = FALSE
             ORDER BY cf.created_at DESC`,
            [tenantId, customerId]
        );
        return rows.map((r: { product_id: string }) => String(r.product_id));
    }

    /** Batch favorite status for product cards (max 100 IDs per request). */
    async getFavoriteStatus(
        tenantId: string,
        customerId: string,
        productIds: string[]
    ): Promise<Record<string, boolean>> {
        const unique = [...new Set(productIds.map(String).filter(Boolean))].slice(0, 100);
        const status: Record<string, boolean> = {};
        for (const id of unique) status[id] = false;
        if (unique.length === 0) return status;

        const rows = await this.db.query(
            `SELECT product_id FROM customer_favorites
             WHERE tenant_id = $1 AND customer_id = $2 AND product_id = ANY($3)`,
            [tenantId, customerId, unique]
        );
        for (const r of rows) status[String(r.product_id)] = true;
        return status;
    }
}

let instance: CustomerFavoriteService | null = null;

export function getCustomerFavoriteService(): CustomerFavoriteService {
    if (!instance) instance = new CustomerFavoriteService();
    return instance;
}
