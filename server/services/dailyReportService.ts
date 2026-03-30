import { getDatabaseService } from './databaseService.js';

export interface DailyReportSummary {
  date: string;
  branchId: string | null;
  posSales: number;
  mobileSales: number;
  inventoryOutQty: number;
  inventoryInQty: number;
  totalExpenses: number;
  newProductsCount: number;
  netProfitDaily: number;
}

function dayRangeUtc(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export class DailyReportService {
  async getSummary(tenantId: string, dateStr: string, branchId: string | null): Promise<DailyReportSummary> {
    const { start, end } = dayRangeUtc(dateStr);
    const db = getDatabaseService();

    const pos = await db.query<{ s: string }>(
      `SELECT COALESCE(SUM(grand_total::numeric), 0)::text AS s
       FROM shop_sales
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       ${branchId ? 'AND branch_id = $4' : ''}`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );

    const mobile = await db.query<{ s: string }>(
      `SELECT COALESCE(SUM(grand_total::numeric), 0)::text AS s
       FROM mobile_orders
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       AND status <> 'Cancelled'
       ${branchId ? 'AND branch_id = $4' : ''}`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );

    const outQ = await db.query<{ s: string }>(
      `SELECT COALESCE(SUM(ABS(quantity)), 0)::text AS s
       FROM shop_inventory_movements
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       AND quantity < 0
       ${branchId ? 'AND warehouse_id = $4' : ''}`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );

    const inQ = await db.query<{ s: string }>(
      `SELECT COALESCE(SUM(quantity), 0)::text AS s
       FROM shop_inventory_movements
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       AND type = 'Purchase' AND quantity > 0
       ${branchId ? 'AND warehouse_id = $4' : ''}`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );

    const exp = await db.query<{ s: string }>(
      `SELECT COALESCE(SUM(amount::numeric), 0)::text AS s
       FROM expenses
       WHERE tenant_id = $1 AND expense_date = $2::date
       ${branchId ? 'AND branch_id = $3' : ''}`,
      branchId ? [tenantId, dateStr, branchId] : [tenantId, dateStr]
    );

    const prodC = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM shop_products
       WHERE tenant_id = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`,
      [tenantId, start, end]
    );

    const posSales = parseFloat(pos[0]?.s || '0') || 0;
    const mobileSales = parseFloat(mobile[0]?.s || '0') || 0;
    const inventoryOutQty = parseFloat(outQ[0]?.s || '0') || 0;
    const inventoryInQty = parseFloat(inQ[0]?.s || '0') || 0;
    const totalExpenses = parseFloat(exp[0]?.s || '0') || 0;
    const newProductsCount = parseInt(prodC[0]?.c || '0', 10) || 0;

    return {
      date: dateStr,
      branchId,
      posSales,
      mobileSales,
      inventoryOutQty,
      inventoryInQty,
      totalExpenses,
      newProductsCount,
      netProfitDaily: posSales + mobileSales - totalExpenses,
    };
  }

  async getInventoryOutDetail(tenantId: string, dateStr: string, branchId: string | null) {
    const db = getDatabaseService();
    const { start, end } = dayRangeUtc(dateStr);
    return db.query(
      `SELECT m.product_id AS item_id,
              p.name AS item_name,
              p.sku,
              COALESCE(p.unit, 'pcs') AS unit,
              SUM(ABS(m.quantity))::numeric AS total_qty_out
       FROM shop_inventory_movements m
       JOIN shop_products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.created_at >= $2::timestamptz AND m.created_at < $3::timestamptz
         AND m.quantity < 0
         ${branchId ? 'AND m.warehouse_id = $4' : ''}
       GROUP BY m.product_id, p.name, p.sku, p.unit
       ORDER BY total_qty_out DESC, p.name`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );
  }

  async getInventoryInDetail(tenantId: string, dateStr: string, branchId: string | null) {
    const db = getDatabaseService();
    const { start, end } = dayRangeUtc(dateStr);
    return db.query(
      `SELECT m.product_id AS item_id,
              p.name AS item_name,
              p.sku,
              COALESCE(p.unit, 'pcs') AS unit,
              SUM(m.quantity)::numeric AS total_qty_in,
              MAX(sv.name) AS supplier
       FROM shop_inventory_movements m
       JOIN shop_products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
       LEFT JOIN purchase_bills pb ON pb.id = m.reference_id AND pb.tenant_id = m.tenant_id
       LEFT JOIN shop_vendors sv ON sv.id = pb.supplier_id AND sv.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.created_at >= $2::timestamptz AND m.created_at < $3::timestamptz
         AND m.type = 'Purchase' AND m.quantity > 0
         ${branchId ? 'AND m.warehouse_id = $4' : ''}
       GROUP BY m.product_id, p.name, p.sku, p.unit
       ORDER BY total_qty_in DESC, p.name`,
      branchId ? [tenantId, start, end, branchId] : [tenantId, start, end]
    );
  }

  async getExpensesDetail(tenantId: string, dateStr: string, branchId: string | null) {
    const db = getDatabaseService();
    return db.query(
      `SELECT e.expense_date::text AS date,
              ec.name AS expense_category,
              e.amount::numeric,
              COALESCE(e.description, '') AS notes,
              COALESCE(ba.name, '') AS paid_from_account
       FROM expenses e
       JOIN expense_categories ec ON ec.id = e.category_id AND ec.tenant_id = e.tenant_id
       LEFT JOIN shop_bank_accounts ba ON ba.id = e.payment_account_id AND ba.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.expense_date = $2::date
       ${branchId ? 'AND e.branch_id = $3' : ''}
       ORDER BY e.amount DESC, ec.name`,
      branchId ? [tenantId, dateStr, branchId] : [tenantId, dateStr]
    );
  }

  async getProductsCreated(tenantId: string, dateStr: string) {
    const db = getDatabaseService();
    const { start, end } = dayRangeUtc(dateStr);
    return db.query(
      `SELECT p.sku,
              p.name AS product_name,
              COALESCE(c.name, '') AS category,
              COALESCE(u.name, '') AS created_by,
              p.created_at::text AS created_at
       FROM shop_products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       LEFT JOIN users u ON u.id = p.created_by AND u.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.created_at >= $2::timestamptz AND p.created_at < $3::timestamptz
       ORDER BY p.created_at DESC, p.name`,
      [tenantId, start, end]
    );
  }
}

let instance: DailyReportService | null = null;
export function getDailyReportService(): DailyReportService {
  if (!instance) instance = new DailyReportService();
  return instance;
}
