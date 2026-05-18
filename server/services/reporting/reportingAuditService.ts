import { getDatabaseService } from '../databaseService.js';

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

export type AuditSummaryInput = {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  branchId?: string | null;
};

export class ReportingAuditService {
  async getAuditSummary(input: AuditSummaryInput) {
    const db = getDatabaseService();
    const { start, endExclusive } = rangeBounds(input.dateFrom, input.dateTo);
    const br = input.branchId?.trim() || null;

    const branchClause = `AND (COALESCE(CAST($4 AS TEXT), '') = '' OR s.branch_id = CAST($4 AS TEXT))`;
    const paramsBase = [input.tenantId, start, endExclusive, br];

    const voidRows = await db.query(
      `SELECT COUNT(*) AS c FROM shop_sales s
       WHERE s.tenant_id = $1 AND s.status = 'Void'
         AND s.created_at >= $2 AND s.created_at < $3 ${branchClause}`,
      paramsBase
    ).catch(() => [{ c: 0 }]);
    const voidCount = Number((voidRows[0] as any)?.c ?? 0);

    const cancelRows = await db.query(
      `SELECT COUNT(*) AS c FROM shop_sales s
       WHERE s.tenant_id = $1 AND s.status IN ('Void', 'Refunded')
         AND s.created_at >= $2 AND s.created_at < $3 ${branchClause}`,
      paramsBase
    ).catch(() => [{ c: 0 }]);
    const cancelledCount = Number((cancelRows[0] as any)?.c ?? 0);

    const discountRows = await db.query(
      `SELECT COUNT(*) AS c FROM shop_sales s
       WHERE s.tenant_id = $1 AND s.discount_total > 0
         AND s.created_at >= $2 AND s.created_at < $3 ${branchClause}`,
      paramsBase
    ).catch(() => [{ c: 0 }]);
    const discountAuditLines = Number((discountRows[0] as any)?.c ?? 0);

    const priceRows = await db.query(
      `SELECT COUNT(*) AS c
       FROM shop_sale_items si
       JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
       JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = si.tenant_id
       WHERE si.tenant_id = $1 AND s.status = 'Completed'
         AND s.created_at >= $2 AND s.created_at < $3
         ${branchClause}
         AND ABS(si.unit_price - p.retail_price) > 0.01`,
      paramsBase
    ).catch(() => [{ c: 0 }]);
    const priceOverrides = Number((priceRows[0] as any)?.c ?? 0);

    let systemLogCount = 0;
    let failedLogCount = 0;
    let recentModules: { module: string; count: number }[] = [];
    try {
      const lr = await db.query(
        `SELECT COUNT(*) AS c FROM system_logs WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
        [input.tenantId, start, endExclusive]
      );
      systemLogCount = Number((lr[0] as any)?.c ?? 0);
      const fr = await db.query(
        `SELECT COUNT(*) AS c FROM system_logs
         WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
           AND error IS NOT NULL AND LENGTH(TRIM(error)) > 0`,
        [input.tenantId, start, endExclusive]
      );
      failedLogCount = Number((fr[0] as any)?.c ?? 0);
      const mod = await db.query(
        `SELECT module, COUNT(*) AS c FROM system_logs
         WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
         GROUP BY module ORDER BY c DESC LIMIT 8`,
        [input.tenantId, start, endExclusive]
      );
      recentModules = mod.map((r: any) => ({ module: r.module, count: Number(r.c) }));
    } catch {
      /* system_logs missing on some SQLite builds */
    }

    const suspicious: { label: string; detail: string }[] = [];
    try {
      const sus = await db.query(
        `SELECT COALESCE(u.username, s.user_id) AS cashier,
                SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END) AS v,
                COUNT(*) AS t
         FROM shop_sales s
         LEFT JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.created_at >= $2 AND s.created_at < $3
         ${branchClause}
         GROUP BY s.user_id, u.username
         HAVING SUM(CASE WHEN s.status = 'Void' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) > 0.08`,
        paramsBase
      );
      for (const r of sus as any[]) {
        suspicious.push({
          label: `High void rate: ${r.cashier}`,
          detail: `${r.v} voids / ${r.t} tickets in selected window.`,
        });
      }
    } catch {
      /* ignore */
    }

    return {
      voidTransactions: { count: voidCount, trend: voidCount > 10 ? 'elevated' : 'stable' },
      cancelledInvoices: { count: cancelledCount, trend: 'stable' },
      discountAudit: { linesWithDiscount: discountAuditLines },
      priceOverrides: { lineCount: priceOverrides },
      systemLogs: { entries: systemLogCount, failedEntries: failedLogCount, topModules: recentModules },
      suspicious,
      range: { from: input.dateFrom, to: input.dateTo },
    };
  }
}

let singleton: ReportingAuditService | null = null;

export function getReportingAuditService(): ReportingAuditService {
  if (!singleton) singleton = new ReportingAuditService();
  return singleton;
}
