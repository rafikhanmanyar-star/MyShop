/** Optional filters for executive summary — all empty string means "no filter". */

export type ExecutiveSummaryFilterInput = {
  warehouseId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  productId?: string | null;
  userId?: string | null;
  paymentMethod?: string | null;
  status?: string | null;
  search?: string | null;
};

export function strParam(v: string | null | undefined): string {
  return (typeof v === 'string' ? v : '').trim();
}

export function escapeLikeFragment(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** True when materialized daily-sales MV cannot honor filters (skip MV, use raw shop_sales). */
export function executiveSummaryNeedsRawSales(f: ExecutiveSummaryFilterInput): boolean {
  const st = strParam(f.status);
  const statusConstrained = Boolean(st) && st.toLowerCase() !== 'all';
  return Boolean(
    strParam(f.warehouseId) ||
      strParam(f.customerId) ||
      strParam(f.userId) ||
      strParam(f.paymentMethod) ||
      statusConstrained ||
      strParam(f.productId) ||
      strParam(f.categoryId) ||
      strParam(f.brandId) ||
      strParam(f.search)
  );
}

export type SaleFilterSql = { sql: string };

/** $1..$3 = tenant, range start, range end; $4 = branch. Appends $5..$13 for optional sale filters. */
export function buildSaleFilterSql(isPg: boolean): SaleFilterSql {
  if (isPg) {
    const sql = `
         AND (($5::text = '') OR (s.customer_id::text = $5::text))
         AND (($6::text = '') OR (s.user_id::text = $6::text))
         AND (($7::text = '') OR (s.payment_method::text = $7::text))
         AND (($8::text = '') OR (s.status::text = $8::text))
         AND (
           ($9::text = '' AND $10::text = '' AND $11::text = '')
           OR EXISTS (
             SELECT 1 FROM shop_sale_items si_f
             INNER JOIN shop_products p_f ON p_f.id = si_f.product_id AND p_f.tenant_id = si_f.tenant_id
             WHERE si_f.sale_id = s.id AND si_f.tenant_id = s.tenant_id
               AND (($9::text = '') OR (si_f.product_id::text = $9::text))
               AND (($10::text = '') OR (p_f.category_id::text = $10::text))
               AND (($11::text = '') OR (p_f.brand_id::text = $11::text))
           )
         )
         AND (
           ($12::text = '')
           OR EXISTS (
             SELECT 1 FROM shop_sale_items si_w
             INNER JOIN shop_inventory inv ON inv.product_id = si_w.product_id AND inv.tenant_id = si_w.tenant_id
             WHERE si_w.sale_id = s.id AND si_w.tenant_id = s.tenant_id
               AND inv.warehouse_id::text = $12::text
           )
         )
         AND (
           ($13::text = '')
           OR (s.sale_number ILIKE $13::text)
           OR (COALESCE(s.barcode_value, '')::text ILIKE $13::text)
         )`;
    return { sql };
  }
  const sql = `
         AND (($5 = '') OR (CAST(s.customer_id AS TEXT) = $5))
         AND (($6 = '') OR (CAST(s.user_id AS TEXT) = $6))
         AND (($7 = '') OR (CAST(s.payment_method AS TEXT) = $7))
         AND (($8 = '') OR (CAST(s.status AS TEXT) = $8))
         AND (
           ($9 = '' AND $10 = '' AND $11 = '')
           OR EXISTS (
             SELECT 1 FROM shop_sale_items si_f
             INNER JOIN shop_products p_f ON p_f.id = si_f.product_id AND p_f.tenant_id = si_f.tenant_id
             WHERE si_f.sale_id = s.id AND si_f.tenant_id = s.tenant_id
               AND (($9 = '') OR (CAST(si_f.product_id AS TEXT) = $9))
               AND (($10 = '') OR (CAST(p_f.category_id AS TEXT) = $10))
               AND (($11 = '') OR (CAST(p_f.brand_id AS TEXT) = $11))
           )
         )
         AND (
           ($12 = '')
           OR EXISTS (
             SELECT 1 FROM shop_sale_items si_w
             INNER JOIN shop_inventory inv ON inv.product_id = si_w.product_id AND inv.tenant_id = si_w.tenant_id
             WHERE si_w.sale_id = s.id AND si_w.tenant_id = s.tenant_id
               AND CAST(inv.warehouse_id AS TEXT) = $12
           )
         )
         AND (
           ($13 = '')
           OR (s.sale_number LIKE $13 ESCAPE '\\')
           OR (COALESCE(s.barcode_value, '') LIKE $13 ESCAPE '\\')
         )`;
    return { sql };
}

function statusTail(status: string | null | undefined): string {
  const t = strParam(status);
  if (!t || t.toLowerCase() === 'all') return '';
  return t;
}

export function buildSaleTailParams(f: ExecutiveSummaryFilterInput): string[] {
  const q = strParam(f.search);
  const searchPattern = q ? `%${escapeLikeFragment(q)}%` : '';
  return [
    strParam(f.customerId),
    strParam(f.userId),
    strParam(f.paymentMethod),
    statusTail(f.status),
    strParam(f.productId),
    strParam(f.categoryId),
    strParam(f.brandId),
    strParam(f.warehouseId),
    searchPattern,
  ];
}
