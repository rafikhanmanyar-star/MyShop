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
                 AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
                 AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
                 AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
               AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
               AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR sr.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)`,
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR e.branch_id = $4)
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
                 AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
             AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
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
