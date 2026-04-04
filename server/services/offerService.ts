import { getDatabaseService } from './databaseService.js';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export type OfferType = 'discount' | 'bundle' | 'fixed_price';
export type DiscountType = 'percentage' | 'fixed';

export interface OfferItemInput {
  product_id: string;
  quantity: number;
}

export interface CreateOfferInput {
  title: string;
  description?: string | null;
  offer_type: OfferType;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  fixed_price?: number | null;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  max_usage_per_user?: number | null;
  items: OfferItemInput[];
}

export class OfferService {
  private db = getDatabaseService();

  async listOffers(tenantId: string) {
    const rows = await this.db.query(
      `SELECT o.*,
        (SELECT COUNT(*)::int FROM offer_items oi WHERE oi.offer_id = o.id) AS item_count
       FROM offers o
       WHERE o.tenant_id = $1
       ORDER BY o.start_date DESC, o.created_at DESC`,
      [tenantId]
    );
    return rows;
  }

  async getOfferById(tenantId: string, id: string) {
    const rows = await this.db.query(
      `SELECT * FROM offers WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (rows.length === 0) return null;
    const items = await this.db.query(
      `SELECT oi.id, oi.product_id, oi.quantity, p.name AS product_name, p.sku AS product_sku
       FROM offer_items oi
       INNER JOIN shop_products p ON p.id = oi.product_id AND p.tenant_id = $2
       WHERE oi.offer_id = $1
       ORDER BY oi.id`,
      [id, tenantId]
    );
    return { ...rows[0], items };
  }

  async createOffer(tenantId: string, input: CreateOfferInput) {
    this.validateOfferPayload(input);
    const id = generateId('off');
    await this.db.transaction(async (client: any) => {
      await client.query(
        `INSERT INTO offers (
          id, tenant_id, title, description, offer_type, discount_type, discount_value, fixed_price,
          start_date, end_date, is_active, max_usage_per_user, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5::offer_type_enum,$6::offer_discount_type_enum,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
        [
          id,
          tenantId,
          input.title.trim(),
          input.description?.trim() || null,
          input.offer_type,
          input.discount_type ?? null,
          input.discount_value ?? null,
          input.fixed_price ?? null,
          input.start_date,
          input.end_date,
          input.is_active !== false,
          input.max_usage_per_user ?? null,
        ]
      );
      for (const it of input.items) {
        await client.query(
          `INSERT INTO offer_items (id, offer_id, product_id, quantity)
           VALUES ($1,$2,$3,$4)`,
          [generateId('ofi'), id, it.product_id, it.quantity]
        );
      }
    });
    return id;
  }

  async updateOffer(tenantId: string, id: string, input: Partial<CreateOfferInput>) {
    const existing = await this.db.query(`SELECT id FROM offers WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (existing.length === 0) throw new Error('Offer not found');

    const full = input.items ? ({ ...input, items: input.items } as CreateOfferInput) : null;
    if (full) this.validateOfferPayload(full);

    await this.db.transaction(async (client: any) => {
      await client.query(
        `UPDATE offers SET
          title = COALESCE($1, title),
          description = COALESCE($2, description),
          offer_type = COALESCE($3::offer_type_enum, offer_type),
          discount_type = COALESCE($4::offer_discount_type_enum, discount_type),
          discount_value = COALESCE($5, discount_value),
          fixed_price = COALESCE($6, fixed_price),
          start_date = COALESCE($7, start_date),
          end_date = COALESCE($8, end_date),
          is_active = COALESCE($9, is_active),
          max_usage_per_user = COALESCE($10, max_usage_per_user),
          updated_at = NOW()
        WHERE id = $11 AND tenant_id = $12`,
        [
          input.title?.trim() ?? null,
          input.description !== undefined ? (input.description?.trim() || null) : null,
          input.offer_type ?? null,
          input.discount_type !== undefined ? input.discount_type : null,
          input.discount_value !== undefined ? input.discount_value : null,
          input.fixed_price !== undefined ? input.fixed_price : null,
          input.start_date ?? null,
          input.end_date ?? null,
          input.is_active !== undefined ? input.is_active : null,
          input.max_usage_per_user !== undefined ? input.max_usage_per_user : null,
          id,
          tenantId,
        ]
      );
      if (input.items) {
        await client.query(`DELETE FROM offer_items WHERE offer_id = $1`, [id]);
        for (const it of input.items) {
          await client.query(
            `INSERT INTO offer_items (id, offer_id, product_id, quantity)
             VALUES ($1,$2,$3,$4)`,
            [generateId('ofi'), id, it.product_id, it.quantity]
          );
        }
      }
    });
  }

  async softDeleteOffer(tenantId: string, id: string) {
    const r = await this.db.query(
      `UPDATE offers SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );
    if (r.length === 0) throw new Error('Offer not found');
  }

  private validateOfferPayload(input: CreateOfferInput) {
    if (!input.title?.trim()) throw new Error('Title is required');
    if (!input.items || input.items.length === 0) throw new Error('Add at least one product to the offer');
    const start = new Date(input.start_date);
    const end = new Date(input.end_date);
    if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) {
      throw new Error('Invalid date range');
    }
    if (input.offer_type === 'discount') {
      if (!input.discount_type) throw new Error('Discount type is required for discount offers');
      if (input.discount_value == null || !Number.isFinite(Number(input.discount_value))) {
        throw new Error('Discount value is required');
      }
    } else {
      if (input.fixed_price == null || !Number.isFinite(Number(input.fixed_price)) || Number(input.fixed_price) < 0) {
        throw new Error('Fixed price is required for bundle / fixed-price offers');
      }
    }
    for (const it of input.items) {
      if (!it.product_id || !(Number(it.quantity) > 0)) throw new Error('Each offer line needs a product and positive quantity');
    }
  }

  /** Active offers visible on mobile (date window + flag). */
  async listActiveOffersForMobile(tenantId: string) {
    return this.db.query(
      `SELECT o.id, o.title, o.description, o.offer_type, o.discount_type, o.discount_value, o.fixed_price,
              o.start_date, o.end_date, o.max_usage_per_user
       FROM offers o
       WHERE o.tenant_id = $1
         AND o.is_active = TRUE
         AND o.start_date <= NOW()
         AND o.end_date >= NOW()
       ORDER BY o.end_date ASC, o.title ASC`,
      [tenantId]
    );
  }

  async getOfferDetailForMobile(tenantId: string, offerId: string) {
    const rows = await this.db.query(
      `SELECT o.*
       FROM offers o
       WHERE o.id = $1 AND o.tenant_id = $2
         AND o.is_active = TRUE
         AND o.start_date <= NOW()
         AND o.end_date >= NOW()`,
      [offerId, tenantId]
    );
    if (rows.length === 0) return null;
    const o = rows[0];
    const items = await this.db.query(
      `SELECT oi.product_id, oi.quantity,
              p.name, p.sku, p.image_url,
              COALESCE(p.mobile_price, p.retail_price)::float8 AS unit_price,
              p.tax_rate::float8 AS tax_rate
       FROM offer_items oi
       INNER JOIN shop_products p ON p.id = oi.product_id AND p.tenant_id = $2
       WHERE oi.offer_id = $1 AND p.is_active = TRUE AND p.mobile_visible = TRUE`,
      [offerId, tenantId]
    );
    return { ...o, items };
  }

  async getOfferStackingMode(tenantId: string): Promise<'best' | 'stack'> {
    const rows = await this.db.query(
      `SELECT offer_stacking_mode FROM mobile_ordering_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    const m = rows[0]?.offer_stacking_mode;
    return m === 'stack' ? 'stack' : 'best';
  }
}

let _svc: OfferService | null = null;
export function getOfferService() {
  if (!_svc) _svc = new OfferService();
  return _svc;
}
