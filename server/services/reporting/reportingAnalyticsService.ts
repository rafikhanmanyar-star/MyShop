import { getDatabaseService } from '../databaseService.js';
import { getReportingCache, reportingCacheKey, setReportingCache } from './reportingCache.js';

export interface ExecutiveSummaryRange {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  branchId?: string | null;
}

function toUtcStartDay(d: string): string {
  return `${d}T00:00:00.000Z`;
}

function addDaysUtc(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export class ReportingAnalyticsService {
  async getExecutiveSummary(input: ExecutiveSummaryRange) {
    const db = getDatabaseService();
    const branchKey = input.branchId?.trim() || '';
    const cacheKey = reportingCacheKey(['exec', input.tenantId, input.dateFrom, input.dateTo, branchKey]);
    const cached = getReportingCache<unknown>(cacheKey);
    if (cached) return cached;

    const start = toUtcStartDay(input.dateFrom);
    const endExclusive = toUtcStartDay(addDaysUtc(input.dateTo, 1));
    const branchParam = branchKey || null;

    let salesFromMv: any = null;
    if (db.getType() === 'postgres') {
      try {
        const mvRows = await db.query(
          `SELECT
             COALESCE(SUM(transaction_count), 0) AS orders,
             COALESCE(SUM(gross_revenue), 0) AS gross_revenue,
             COALESCE(SUM(discount_total), 0) AS discounts,
             COALESCE(SUM(tax_total), 0) AS taxes
           FROM mv_report_daily_sales_by_branch
           WHERE tenant_id = $1
             AND sale_day >= $2
             AND sale_day <= $3
             AND ($4 IS NULL OR $4 = '' OR branch_id = $4)`,
          [input.tenantId, input.dateFrom, input.dateTo, branchParam]
        );
        if (mvRows.length) salesFromMv = mvRows[0];
      } catch {
        salesFromMv = null;
      }
    }

    let orders = Number(salesFromMv?.orders ?? 0);
    let grossRevenue = Number(salesFromMv?.gross_revenue ?? 0);
    let discounts = Number(salesFromMv?.discounts ?? 0);
    let taxes = Number(salesFromMv?.taxes ?? 0);

    if (!salesFromMv) {
      const saleRows = await db.query(
        `SELECT
           COUNT(*) AS orders,
           COALESCE(SUM(grand_total), 0) AS gross_revenue,
           COALESCE(SUM(discount_total), 0) AS discounts,
           COALESCE(SUM(tax_total), 0) AS taxes
         FROM shop_sales
         WHERE tenant_id = $1
           AND status = 'Completed'
           AND created_at >= $2
           AND created_at < $3
           AND ($4 IS NULL OR $4 = '' OR branch_id = $4)`,
        [input.tenantId, start, endExclusive, branchParam]
      );
      const r = saleRows[0] || {};
      orders = Number(r.orders ?? 0);
      grossRevenue = Number(r.gross_revenue ?? 0);
      discounts = Number(r.discounts ?? 0);
      taxes = Number(r.taxes ?? 0);
    }

    const expRows = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS expenses
       FROM expenses
       WHERE tenant_id = $1
         AND expense_date >= $2
         AND expense_date <= $3
         AND ($4 IS NULL OR $4 = '' OR branch_id = $4)`,
      [input.tenantId, input.dateFrom, input.dateTo, branchParam]
    );
    const expenses = Number(expRows[0]?.expenses ?? 0);

    const topProducts = await db.query(
      `SELECT p.name AS label, COALESCE(SUM(si.subtotal), 0) AS value
       FROM shop_sale_items si
       INNER JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
       INNER JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
       WHERE si.tenant_id = $1
         AND s.status = 'Completed'
         AND s.created_at >= $2
         AND s.created_at < $3
         AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
       GROUP BY p.id, p.name
       ORDER BY value DESC
       LIMIT 8`,
      [input.tenantId, start, endExclusive, branchParam]
    );

    const topBranches = await db.query(
      `SELECT COALESCE(b.name, 'Unassigned') AS label, COALESCE(SUM(s.grand_total), 0) AS value
       FROM shop_sales s
       LEFT JOIN shop_branches b ON b.id = s.branch_id AND b.tenant_id = s.tenant_id
       WHERE s.tenant_id = $1
         AND s.status = 'Completed'
         AND s.created_at >= $2
         AND s.created_at < $3
       GROUP BY b.id, b.name
       ORDER BY value DESC
       LIMIT 8`,
      [input.tenantId, start, endExclusive]
    );

    let revenueTrend: any[];
    if (db.getType() === 'postgres') {
      revenueTrend = await db.query(
        `SELECT TO_CHAR((s.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day_label,
                COALESCE(SUM(s.grand_total), 0) AS amount
         FROM shop_sales s
         WHERE s.tenant_id = $1
           AND s.status = 'Completed'
           AND s.created_at >= $2
           AND s.created_at < $3
           AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
         GROUP BY 1
         ORDER BY 1 ASC`,
        [input.tenantId, start, endExclusive, branchParam]
      );
    } else {
      revenueTrend = await db.query(
        `SELECT strftime('%Y-%m-%d', s.created_at) AS day_label,
                COALESCE(SUM(s.grand_total), 0) AS amount
         FROM shop_sales s
         WHERE s.tenant_id = $1
           AND s.status = 'Completed'
           AND s.created_at >= $2
           AND s.created_at < $3
           AND ($4 IS NULL OR $4 = '' OR s.branch_id = $4)
         GROUP BY strftime('%Y-%m-%d', s.created_at)
         ORDER BY day_label ASC`,
        [input.tenantId, start, endExclusive, branchParam]
      );
    }

    const netSales = grossRevenue - discounts;
    const netProfit = netSales - expenses;
    const aov = orders > 0 ? netSales / orders : 0;
    const grossMarginPct = netSales > 0 ? ((netSales - expenses) / netSales) * 100 : 0;

    const payload = {
      kpis: {
        totalSales: grossRevenue,
        netSales,
        netProfit,
        grossMarginPct,
        discounts,
        taxes,
        expenses,
        refunds: 0,
        cashInHand: null as number | null,
        receivables: null as number | null,
        averageOrderValue: aov,
        orders,
      },
      series: {
        topProducts: topProducts.map((r: any) => ({ label: r.label, value: Number(r.value) })),
        topBranches: topBranches.map((r: any) => ({ label: r.label, value: Number(r.value) })),
        revenueTrend: revenueTrend.map((r: any) => ({ day: r.day_label, revenue: Number(r.amount) })),
      },
      generatedAt: new Date().toISOString(),
    };

    setReportingCache(cacheKey, payload, 25_000);
    return payload;
  }
}

let singleton: ReportingAnalyticsService | null = null;

export function getReportingAnalyticsService(): ReportingAnalyticsService {
  if (!singleton) singleton = new ReportingAnalyticsService();
  return singleton;
}
