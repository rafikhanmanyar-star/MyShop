import { getDatabaseService } from '../databaseService.js';
import { findCatalogEntry } from './reportCatalog.js';

export type ReportQueryParams = {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  branchId?: string | null;
  limit: number;
  offset: number;
};

export type ReportQueryResult = {
  columns: string[];
  rows: (string | number | null)[][];
  total: number;
};

function addDaysUtc(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function rangeBounds(dateFrom: string, dateTo: string): { start: string; endExclusive: string } {
  return {
    start: `${dateFrom}T00:00:00.000Z`,
    endExclusive: `${addDaysUtc(dateTo, 1)}T00:00:00.000Z`,
  };
}

function branchParam(branchId?: string | null): string | null {
  const b = branchId?.trim();
  return b || null;
}

function stub(title: string): ReportQueryResult {
  return {
    columns: ['Notice'],
    rows: [[`${title}: extend SQL in reportQueryRunner for this slug.`]],
    total: 1,
  };
}

async function countRows(db: ReturnType<typeof getDatabaseService>, sql: string, params: any[]): Promise<number> {
  const rows = await db.query(sql, params);
  return Number((rows[0] as any)?.cnt ?? 0);
}

export async function runReportDataQuery(
  category: string,
  slug: string,
  p: ReportQueryParams
): Promise<ReportQueryResult> {
  const entry = findCatalogEntry(category, slug);
  if (!entry) {
    return { columns: ['Error'], rows: [['Unknown report']], total: 0 };
  }

  const db = getDatabaseService();
  const { start, endExclusive } = rangeBounds(p.dateFrom, p.dateTo);
  const br = branchParam(p.branchId);
  const lim = Math.min(Math.max(p.limit, 1), 5000);
  const off = Math.max(p.offset, 0);
  const key = `${category}/${slug}`;

  try {
    switch (key) {
      case 'sales/daily-sales-report':
      case 'sales/sales-trend': {
        const isPg = db.getType() === 'postgres';
        const dayExpr = isPg
          ? `TO_CHAR((s.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
          : `strftime('%Y-%m-%d', s.created_at)`;
        const total = await countRows(
          db,
          `SELECT COUNT(*) AS cnt FROM (
               SELECT 1 FROM shop_sales s
               WHERE s.tenant_id = $1 AND s.status = 'Completed'
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
               GROUP BY ${dayExpr}
             ) t`,
          [p.tenantId, start, endExclusive, br]
        );
        const data = await db.query(
          `SELECT ${dayExpr} AS day,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS gross,
                  COALESCE(SUM(s.discount_total), 0) AS discounts,
                  COALESCE(SUM(s.tax_total), 0) AS tax
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY 1
           ORDER BY 1 ASC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Day', 'Orders', 'Gross', 'Discounts', 'Tax'],
          rows: data.map((r: any) => [r.day, Number(r.orders), Number(r.gross), Number(r.discounts), Number(r.tax)]),
          total,
        };
      }
      case 'sales/sales-by-product':
      case 'sales/top-selling-items':
      case 'sales/slow-moving-items': {
        const order = key.endsWith('slow-moving-items') ? 'ASC' : 'DESC';
        const total = await countRows(
          db,
          `SELECT COUNT(*) AS cnt FROM (
               SELECT p.id FROM shop_sale_items si
               JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
               JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
               WHERE si.tenant_id = $1 AND s.status = 'Completed'
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
               GROUP BY p.id, p.name, p.sku
             ) t`,
          [p.tenantId, start, endExclusive, br]
        );
        const data = await db.query(
          `SELECT p.sku, p.name,
                  COALESCE(SUM(si.quantity), 0) AS qty,
                  COALESCE(SUM(si.subtotal), 0) AS revenue
           FROM shop_sale_items si
           JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
           JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
           WHERE si.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY p.id, p.sku, p.name
           ORDER BY revenue ${order}
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'Qty', 'Revenue'],
          rows: data.map((r: any) => [r.sku, r.name, Number(r.qty), Number(r.revenue)]),
          total,
        };
      }
      case 'sales/sales-by-category': {
        const total = await countRows(
          db,
          `SELECT COUNT(*) AS cnt FROM (
               SELECT c.id FROM shop_sale_items si
               JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
               JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
               LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
               WHERE si.tenant_id = $1 AND s.status = 'Completed'
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
               GROUP BY COALESCE(c.name, 'Uncategorized')
             ) t`,
          [p.tenantId, start, endExclusive, br]
        );
        const data = await db.query(
          `SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
                  COALESCE(SUM(si.subtotal), 0) AS revenue
           FROM shop_sale_items si
           JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
           JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
           LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
           WHERE si.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY COALESCE(c.name, 'Uncategorized')
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Category', 'Revenue'],
          rows: data.map((r: any) => [r.category_name, Number(r.revenue)]),
          total,
        };
      }
      case 'sales/sales-by-brand': {
        try {
          const data = await db.query(
            `SELECT COALESCE(b.name, 'Unbranded') AS brand_name, COALESCE(SUM(si.subtotal), 0) AS revenue
             FROM shop_sale_items si
             JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
             JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
             LEFT JOIN shop_brands b ON b.id = p.brand_id AND b.tenant_id = p.tenant_id
             WHERE si.tenant_id = $1 AND s.status = 'Completed'
               AND s.created_at >= $2 AND s.created_at < $3
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             GROUP BY b.id, b.name
             ORDER BY revenue DESC
             LIMIT $5 OFFSET $6`,
            [p.tenantId, start, endExclusive, br, lim, off]
          );
          return {
            columns: ['Brand', 'Revenue'],
            rows: data.map((r: any) => [r.brand_name, Number(r.revenue)]),
            total: data.length,
          };
        } catch {
          return stub('Sales by Brand');
        }
      }
      case 'sales/sales-by-customer': {
        const data = await db.query(
          `SELECT COALESCE(ct.name, 'Walk-in') AS customer_name,
                  COUNT(DISTINCT s.id) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN contacts ct ON ct.id = s.customer_id AND ct.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY ct.name
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Customer', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.customer_name, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'sales/sales-by-branch': {
        const data = await db.query(
          `SELECT COALESCE(b.name, 'Unassigned') AS branch_name,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
           GROUP BY b.id, b.name
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, lim, off]
        );
        return {
          columns: ['Branch', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.branch_name, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'sales/sales-by-cashier': {
        const data = await db.query(
          `SELECT COALESCE(u.username, s.user_id) AS cashier,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY s.user_id, u.username
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Cashier', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.cashier, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'sales/sales-by-hour': {
        const isPg = db.getType() === 'postgres';
        const hourExpr = isPg
          ? `FLOOR(EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'UTC')))`
          : `CAST(strftime('%H', s.created_at) AS INTEGER)`;
        const data = await db.query(
          `SELECT ${hourExpr} AS hr,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY 1
           ORDER BY 1 ASC`,
          [p.tenantId, start, endExclusive, br]
        );
        return {
          columns: ['Hour (UTC)', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [Number(r.hr), Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'sales/product-mix-analysis': {
        const data = await db.query(
          `WITH cat AS (
             SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
                    COALESCE(SUM(si.subtotal), 0) AS revenue
             FROM shop_sale_items si
             JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
             JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
             LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
             WHERE si.tenant_id = $1 AND s.status = 'Completed'
               AND s.created_at >= $2 AND s.created_at < $3
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             GROUP BY COALESCE(c.name, 'Uncategorized')
           ), tot AS (SELECT SUM(revenue) AS t FROM cat)
           SELECT category_name, revenue,
                  CASE WHEN tot.t > 0 THEN ROUND(100.0 * revenue / tot.t, 2) ELSE 0 END AS pct
           FROM cat, tot
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Category', 'Revenue', 'Mix %'],
          rows: data.map((r: any) => [r.category_name, Number(r.revenue), Number(r.pct)]),
          total: data.length,
        };
      }
      case 'sales/discount-analysis': {
        const isPg = db.getType() === 'postgres';
        const dayExpr = isPg
          ? `TO_CHAR((s.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
          : `strftime('%Y-%m-%d', s.created_at)`;
        const data = await db.query(
          `SELECT ${dayExpr} AS day,
                  s.payment_method,
                  COALESCE(SUM(s.discount_total), 0) AS discounts,
                  COUNT(*) AS orders
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             AND s.discount_total > 0
           GROUP BY 1, s.payment_method
           ORDER BY 1 ASC, discounts DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Day', 'Payment', 'Discounts', 'Orders'],
          rows: data.map((r: any) => [r.day, r.payment_method, Number(r.discounts), Number(r.orders)]),
          total: data.length,
        };
      }
      case 'sales/refund-analysis': {
        const data = await db.query(
          `SELECT sr.return_number, CAST(sr.return_date AS TEXT) AS return_date, sr.total_return_amount, sr.refund_method
           FROM shop_sales_returns sr
           WHERE sr.tenant_id = $1
             AND sr.return_date >= $2 AND sr.return_date < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR sr.branch_id = CAST($4 AS TEXT))
           ORDER BY sr.return_date DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No sales returns in range or table missing.']], total: 0 };
        }
        return {
          columns: ['Return #', 'Date', 'Amount', 'Method'],
          rows: data.map((r: any) => [r.return_number, String(r.return_date), Number(r.total_return_amount), r.refund_method]),
          total: data.length,
        };
      }
      case 'sales/tax-summary': {
        const data = await db.query(
          `SELECT COALESCE(SUM(s.tax_total), 0) AS tax_total,
                  COALESCE(SUM(s.grand_total), 0) AS gross,
                  COUNT(*) AS orders
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))`,
          [p.tenantId, start, endExclusive, br]
        );
        const r = data[0] as any;
        return {
          columns: ['Tax total', 'Gross sales', 'Orders'],
          rows: [[Number(r.tax_total), Number(r.gross), Number(r.orders)]],
          total: 1,
        };
      }
      case 'sales/payment-method-summary': {
        const data = await db.query(
          `SELECT s.payment_method,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY s.payment_method
           ORDER BY revenue DESC`,
          [p.tenantId, start, endExclusive, br]
        );
        return {
          columns: ['Payment', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.payment_method, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'inventory/low-stock': {
        const data = await db.query(
          `SELECT p.sku, p.name, w.name AS warehouse,
                  inv.quantity_on_hand AS on_hand,
                  p.reorder_point
           FROM shop_inventory inv
           JOIN shop_products p ON p.id = inv.product_id AND p.tenant_id = inv.tenant_id
           JOIN shop_warehouses w ON w.id = inv.warehouse_id AND w.tenant_id = inv.tenant_id
           WHERE inv.tenant_id = $1
             AND inv.quantity_on_hand < p.reorder_point
           ORDER BY (p.reorder_point - inv.quantity_on_hand) DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'Warehouse', 'On hand', 'Reorder'],
          rows: data.map((r: any) => [r.sku, r.name, r.warehouse, Number(r.on_hand), Number(r.reorder_point)]),
          total: data.length,
        };
      }
      case 'inventory/negative-stock': {
        const data = await db.query(
          `SELECT p.sku, p.name, w.name AS warehouse, inv.quantity_on_hand
           FROM shop_inventory inv
           JOIN shop_products p ON p.id = inv.product_id AND p.tenant_id = inv.tenant_id
           JOIN shop_warehouses w ON w.id = inv.warehouse_id AND w.tenant_id = inv.tenant_id
           WHERE inv.tenant_id = $1 AND inv.quantity_on_hand < 0
           ORDER BY inv.quantity_on_hand ASC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'Warehouse', 'Qty'],
          rows: data.map((r: any) => [r.sku, r.name, r.warehouse, Number(r.quantity_on_hand)]),
          total: data.length,
        };
      }
      case 'inventory/inventory-valuation': {
        const data = await db.query(
          `SELECT p.sku, p.name, w.name AS warehouse,
                  inv.quantity_on_hand AS qty,
                  p.cost_price,
                  (inv.quantity_on_hand * p.cost_price) AS value
           FROM shop_inventory inv
           JOIN shop_products p ON p.id = inv.product_id AND p.tenant_id = inv.tenant_id
           JOIN shop_warehouses w ON w.id = inv.warehouse_id AND w.tenant_id = inv.tenant_id
           WHERE inv.tenant_id = $1
           ORDER BY value DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'Warehouse', 'Qty', 'Unit cost', 'Value'],
          rows: data.map((r: any) => [r.sku, r.name, r.warehouse, Number(r.qty), Number(r.cost_price), Number(r.value)]),
          total: data.length,
        };
      }
      case 'inventory/stock-ledger': {
        const data = await db.query(
          `SELECT CAST(m.created_at AS TEXT) AS at, m.type, p.sku, m.quantity, m.reason
           FROM shop_inventory_movements m
           JOIN shop_products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
           WHERE m.tenant_id = $1
             AND m.created_at >= $2 AND m.created_at < $3
           ORDER BY m.created_at DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        );
        return {
          columns: ['At', 'Type', 'SKU', 'Qty', 'Reason'],
          rows: data.map((r: any) => [String(r.at), r.type, r.sku, Number(r.quantity), r.reason ?? '']),
          total: data.length,
        };
      }
      case 'financial/expense-analysis': {
        const data = await db.query(
          `SELECT CAST(e.expense_date AS TEXT) AS d, ec.name AS category, e.amount, e.payment_method, e.status
           FROM expenses e
           JOIN expense_categories ec ON ec.id = e.category_id AND ec.tenant_id = e.tenant_id
           WHERE e.tenant_id = $1
             AND e.expense_date >= $2 AND e.expense_date <= $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR e.branch_id = CAST($4 AS TEXT))
           ORDER BY e.expense_date DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, p.dateFrom, p.dateTo, br, lim, off]
        );
        return {
          columns: ['Date', 'Category', 'Amount', 'Pay method', 'Status'],
          rows: data.map((r: any) => [String(r.d), r.category, Number(r.amount), r.payment_method, r.status]),
          total: data.length,
        };
      }
      case 'multi_branch/branch-comparison':
      case 'multi_branch/consolidated-sales': {
        const data = await db.query(
          `SELECT COALESCE(b.name, 'Unassigned') AS branch_name,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
           GROUP BY b.id, b.name
           ORDER BY revenue DESC`,
          [p.tenantId, start, endExclusive]
        );
        return {
          columns: ['Branch', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.branch_name, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'cash_shift/cashier-performance': {
        const sqlSqlite = `SELECT COALESCE(u.username, s.user_id) AS cashier,
                      SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END) AS voids,
                      SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END) AS completed,
                      COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.grand_total ELSE 0 END), 0) AS revenue
               FROM shop_sales s
               LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
               WHERE s.tenant_id = $1
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
               GROUP BY s.user_id, u.username
               ORDER BY revenue DESC
               LIMIT $5 OFFSET $6`;
        const sqlPg = `SELECT COALESCE(u.username, s.user_id) AS cashier,
                  COUNT(*) FILTER (WHERE s.status = 'Void') AS voids,
                  COUNT(*) FILTER (WHERE s.status = 'Completed') AS completed,
                  COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.grand_total ELSE 0 END), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY s.user_id, u.username
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`;
        const data = await db.query(db.getType() === 'sqlite' ? sqlSqlite : sqlPg, [
          p.tenantId,
          start,
          endExclusive,
          br,
          lim,
          off,
        ]);
        return {
          columns: ['Cashier', 'Voids', 'Completed', 'Revenue'],
          rows: data.map((r: any) => [r.cashier, Number(r.voids), Number(r.completed), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'multi_branch/consolidated-p-l': {
        const data = await db.query(
          `SELECT COALESCE(b.name, 'Unassigned') AS branch_name,
                  COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.grand_total - s.discount_total ELSE 0 END), 0) AS net_sales,
                  COALESCE(SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END), 0) AS void_count
           FROM shop_sales s
           LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1
             AND s.created_at >= $2 AND s.created_at < $3
           GROUP BY b.id, b.name
           ORDER BY net_sales DESC`,
          [p.tenantId, start, endExclusive]
        );
        return {
          columns: ['Branch', 'Net sales (proxy)', 'Void count'],
          rows: data.map((r: any) => [r.branch_name, Number(r.net_sales), Number(r.void_count)]),
          total: data.length,
        };
      }
      case 'audit/void-transactions': {
        const data = await db.query(
          `SELECT s.sale_number, CAST(s.created_at AS TEXT) AS created_at, s.grand_total, COALESCE(u.username, s.user_id) AS cashier
           FROM shop_sales s
           LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Void'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           ORDER BY s.created_at DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Sale #', 'Created', 'Amount', 'Cashier'],
          rows: data.map((r: any) => [r.sale_number, r.created_at, Number(r.grand_total), r.cashier]),
          total: data.length,
        };
      }
      case 'audit/cancelled-invoices': {
        const data = await db.query(
          `SELECT s.sale_number, s.status, CAST(s.created_at AS TEXT) AS created_at, s.grand_total
           FROM shop_sales s
           WHERE s.tenant_id = $1
             AND s.status IN ('Void', 'Refunded')
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           ORDER BY s.created_at DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Sale #', 'Status', 'Created', 'Amount'],
          rows: data.map((r: any) => [r.sale_number, r.status, r.created_at, Number(r.grand_total)]),
          total: data.length,
        };
      }
      case 'audit/discount-audit': {
        const data = await db.query(
          `SELECT s.sale_number, CAST(s.created_at AS TEXT) AS created_at, s.discount_total, s.grand_total, s.payment_method
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.discount_total > 0
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           ORDER BY s.discount_total DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Sale #', 'Created', 'Discount', 'Grand total', 'Payment'],
          rows: data.map((r: any) => [r.sale_number, r.created_at, Number(r.discount_total), Number(r.grand_total), r.payment_method]),
          total: data.length,
        };
      }
      case 'audit/price-override-audit': {
        const data = await db.query(
          `SELECT s.sale_number, p.sku, si.unit_price, p.retail_price,
                  (si.unit_price - p.retail_price) AS delta
           FROM shop_sale_items si
           JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
           JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
           WHERE si.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             AND ABS(si.unit_price - p.retail_price) > 0.01
           ORDER BY ABS(si.unit_price - p.retail_price) DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Sale #', 'SKU', 'Sold at', 'Retail', 'Delta'],
          rows: data.map((r: any) => [r.sale_number, r.sku, Number(r.unit_price), Number(r.retail_price), Number(r.delta)]),
          total: data.length,
        };
      }
      case 'audit/login-activity':
      case 'audit/failed-transactions': {
        const onlyErrors = key === 'audit/failed-transactions';
        try {
          const data = await db.query(
            `SELECT CAST(created_at AS TEXT) AS at, module,
                    LEFT(COALESCE(error, ''), 200) AS message
             FROM system_logs
             WHERE tenant_id = $1
               AND created_at >= $2 AND created_at < $3
               ${onlyErrors ? 'AND error IS NOT NULL AND trim(error) <> \'\'' : ''}
             ORDER BY created_at DESC
             LIMIT $4 OFFSET $5`,
            onlyErrors ? [p.tenantId, start, endExclusive, lim, off] : [p.tenantId, start, endExclusive, lim, off]
          );
          return {
            columns: ['At', 'Module', 'Message'],
            rows: data.map((r: any) => [r.at, r.module, r.message]),
            total: data.length,
          };
        } catch {
          return { columns: ['Notice'], rows: [['system_logs not available on this database build.']], total: 1 };
        }
      }
      case 'audit/suspicious-activity-detection': {
        const data = await db.query(
          `SELECT COALESCE(u.username, s.user_id) AS cashier,
                  SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END) AS voids,
                  SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END) AS completed
           FROM shop_sales s
           LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY s.user_id, u.username
           HAVING SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) > 0.05
           ORDER BY voids DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        ).catch(() => []);
        return {
          columns: ['Cashier', 'Voids', 'Completed', 'Note'],
          rows: data.map((r: any) => [
            r.cashier,
            Number(r.voids),
            Number(r.completed),
            'Flagged when void rate > 5% of all tickets in window.',
          ]),
          total: data.length,
        };
      }
      case 'audit/role-permission-audit': {
        const data = await db.query(
          `SELECT r.name AS role_name,
                  p.name AS permission_name
           FROM roles r
           JOIN role_permissions rp ON rp.role_id = r.id
           JOIN permissions p ON p.id = rp.permission_id
           ORDER BY r.name, p.name`,
          []
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No role/permission matrix (roles tables missing).']], total: 1 };
        }
        return {
          columns: ['Role', 'Permission'],
          rows: data.map((r: any) => [r.role_name, r.permission_name]),
          total: data.length,
        };
      }
      case 'audit/deleted-records': {
        const data = await db.query(
          `SELECT name, CAST(deleted_at AS TEXT) AS deleted_at
           FROM categories
           WHERE tenant_id = $1 AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        return {
          columns: ['Category', 'Deleted at'],
          rows: data.map((r: any) => [r.name, String(r.deleted_at)]),
          total: data.length,
        };
      }
      case 'financial/profit-loss': {
        const data = await db.query(
          `SELECT COALESCE(a.type, 'Unknown') AS account_type,
                  COALESCE(SUM(le.debit), 0) AS debit,
                  COALESCE(SUM(le.credit), 0) AS credit
           FROM ledger_entries le
           JOIN journal_entries je ON je.id = le.journal_entry_id AND je.tenant_id = le.tenant_id
           JOIN accounts a ON a.id = le.account_id AND a.tenant_id = le.tenant_id
           WHERE le.tenant_id = $1
             AND je.date >= $2 AND je.date < $3
           GROUP BY a.type
           ORDER BY a.type`,
          [p.tenantId, start, endExclusive]
        ).catch(() => []);
        if (!data.length) {
          return {
            columns: ['Notice'],
            rows: [['No ledger activity in this period (post journals to see P&L by account type).']],
            total: 1,
          };
        }
        return {
          columns: ['Account type', 'Debit', 'Credit'],
          rows: data.map((r: any) => [r.account_type, Number(r.debit), Number(r.credit)]),
          total: data.length,
        };
      }
      case 'financial/balance-sheet': {
        const data = await db.query(
          `SELECT COALESCE(type, 'Unknown') AS account_type,
                  CAST(COUNT(*) AS INTEGER) AS accounts,
                  COALESCE(SUM(balance), 0) AS balance_sum
           FROM accounts
           WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
           GROUP BY type
           ORDER BY type`,
          [p.tenantId]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No accounts for tenant.']], total: 1 };
        }
        return {
          columns: ['Account type', 'Accounts', 'Balance sum'],
          rows: data.map((r: any) => [r.account_type, Number(r.accounts), Number(r.balance_sum)]),
          total: data.length,
        };
      }
      case 'financial/cash-flow': {
        const cashInSql = `SELECT COALESCE(SUM(grand_total), 0) AS v FROM shop_sales
          WHERE tenant_id = $1 AND status = 'Completed' AND created_at >= $2 AND created_at < $3
            AND LOWER(COALESCE(payment_method, '')) IN ('cash', 'cod')
            AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`;
        const cashOutSql = `SELECT COALESCE(SUM(amount), 0) AS v FROM expenses
          WHERE tenant_id = $1 AND expense_date >= $5 AND expense_date <= $6
            AND payment_method = 'Cash'
            AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`;
        const cashParams = [p.tenantId, start, endExclusive, br, p.dateFrom, p.dateTo];
        const [cinRows, coutRows] = await Promise.all([
          db.query(cashInSql, cashParams),
          db.query(cashOutSql, cashParams),
        ]);
        const cashIn = Number((cinRows[0] as any)?.v ?? 0);
        const cashOut = Number((coutRows[0] as any)?.v ?? 0);
        const card = await db
          .query(
            `SELECT COALESCE(SUM(grand_total), 0) AS v FROM shop_sales
             WHERE tenant_id = $1 AND status = 'Completed' AND created_at >= $2 AND created_at < $3
               AND LOWER(COALESCE(payment_method, '')) IN ('card', 'credit card', 'debit')
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`,
            [p.tenantId, start, endExclusive, br]
          )
          .catch(() => [{ v: 0 }]);
        const cardIn = Number((card[0] as any)?.v ?? 0);
        return {
          columns: ['Bucket', 'Amount', 'Note'],
          rows: [
            ['Operating — cash & COD sales (proxy)', cashIn, 'Completed POS tickets in range.'],
            ['Operating — cash expenses', -cashOut, 'Expense lines paid in cash.'],
            ['Non-cash card sales (reference)', cardIn, 'Not cash; shown for tender context.'],
            ['Net operating (proxy)', cashIn - cashOut, 'Cash in minus cash expenses.'],
          ],
          total: 4,
        };
      }
      case 'financial/trial-balance': {
        const data = await db.query(
          `SELECT a.code, a.name, a.type,
                  COALESCE(SUM(le.debit), 0) AS debit,
                  COALESCE(SUM(le.credit), 0) AS credit
           FROM ledger_entries le
           JOIN journal_entries je ON je.id = le.journal_entry_id AND je.tenant_id = le.tenant_id
           JOIN accounts a ON a.id = le.account_id AND a.tenant_id = le.tenant_id
           WHERE le.tenant_id = $1
             AND je.date >= $2 AND je.date < $3
           GROUP BY a.id, a.code, a.name, a.type
           HAVING COALESCE(SUM(le.debit), 0) <> 0 OR COALESCE(SUM(le.credit), 0) <> 0
           ORDER BY CASE WHEN a.code IS NULL OR trim(COALESCE(a.code, '')) = '' THEN 1 ELSE 0 END, a.name
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No ledger lines in this period.']], total: 1 };
        }
        return {
          columns: ['Code', 'Account', 'Type', 'Debit', 'Credit'],
          rows: data.map((r: any) => [r.code ?? '', r.name, r.type, Number(r.debit), Number(r.credit)]),
          total: data.length,
        };
      }
      case 'financial/income-summary': {
        const data = await db.query(
          `SELECT COUNT(*) AS orders,
                  COALESCE(SUM(grand_total), 0) AS gross,
                  COALESCE(SUM(discount_total), 0) AS discounts,
                  COALESCE(SUM(tax_total), 0) AS tax,
                  COALESCE(SUM(grand_total - discount_total), 0) AS net_proxy
           FROM shop_sales
           WHERE tenant_id = $1 AND status = 'Completed'
             AND created_at >= $2 AND created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`,
          [p.tenantId, start, endExclusive, br]
        );
        const r = data[0] as any;
        return {
          columns: ['Orders', 'Gross', 'Discounts', 'Tax', 'Net (gross − discount)'],
          rows: [[Number(r.orders), Number(r.gross), Number(r.discounts), Number(r.tax), Number(r.net_proxy)]],
          total: 1,
        };
      }
      case 'financial/tax-report': {
        const sales = await db.query(
          `SELECT COALESCE(SUM(tax_total), 0) AS output_tax
           FROM shop_sales
           WHERE tenant_id = $1 AND status = 'Completed'
             AND created_at >= $2 AND created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`,
          [p.tenantId, start, endExclusive, br]
        );
        const exp = await db
          .query(
            `SELECT COALESCE(SUM(tax_amount), 0) AS input_tax
             FROM expenses
             WHERE tenant_id = $1 AND expense_date >= $5 AND expense_date <= $6
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))`,
            [p.tenantId, start, endExclusive, br, p.dateFrom, p.dateTo]
          )
          .catch(() => [{ input_tax: 0 }]);
        const o = Number((sales[0] as any)?.output_tax ?? 0);
        const i = Number((exp[0] as any)?.input_tax ?? 0);
        return {
          columns: ['Output tax (POS)', 'Input tax (expenses)', 'Net tax position'],
          rows: [[o, i, o - i]],
          total: 1,
        };
      }
      case 'financial/accounts-receivable-aging': {
        const data = await db.query(
          `SELECT COALESCE(c.name, 'Customer') AS customer,
                  SUM(CASE WHEN kl.type = 'debit' THEN kl.amount ELSE -kl.amount END) AS balance,
                  MIN(CASE WHEN kl.type = 'debit' THEN kl.created_at END) AS oldest_debit
           FROM khata_ledger kl
           JOIN contacts c ON c.id = kl.customer_id AND c.tenant_id = kl.tenant_id
           WHERE kl.tenant_id = $1
           GROUP BY c.id, c.name
           HAVING SUM(CASE WHEN kl.type = 'debit' THEN kl.amount ELSE -kl.amount END) > 0.01
           ORDER BY balance DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No open khata balances or khata_ledger missing.']], total: 1 };
        }
        return {
          columns: ['Customer', 'Open balance', 'Oldest debit'],
          rows: data.map((r: any) => [r.customer, Number(r.balance), String(r.oldest_debit ?? '')]),
          total: data.length,
        };
      }
      case 'financial/accounts-payable-aging': {
        const data = await db.query(
          `SELECT v.name AS vendor,
                  pb.bill_number,
                  pb.balance_due,
                  CAST(pb.due_date AS TEXT) AS due_date,
                  CAST(pb.bill_date AS TEXT) AS bill_date
           FROM purchase_bills pb
           JOIN shop_vendors v ON v.id = pb.supplier_id AND v.tenant_id = pb.tenant_id
           WHERE pb.tenant_id = $1 AND pb.balance_due > 0.01
             AND pb.bill_date >= $2 AND pb.bill_date < $3
           ORDER BY CASE WHEN pb.due_date IS NULL THEN 1 ELSE 0 END, pb.due_date, pb.balance_due DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No open payables in range or procurement tables missing.']], total: 1 };
        }
        return {
          columns: ['Vendor', 'Bill #', 'Balance due', 'Due date', 'Bill date'],
          rows: data.map((r: any) => [
            r.vendor,
            r.bill_number,
            Number(r.balance_due),
            String(r.due_date ?? ''),
            String(r.bill_date ?? ''),
          ]),
          total: data.length,
        };
      }
      case 'financial/cost-of-goods-sold': {
        const data = await db.query(
          `SELECT p.sku,
                  COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_at_sale, p.average_cost, p.cost_price, 0)), 0) AS cogs
           FROM shop_sale_items si
           JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
           JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
           WHERE si.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY p.id, p.sku
           HAVING COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_at_sale, p.average_cost, p.cost_price, 0)), 0) > 0
           ORDER BY cogs DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        ).catch(() => []);
        return {
          columns: ['SKU', 'COGS (est.)'],
          rows: data.map((r: any) => [r.sku, Number(r.cogs)]),
          total: data.length,
        };
      }
      case 'financial/ledger-reports': {
        const data = await db.query(
          `SELECT CAST(je.date AS TEXT) AS posted,
                  je.reference,
                  a.name AS account,
                  le.debit,
                  le.credit
           FROM ledger_entries le
           JOIN journal_entries je ON je.id = le.journal_entry_id AND je.tenant_id = le.tenant_id
           JOIN accounts a ON a.id = le.account_id AND a.tenant_id = le.tenant_id
           WHERE le.tenant_id = $1
             AND je.date >= $2 AND je.date < $3
           ORDER BY je.date DESC, je.reference
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No ledger lines in this period.']], total: 1 };
        }
        return {
          columns: ['Posted', 'Reference', 'Account', 'Debit', 'Credit'],
          rows: data.map((r: any) => [
            String(r.posted),
            r.reference,
            r.account,
            Number(r.debit),
            Number(r.credit),
          ]),
          total: data.length,
        };
      }
      case 'financial/journal-reports': {
        const data = await db.query(
          `SELECT CAST(je.date AS TEXT) AS posted,
                  je.reference,
                  je.description,
                  je.status,
                  (SELECT COUNT(*) FROM ledger_entries le WHERE le.journal_entry_id = je.id) AS lines
           FROM journal_entries je
           WHERE je.tenant_id = $1
             AND je.date >= $2 AND je.date < $3
           ORDER BY je.date DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No journal entries in this period.']], total: 1 };
        }
        return {
          columns: ['Posted', 'Reference', 'Description', 'Status', 'Lines'],
          rows: data.map((r: any) => [
            String(r.posted),
            r.reference,
            r.description ?? '',
            r.status,
            Number(r.lines),
          ]),
          total: data.length,
        };
      }
      case 'customers/customer-ledger': {
        const data = await db.query(
          `SELECT CAST(kl.created_at AS TEXT) AS at,
                  COALESCE(c.name, 'Customer') AS customer,
                  kl.type,
                  kl.amount,
                  COALESCE(kl.note, '') AS note
           FROM khata_ledger kl
           JOIN contacts c ON c.id = kl.customer_id AND c.tenant_id = kl.tenant_id
           WHERE kl.tenant_id = $1
             AND kl.created_at >= $2 AND kl.created_at < $3
           ORDER BY kl.created_at DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No khata lines in range.']], total: 1 };
        }
        return {
          columns: ['At', 'Customer', 'Type', 'Amount', 'Note'],
          rows: data.map((r: any) => [String(r.at), r.customer, r.type, Number(r.amount), r.note]),
          total: data.length,
        };
      }
      case 'customers/customer-purchase-history': {
        const data = await db.query(
          `SELECT s.sale_number,
                  CAST(s.created_at AS TEXT) AS at,
                  COALESCE(c.name, 'Walk-in') AS customer,
                  s.grand_total,
                  s.payment_method
           FROM shop_sales s
           LEFT JOIN contacts c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           ORDER BY s.created_at DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Sale #', 'At', 'Customer', 'Total', 'Payment'],
          rows: data.map((r: any) => [r.sale_number, String(r.at), r.customer, Number(r.grand_total), r.payment_method]),
          total: data.length,
        };
      }
      case 'customers/top-customers': {
        const data = await db.query(
          `SELECT COALESCE(c.name, 'Walk-in') AS customer,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN contacts c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY c.id, c.name
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Customer', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.customer, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'customers/customer-retention': {
        const data = await db.query(
          `WITH per AS (
             SELECT s.customer_id, COUNT(*) AS orders
             FROM shop_sales s
             WHERE s.tenant_id = $1 AND s.status = 'Completed'
               AND s.customer_id IS NOT NULL
               AND s.created_at >= $2 AND s.created_at < $3
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             GROUP BY s.customer_id
           )
           SELECT CASE WHEN orders >= 2 THEN 'Repeat (2+ orders)' ELSE 'Single purchase' END AS bucket,
                  COUNT(*) AS customers
           FROM per
           GROUP BY 1`,
          [p.tenantId, start, endExclusive, br]
        );
        return {
          columns: ['Bucket', 'Customers'],
          rows: data.map((r: any) => [r.bucket, Number(r.customers)]),
          total: data.length,
        };
      }
      case 'customers/customer-lifetime-value': {
        const data = await db.query(
          `SELECT COALESCE(c.name, 'Walk-in') AS customer,
                  COALESCE(SUM(s.grand_total), 0) AS revenue,
                  COUNT(*) AS orders
           FROM shop_sales s
           LEFT JOIN contacts c ON c.id = s.customer_id AND c.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY c.id, c.name
           ORDER BY revenue DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['Customer', 'Revenue (window)', 'Orders'],
          rows: data.map((r: any) => [r.customer, Number(r.revenue), Number(r.orders)]),
          total: data.length,
        };
      }
      case 'customers/customer-aging': {
        const data = await db.query(
          `SELECT COALESCE(c.name, 'Customer') AS customer,
                  SUM(CASE WHEN kl.type = 'debit' THEN kl.amount ELSE -kl.amount END) AS open_balance,
                  MAX(kl.created_at) AS last_activity
           FROM khata_ledger kl
           JOIN contacts c ON c.id = kl.customer_id AND c.tenant_id = kl.tenant_id
           WHERE kl.tenant_id = $1
           GROUP BY c.id, c.name
           HAVING SUM(CASE WHEN kl.type = 'debit' THEN kl.amount ELSE -kl.amount END) > 0.01
           ORDER BY open_balance DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No open balances or khata not in use.']], total: 1 };
        }
        return {
          columns: ['Customer', 'Open balance', 'Last activity'],
          rows: data.map((r: any) => [r.customer, Number(r.open_balance), String(r.last_activity)]),
          total: data.length,
        };
      }
      case 'customers/loyalty-reports': {
        const data = await db.query(
          `SELECT COALESCE(SUM(s.points_earned), 0) AS earned,
                  COALESCE(SUM(s.points_redeemed), 0) AS redeemed,
                  COUNT(*) AS orders
           FROM shop_sales s
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))`,
          [p.tenantId, start, endExclusive, br]
        ).catch(() => [{ earned: 0, redeemed: 0, orders: 0 }]);
        const r = data[0] as any;
        const mem = await db
          .query(
            `SELECT COUNT(*) AS n, COALESCE(SUM(points_balance), 0) AS pts
             FROM shop_loyalty_members WHERE tenant_id = $1`,
            [p.tenantId]
          )
          .catch(() => [{ n: 0, pts: 0 }]);
        const m = mem[0] as any;
        return {
          columns: ['Points earned (sales)', 'Points redeemed', 'Completed orders', 'Members', 'Points on hand'],
          rows: [[Number(r.earned), Number(r.redeemed), Number(r.orders), Number(m.n), Number(m.pts)]],
          total: 1,
        };
      }
      case 'customers/repeat-purchase-analysis': {
        const data = await db.query(
          `SELECT ROUND(AVG(cnt), 2) AS avg_orders_repeat_customers
           FROM (
             SELECT customer_id, COUNT(*) AS cnt
             FROM shop_sales
             WHERE tenant_id = $1 AND status = 'Completed' AND customer_id IS NOT NULL
               AND created_at >= $2 AND created_at < $3
               AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))
             GROUP BY customer_id
             HAVING COUNT(*) >= 2
           ) t`,
          [p.tenantId, start, endExclusive, br]
        );
        const v = Number((data[0] as any)?.avg_orders_repeat_customers ?? 0);
        return {
          columns: ['Avg orders (repeat customers only)', 'Note'],
          rows: [
            [
              v,
              'Customers with 2+ completed tickets in range; simple velocity proxy (not inter-purchase days).',
            ],
          ],
          total: 1,
        };
      }
      case 'suppliers/supplier-ledger': {
        const data = await db.query(
          `SELECT v.name AS vendor,
                  COALESCE(SUM(pb.total_amount), 0) AS billed,
                  COALESCE(SUM(pb.paid_amount), 0) AS paid,
                  COALESCE(SUM(pb.balance_due), 0) AS open_balance
           FROM purchase_bills pb
           JOIN shop_vendors v ON v.id = pb.supplier_id AND v.tenant_id = pb.tenant_id
           WHERE pb.tenant_id = $1
           GROUP BY v.id, v.name
           ORDER BY open_balance DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No purchase bills or vendors.']], total: 1 };
        }
        return {
          columns: ['Vendor', 'Billed (all time)', 'Paid', 'Open'],
          rows: data.map((r: any) => [r.vendor, Number(r.billed), Number(r.paid), Number(r.open_balance)]),
          total: data.length,
        };
      }
      case 'suppliers/supplier-purchases': {
        const data = await db.query(
          `SELECT pb.bill_number,
                  v.name AS vendor,
                  CAST(pb.bill_date AS TEXT) AS bill_date,
                  pb.total_amount,
                  pb.status
           FROM purchase_bills pb
           JOIN shop_vendors v ON v.id = pb.supplier_id AND v.tenant_id = pb.tenant_id
           WHERE pb.tenant_id = $1
             AND pb.bill_date >= $2 AND pb.bill_date < $3
           ORDER BY pb.bill_date DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No bills in range.']], total: 1 };
        }
        return {
          columns: ['Bill #', 'Vendor', 'Date', 'Total', 'Status'],
          rows: data.map((r: any) => [r.bill_number, r.vendor, String(r.bill_date), Number(r.total_amount), r.status]),
          total: data.length,
        };
      }
      case 'suppliers/outstanding-payables': {
        const data = await db.query(
          `SELECT v.name AS vendor,
                  pb.bill_number,
                  pb.balance_due,
                  CAST(pb.due_date AS TEXT) AS due_date
           FROM purchase_bills pb
           JOIN shop_vendors v ON v.id = pb.supplier_id AND v.tenant_id = pb.tenant_id
           WHERE pb.tenant_id = $1 AND pb.balance_due > 0.01
           ORDER BY CASE WHEN pb.due_date IS NULL THEN 1 ELSE 0 END, pb.due_date
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['Nothing outstanding.']], total: 1 };
        }
        return {
          columns: ['Vendor', 'Bill #', 'Balance due', 'Due'],
          rows: data.map((r: any) => [r.vendor, r.bill_number, Number(r.balance_due), String(r.due_date ?? '')]),
          total: data.length,
        };
      }
      case 'suppliers/purchase-trends': {
        const isPg = db.getType() === 'postgres';
        const wk = isPg
          ? `TO_CHAR(date_trunc('week', pb.bill_date AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
          : `strftime('%Y-W%W', pb.bill_date)`;
        const data = await db.query(
          `SELECT ${wk} AS week,
                  COALESCE(SUM(pb.total_amount), 0) AS spend,
                  COUNT(*) AS bills
           FROM purchase_bills pb
           WHERE pb.tenant_id = $1
             AND pb.bill_date >= $2 AND pb.bill_date < $3
           GROUP BY 1
           ORDER BY 1`,
          [p.tenantId, start, endExclusive]
        ).catch(() => []);
        return {
          columns: ['Week', 'Spend', 'Bills'],
          rows: data.map((r: any) => [String(r.week), Number(r.spend), Number(r.bills)]),
          total: data.length,
        };
      }
      case 'suppliers/price-variance': {
        const data = await db.query(
          `SELECT p.sku,
                  AVG(pbi.unit_cost) AS avg_bill_cost,
                  COALESCE(MAX(p.average_cost), MAX(p.cost_price), 0) AS product_cost,
                  AVG(pbi.unit_cost) - COALESCE(MAX(p.average_cost), MAX(p.cost_price), 0) AS variance
           FROM purchase_bill_items pbi
           JOIN purchase_bills pb ON pb.id = pbi.purchase_bill_id AND pb.tenant_id = pbi.tenant_id
           JOIN shop_products p ON p.id = pbi.product_id AND p.tenant_id = pbi.tenant_id
           WHERE pbi.tenant_id = $1
             AND pb.bill_date >= $2 AND pb.bill_date < $3
           GROUP BY p.id, p.sku
           ORDER BY ABS(AVG(pbi.unit_cost) - COALESCE(MAX(p.average_cost), MAX(p.cost_price), 0)) DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No bill lines in range (bill item cost vs product cost).']], total: 1 };
        }
        return {
          columns: ['SKU', 'Avg bill cost', 'Product cost', 'Variance'],
          rows: data.map((r: any) => [r.sku, Number(r.avg_bill_cost), Number(r.product_cost), Number(r.variance)]),
          total: data.length,
        };
      }
      case 'suppliers/vendor-performance': {
        const data = await db.query(
          `SELECT v.name AS vendor,
                  COUNT(DISTINCT pb.id) AS bills,
                  COALESCE(SUM(pb.total_amount), 0) AS spend
           FROM purchase_bills pb
           JOIN shop_vendors v ON v.id = pb.supplier_id AND v.tenant_id = pb.tenant_id
           WHERE pb.tenant_id = $1
             AND pb.bill_date >= $2 AND pb.bill_date < $3
           GROUP BY v.id, v.name
           ORDER BY spend DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No procurement in range.']], total: 1 };
        }
        return {
          columns: ['Vendor', 'Bills', 'Spend'],
          rows: data.map((r: any) => [r.vendor, Number(r.bills), Number(r.spend)]),
          total: data.length,
        };
      }
      case 'inventory/dead-stock': {
        const data = await db.query(
          `SELECT p.sku,
                  p.name,
                  COALESCE(SUM(i.quantity_on_hand), 0) AS on_hand
           FROM shop_products p
           JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
           WHERE p.tenant_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM shop_sale_items si
               JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
               WHERE si.product_id = p.id AND s.status = 'Completed'
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             )
           GROUP BY p.id, p.sku, p.name
           HAVING COALESCE(SUM(i.quantity_on_hand), 0) > 0
           ORDER BY on_hand DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'On hand'],
          rows: data.map((r: any) => [r.sku, r.name, Number(r.on_hand)]),
          total: data.length,
        };
      }
      case 'inventory/expiry-report': {
        const isPgEx = db.getType() === 'postgres';
        const expirySql = isPgEx
          ? `SELECT p.sku,
                    ib.batch_no,
                    CAST(ib.expiry_date AS TEXT) AS expiry_date,
                    ib.quantity_remaining,
                    w.name AS warehouse
             FROM inventory_batches ib
             JOIN shop_products p ON p.id = ib.product_id AND p.tenant_id = ib.tenant_id
             JOIN shop_warehouses w ON w.id = ib.warehouse_id AND w.tenant_id = ib.tenant_id
             WHERE ib.tenant_id = $1
               AND ib.quantity_remaining > 0
               AND ib.expiry_date IS NOT NULL
               AND ib.expiry_date <= $4::date
             ORDER BY ib.expiry_date ASC
             LIMIT $2 OFFSET $3`
          : `SELECT p.sku,
                    ib.batch_no,
                    CAST(ib.expiry_date AS TEXT) AS expiry_date,
                    ib.quantity_remaining,
                    w.name AS warehouse
             FROM inventory_batches ib
             JOIN shop_products p ON p.id = ib.product_id AND p.tenant_id = ib.tenant_id
             JOIN shop_warehouses w ON w.id = ib.warehouse_id AND w.tenant_id = ib.tenant_id
             WHERE ib.tenant_id = $1
               AND ib.quantity_remaining > 0
               AND ib.expiry_date IS NOT NULL
               AND date(ib.expiry_date) <= date($4)
             ORDER BY ib.expiry_date ASC
             LIMIT $2 OFFSET $3`;
        const data = await db.query(expirySql, [p.tenantId, lim, off, p.dateTo]).catch(() => []);
        if (!data.length) {
          return {
            columns: ['Notice'],
            rows: [['No dated batches expiring on/before range end, or inventory_batches missing.']],
            total: 1,
          };
        }
        return {
          columns: ['SKU', 'Batch', 'Expiry', 'Qty left', 'Warehouse'],
          rows: data.map((r: any) => [r.sku, r.batch_no, String(r.expiry_date), Number(r.quantity_remaining), r.warehouse]),
          total: data.length,
        };
      }
      case 'inventory/batch-tracking': {
        const data = await db.query(
          `SELECT p.sku,
                  ib.batch_no,
                  CAST(ib.expiry_date AS TEXT) AS expiry_date,
                  ib.quantity_remaining,
                  w.name AS warehouse
           FROM inventory_batches ib
           JOIN shop_products p ON p.id = ib.product_id AND p.tenant_id = ib.tenant_id
           JOIN shop_warehouses w ON w.id = ib.warehouse_id AND w.tenant_id = ib.tenant_id
           WHERE ib.tenant_id = $1 AND ib.quantity_remaining > 0
           ORDER BY w.name, p.sku
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No batch rows or table missing.']], total: 1 };
        }
        return {
          columns: ['SKU', 'Batch', 'Expiry', 'Qty left', 'Warehouse'],
          rows: data.map((r: any) => [r.sku, r.batch_no, String(r.expiry_date ?? ''), Number(r.quantity_remaining), r.warehouse]),
          total: data.length,
        };
      }
      case 'inventory/warehouse-stock': {
        const data = await db.query(
          `SELECT w.name AS warehouse,
                  COUNT(DISTINCT i.product_id) AS skus,
                  COALESCE(SUM(i.quantity_on_hand), 0) AS units,
                  COALESCE(SUM(i.quantity_on_hand * p.cost_price), 0) AS value_proxy
           FROM shop_inventory i
           JOIN shop_warehouses w ON w.id = i.warehouse_id AND w.tenant_id = i.tenant_id
           JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
           WHERE i.tenant_id = $1
           GROUP BY w.id, w.name
           ORDER BY value_proxy DESC`,
          [p.tenantId]
        );
        return {
          columns: ['Warehouse', 'SKUs', 'Units', 'Value (qty × cost_price)'],
          rows: data.map((r: any) => [r.warehouse, Number(r.skus), Number(r.units), Number(r.value_proxy)]),
          total: data.length,
        };
      }
      case 'inventory/inventory-movement': {
        const data = await db.query(
          `SELECT m.type,
                  COUNT(*) AS movements,
                  COALESCE(SUM(ABS(m.quantity)), 0) AS qty_abs
           FROM shop_inventory_movements m
           WHERE m.tenant_id = $1
             AND m.created_at >= $2 AND m.created_at < $3
           GROUP BY m.type
           ORDER BY qty_abs DESC`,
          [p.tenantId, start, endExclusive]
        );
        return {
          columns: ['Type', 'Movements', 'Qty (abs sum)'],
          rows: data.map((r: any) => [r.type, Number(r.movements), Number(r.qty_abs)]),
          total: data.length,
        };
      }
      case 'inventory/reorder-suggestions': {
        const data = await db.query(
          `SELECT p.sku,
                  p.name,
                  w.name AS warehouse,
                  i.quantity_on_hand AS on_hand,
                  p.reorder_point,
                  (p.reorder_point - i.quantity_on_hand) AS deficit
           FROM shop_inventory i
           JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
           JOIN shop_warehouses w ON w.id = i.warehouse_id AND w.tenant_id = i.tenant_id
           WHERE i.tenant_id = $1 AND i.quantity_on_hand < p.reorder_point
           ORDER BY deficit DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        );
        return {
          columns: ['SKU', 'Product', 'Warehouse', 'On hand', 'Reorder', 'Deficit'],
          rows: data.map((r: any) => [r.sku, r.name, r.warehouse, Number(r.on_hand), Number(r.reorder_point), Number(r.deficit)]),
          total: data.length,
        };
      }
      case 'inventory/stock-transfer-report':
      case 'multi_branch/inter-branch-transfers': {
        const data = await db.query(
          `SELECT CAST(m.created_at AS TEXT) AS at,
                  m.type,
                  p.sku,
                  m.quantity,
                  COALESCE(m.reason, '') AS reason
           FROM shop_inventory_movements m
           JOIN shop_products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
           WHERE m.tenant_id = $1
             AND m.created_at >= $2 AND m.created_at < $3
             AND (
               LOWER(m.type) LIKE '%transfer%'
               OR LOWER(COALESCE(m.reason, '')) LIKE '%transfer%'
               OR LOWER(COALESCE(m.reason, '')) LIKE '%branch%'
             )
           ORDER BY m.created_at DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return {
            columns: ['Notice'],
            rows: [['No movement rows matched transfer-like type/reason in range.']],
            total: 1,
          };
        }
        return {
          columns: ['At', 'Type', 'SKU', 'Qty', 'Reason'],
          rows: data.map((r: any) => [String(r.at), r.type, r.sku, Number(r.quantity), r.reason]),
          total: data.length,
        };
      }
      case 'inventory/inventory-turnover': {
        const turnParams = [p.tenantId, start, endExclusive, br];
        let cogsVal = 0;
        let invVal = 0;
        if (db.getType() === 'postgres') {
          const rows = await db.query(
            `WITH cogs AS (
               SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_at_sale, p.average_cost, p.cost_price, 0)), 0) AS c
               FROM shop_sale_items si
               JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
               JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
               WHERE si.tenant_id = $1 AND s.status = 'Completed'
                 AND s.created_at >= $2 AND s.created_at < $3
                 AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
             ),
             inv AS (
               SELECT COALESCE(SUM(i.quantity_on_hand * COALESCE(p.average_cost, p.cost_price, 0)), 0) AS v
               FROM shop_inventory i
               JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
               WHERE i.tenant_id = $1
             )
             SELECT cogs.c, inv.v,
                    CASE WHEN inv.v > 0 THEN ROUND((cogs.c / inv.v)::numeric, 4) ELSE NULL END AS turns
             FROM cogs, inv`,
            turnParams
          );
          const r = rows[0] as any;
          if (!r) {
            return { columns: ['Notice'], rows: [['Could not compute turnover.']], total: 1 };
          }
          return {
            columns: ['COGS (est.)', 'Inventory value (est.)', 'Turns (COGS / value)'],
            rows: [[Number(r.c), Number(r.v), r.turns === null || r.turns === undefined ? null : Number(r.turns)]],
            total: 1,
          };
        }
        const cRow = await db.query(
          `SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_at_sale, p.average_cost, p.cost_price, 0)), 0) AS c
           FROM shop_sale_items si
           JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
           JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
           WHERE si.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))`,
          turnParams
        );
        const vRow = await db.query(
          `SELECT COALESCE(SUM(i.quantity_on_hand * COALESCE(p.average_cost, p.cost_price, 0)), 0) AS v
           FROM shop_inventory i
           JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
           WHERE i.tenant_id = $1`,
          [p.tenantId]
        );
        cogsVal = Number((cRow[0] as any)?.c ?? 0);
        invVal = Number((vRow[0] as any)?.v ?? 0);
        const turns = invVal > 0 ? Math.round((cogsVal / invVal) * 10000) / 10000 : null;
        return {
          columns: ['COGS (est.)', 'Inventory value (est.)', 'Turns (COGS / value)'],
          rows: [[cogsVal, invVal, turns]],
          total: 1,
        };
      }
      case 'multi_branch/branch-ranking': {
        if (db.getType() === 'sqlite') {
          const d2 = await db.query(
            `SELECT COALESCE(b.name, 'Unassigned') AS branch,
                    COUNT(*) AS orders,
                    COALESCE(SUM(s.grand_total), 0) AS revenue
             FROM shop_sales s
             LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
             WHERE s.tenant_id = $1 AND s.status = 'Completed'
               AND s.created_at >= $2 AND s.created_at < $3
             GROUP BY b.id, b.name
             ORDER BY revenue DESC
             LIMIT $3 OFFSET $4`,
            [p.tenantId, start, endExclusive, lim, off]
          );
          return {
            columns: ['Rank', 'Branch', 'Orders', 'Revenue'],
            rows: d2.map((r: any, i: number) => [off + i + 1, r.branch, Number(r.orders), Number(r.revenue)]),
            total: d2.length,
          };
        }
        const data = await db.query(
          `SELECT ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(s.grand_total), 0) DESC) AS rank,
                  COALESCE(b.name, 'Unassigned') AS branch,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1 AND s.status = 'Completed'
             AND s.created_at >= $2 AND s.created_at < $3
           GROUP BY b.id, b.name
           ORDER BY revenue DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        );
        return {
          columns: ['Rank', 'Branch', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [Number(r.rank), r.branch, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'multi_branch/regional-sales-heatmap': {
        return {
          columns: ['Notice', 'Detail'],
          rows: [
            [
              'Geo not available',
              'POS sales do not store customer geo coordinates; use branch-level reports for density.',
            ],
          ],
          total: 1,
        };
      }
      case 'cash_shift/shift-closing-z-report':
      case 'cash_shift/interim-shift-report-x-report': {
        const closedOnly = key === 'cash_shift/shift-closing-z-report';
        const data = await db.query(
          `SELECT CAST(cs.opening_time AS TEXT) AS opened,
                  CAST(cs.closing_time AS TEXT) AS closed,
                  COALESCE(u.username, cs.cashier_id) AS cashier,
                  cs.opening_cash,
                  cs.closing_cash_expected,
                  cs.closing_cash_actual,
                  cs.variance_amount,
                  cs.status
           FROM cashier_shifts cs
           LEFT JOIN users u ON u.id = cs.cashier_id AND u.tenant_id = cs.tenant_id
           WHERE cs.tenant_id = $1
             AND cs.opening_time >= $2 AND cs.opening_time < $3
             ${closedOnly ? "AND cs.status = 'closed'" : ''}
           ORDER BY cs.opening_time DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No shift rows in range or cashier_shifts missing.']], total: 1 };
        }
        return {
          columns: ['Opened', 'Closed', 'Cashier', 'Opening cash', 'Expected close', 'Actual close', 'Variance', 'Status'],
          rows: data.map((r: any) => [
            String(r.opened),
            String(r.closed ?? ''),
            r.cashier,
            Number(r.opening_cash),
            r.closing_cash_expected === null || r.closing_cash_expected === undefined
              ? null
              : Number(r.closing_cash_expected),
            r.closing_cash_actual === null || r.closing_cash_actual === undefined ? null : Number(r.closing_cash_actual),
            r.variance_amount === null || r.variance_amount === undefined ? null : Number(r.variance_amount),
            r.status,
          ]),
          total: data.length,
        };
      }
      case 'cash_shift/cash-drawer-summary': {
        const data = await db.query(
          `SELECT payment_method,
                  COUNT(*) AS orders,
                  COALESCE(SUM(grand_total), 0) AS revenue
           FROM shop_sales
           WHERE tenant_id = $1 AND status = 'Completed'
             AND created_at >= $2 AND created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR branch_id = CAST($4 AS TEXT))
           GROUP BY payment_method
           ORDER BY revenue DESC`,
          [p.tenantId, start, endExclusive, br]
        );
        return {
          columns: ['Tender', 'Orders', 'Revenue'],
          rows: data.map((r: any) => [r.payment_method, Number(r.orders), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'cash_shift/cash-difference-report': {
        const data = await db.query(
          `SELECT CAST(cs.closing_time AS TEXT) AS closed,
                  COALESCE(u.username, cs.cashier_id) AS cashier,
                  cs.variance_amount,
                  COALESCE(cs.variance_reason, '') AS reason
           FROM cashier_shifts cs
           LEFT JOIN users u ON u.id = cs.cashier_id AND u.tenant_id = cs.tenant_id
           WHERE cs.tenant_id = $1
             AND cs.closing_time >= $2 AND cs.closing_time < $3
             AND cs.variance_amount IS NOT NULL
             AND ABS(cs.variance_amount) > 0.01
           ORDER BY ABS(cs.variance_amount) DESC
           LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No shift variances in range.']], total: 1 };
        }
        return {
          columns: ['Closed', 'Cashier', 'Variance', 'Reason'],
          rows: data.map((r: any) => [String(r.closed), r.cashier, Number(r.variance_amount), r.reason]),
          total: data.length,
        };
      }
      case 'cash_shift/register-activity': {
        const data = await db.query(
          `SELECT COALESCE(t.name, 'Terminal ' || COALESCE(s.terminal_id, '?')) AS terminal,
                  COUNT(*) AS tickets,
                  COALESCE(SUM(s.grand_total), 0) AS revenue
           FROM shop_sales s
           LEFT JOIN shop_terminals t ON t.id = s.terminal_id AND t.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1
             AND s.created_at >= $2 AND s.created_at < $3
             AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))
           GROUP BY s.terminal_id, t.name
           ORDER BY tickets DESC
           LIMIT $5 OFFSET $6`,
          [p.tenantId, start, endExclusive, br, lim, off]
        ).catch(() => []);
        return {
          columns: ['Terminal', 'Tickets', 'Revenue'],
          rows: data.map((r: any) => [r.terminal, Number(r.tickets), Number(r.revenue)]),
          total: data.length,
        };
      }
      case 'restaurant/kitchen-performance': {
        const isPgK = db.getType() === 'postgres';
        const data = await db.query(
          isPgK
            ? `SELECT mo.order_number,
                      CAST(mo.created_at AS TEXT) AS created,
                      CAST(mo.delivered_at AS TEXT) AS delivered,
                      CASE
                        WHEN mo.delivered_at IS NOT NULL AND mo.created_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM (mo.delivered_at - mo.created_at)) / 60.0
                        ELSE NULL
                      END AS minutes
               FROM mobile_orders mo
               WHERE mo.tenant_id = $1
                 AND mo.created_at >= $2 AND mo.created_at < $3
                 AND mo.delivered_at IS NOT NULL
               ORDER BY mo.created_at DESC
               LIMIT $4 OFFSET $5`
            : `SELECT mo.order_number,
                      CAST(mo.created_at AS TEXT) AS created,
                      CAST(mo.delivered_at AS TEXT) AS delivered,
                      CASE
                        WHEN mo.delivered_at IS NOT NULL AND mo.created_at IS NOT NULL
                        THEN (julianday(mo.delivered_at) - julianday(mo.created_at)) * 24 * 60
                        ELSE NULL
                      END AS minutes
               FROM mobile_orders mo
               WHERE mo.tenant_id = $1
                 AND mo.created_at >= $2 AND mo.created_at < $3
                 AND mo.delivered_at IS NOT NULL
               ORDER BY mo.created_at DESC
               LIMIT $4 OFFSET $5`,
          [p.tenantId, start, endExclusive, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return {
            columns: ['Notice'],
            rows: [['No delivered mobile orders in range (kitchen timing proxy).']],
            total: 1,
          };
        }
        return {
          columns: ['Order #', 'Created', 'Delivered', 'Lead time (min)'],
          rows: data.map((r: any) => [r.order_number, String(r.created), String(r.delivered), r.minutes == null ? null : Number(r.minutes)]),
          total: data.length,
        };
      }
      case 'restaurant/table-turnover': {
        return {
          columns: ['Notice', 'Detail'],
          rows: [['Not tracked', 'Table/cover timing is not stored in schema; use POS custom fields when added.']],
          total: 1,
        };
      }
      case 'restaurant/rider-performance':
      case 'restaurant/delivery-time-analysis': {
        const isPgD = db.getType() === 'postgres';
        const data = await db.query(
          isPgD
            ? `SELECT DATE_TRUNC('day', mo.created_at AT TIME ZONE 'UTC')::date AS day,
                      COUNT(*) AS orders,
                      AVG(EXTRACT(EPOCH FROM (mo.delivered_at - mo.created_at)) / 60.0) AS avg_minutes
               FROM mobile_orders mo
               WHERE mo.tenant_id = $1
                 AND mo.created_at >= $2 AND mo.created_at < $3
                 AND mo.delivered_at IS NOT NULL
               GROUP BY 1
               ORDER BY 1`
            : `SELECT date(mo.created_at) AS day,
                      COUNT(*) AS orders,
                      AVG((julianday(mo.delivered_at) - julianday(mo.created_at)) * 24 * 60) AS avg_minutes
               FROM mobile_orders mo
               WHERE mo.tenant_id = $1
                 AND mo.created_at >= $2 AND mo.created_at < $3
                 AND mo.delivered_at IS NOT NULL
               GROUP BY date(mo.created_at)
               ORDER BY 1`,
          [p.tenantId, start, endExclusive]
        ).catch(() => []);
        if (!data.length) {
          return {
            columns: ['Notice'],
            rows: [['No delivered mobile orders in range.']],
            total: 1,
          };
        }
        return {
          columns: ['Day', 'Orders', 'Avg delivery minutes'],
          rows: data.map((r: any) => [String(r.day), Number(r.orders), Number(r.avg_minutes)]),
          total: data.length,
        };
      }
      case 'restaurant/recipe-consumption': {
        const data = await db.query(
          `SELECT r.title AS recipe,
                  ri.ingredient_name,
                  SUM(ri.quantity) AS qty
           FROM recipe_ingredients ri
           JOIN recipes r ON r.id = ri.recipe_id AND r.tenant_id = ri.tenant_id
           WHERE ri.tenant_id = $1
           GROUP BY r.id, r.title, ri.ingredient_name
           ORDER BY r.title, ri.ingredient_name
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No recipe ingredients or recipes module missing.']], total: 1 };
        }
        return {
          columns: ['Recipe', 'Ingredient', 'Qty (catalog)'],
          rows: data.map((r: any) => [r.recipe, r.ingredient_name, Number(r.qty)]),
          total: data.length,
        };
      }
      case 'restaurant/food-cost-analysis': {
        const data = await db.query(
          `SELECT r.title AS recipe,
                  COALESCE(SUM(ri.quantity * COALESCE(p.average_cost, p.cost_price, 0)), 0) AS theoretical_cost
           FROM recipe_ingredients ri
           JOIN recipes r ON r.id = ri.recipe_id AND r.tenant_id = ri.tenant_id
           JOIN shop_products p ON p.id = ri.product_id AND p.tenant_id = ri.tenant_id
           WHERE ri.tenant_id = $1
           GROUP BY r.id, r.title
           ORDER BY theoretical_cost DESC
           LIMIT $2 OFFSET $3`,
          [p.tenantId, lim, off]
        ).catch(() => []);
        if (!data.length) {
          return { columns: ['Notice'], rows: [['No recipe cost data.']], total: 1 };
        }
        return {
          columns: ['Recipe', 'Theoretical ingredient cost'],
          rows: data.map((r: any) => [r.recipe, Number(r.theoretical_cost)]),
          total: data.length,
        };
      }
      default:
        return stub(entry.title);
    }
  } catch (e: any) {
    return {
      columns: ['Error'],
      rows: [[e?.message || String(e)]],
      total: 0,
    };
  }
}

export function resultToCsv(result: ReportQueryResult): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [result.columns.map(esc).join(',')];
  for (const row of result.rows) {
    lines.push(row.map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\n');
}
