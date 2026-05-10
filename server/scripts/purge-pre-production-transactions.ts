/**
 * Purge test transactions dated strictly before PURGE_BEFORE (exclusive).
 * Targets: POS sales & related, mobile orders, sales returns (& GL), procurement
 * bills & supplier-side payments (& GL), khata ledger lines (& GL journals),
 * inventory movement rows keyed to deleted documents, cached report aggregates.
 *
 * IMPORTANT – not automatically fixed by this script:
 * - shop_bank_accounts.balance was adjusted when sales/payments were recorded; totals will
 *   no longer match history. Reconcile balances manually against real cash/bank positions.
 * - shop_inventory / shop_inventory_movements historically drove on-hand qty; deleting
 *   movements does NOT restore quantity. Prefer a cycle-count or inventory sync after purge.
 * - shop_loyalty_members aggregates (total_spend, points_*, visits) reflect old sales unless
 *   you rebuild them separately.
 * - POS customer_credit in customer_balance — recompute if your tenant used Credit/Khata tests.
 *
 * Usage (from repo root):
 *   DATABASE_URL="postgres://…" TENANT_ID="optional-single-tenant" \
 *   PURGE_BEFORE=2026-03-01 npm run purge-preprod --prefix server
 *
 * Dry run (counts only):
 *   PURGE_PREPROD_DRY_RUN=true npm run purge-preprod --prefix server
 */

import dotenv from 'dotenv';

dotenv.config();

import { getDatabaseService } from '../services/databaseService.js';
import { runWithTenantContext } from '../services/tenantContext.js';

/** Upper bound excluded: retained rows satisfy created_at/date >= purgeBefore (parsed as UTC date when possible). */
function parsePurgeUpperBoundExclusive(): Date {
  const raw = process.env.PURGE_BEFORE?.trim();
  const d = raw ? new Date(raw) : new Date(Date.UTC(2026, 2, 1)); // March 1, 2026 00:00 UTC
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`Invalid PURGE_BEFORE date: "${raw}"`);
  }
  return d;
}

async function purgeOneTenant(opts: {
  tenantId: string;
  cutoff: Date;
  dryRun: boolean;
}) {
  const { tenantId, cutoff, dryRun } = opts;
  const iso = cutoff.toISOString();

  await runWithTenantContext({ tenantId }, async () => {
    const db = getDatabaseService();
    await db.transaction(async (client: { query: (sql: string, params?: unknown[]) => Promise<any[]> }) => {
      const count = async (label: string, sql: string, params: unknown[] = []) => {
        const rows = await client.query(sql, params);
        const n = Number(rows[0]?.c ?? rows[0]?.count ?? 0);
        console.log(`  ${label}: ${n}`);
        return n;
      };

      console.log(`\nTenant ${tenantId} — cutoff (exclusive upper bound UTC): ${iso}`);

      if (dryRun) {
        await count(
          'purchase_bills (before cutoff)',
          `SELECT COUNT(*)::int AS c FROM purchase_bills WHERE tenant_id = $1 AND bill_date < $2::timestamptz`,
          [tenantId, iso]
        );
        await count(
          'shop_sales (before cutoff)',
          `SELECT COUNT(*)::int AS c FROM shop_sales WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
          [tenantId, iso]
        );
        await count(
          'mobile_orders (before cutoff)',
          `SELECT COUNT(*)::int AS c FROM mobile_orders WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
          [tenantId, iso]
        );
        await count(
          'shop_sales_returns matching purge rule',
          `SELECT COUNT(*)::int AS c FROM shop_sales_returns r
           WHERE r.tenant_id = $1
           AND (
             r.return_date < $2::timestamptz
             OR EXISTS (SELECT 1 FROM shop_sales s WHERE s.id = r.original_sale_id AND s.tenant_id = $1 AND s.created_at < $2::timestamptz)
             OR EXISTS (SELECT 1 FROM mobile_orders m WHERE m.id = r.original_mobile_order_id AND m.tenant_id = $1 AND m.created_at < $2::timestamptz)
           )`,
          [tenantId, iso]
        );
        await count(
          'journal_entries POS/Mobile/Purch/SR/Khata (before cutoff)',
          `SELECT COUNT(*)::int AS c FROM journal_entries
           WHERE tenant_id = $1 AND date < $2::timestamptz
           AND source_module IN ('POS', 'MobileApp', 'Purchases', 'SALES_RETURN', 'Khata')`,
          [tenantId, iso]
        );
        await count(
          'khata_ledger (before cutoff)',
          `SELECT COUNT(*)::int AS c FROM khata_ledger WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
          [tenantId, iso]
        );
        return;
      }

      /* --- Procurement: GL first, batches & movements tied to bills, then bills --- */
      const bills = await client.query(
        `SELECT id FROM purchase_bills WHERE tenant_id = $1 AND bill_date < $2::timestamptz`,
        [tenantId, iso]
      );
      const billIds = bills.map((b: any) => b.id);
      if (billIds.length > 0) {
        await client.query(
          `DELETE FROM journal_entries
           WHERE tenant_id = $1 AND source_module = 'Purchases' AND source_id = ANY($2::text[])`,
          [tenantId, billIds]
        );
        await client.query(
          `DELETE FROM shop_inventory_movements
           WHERE tenant_id = $1 AND type = 'Purchase' AND reference_id = ANY($2::text[])`,
          [tenantId, billIds]
        );
        await client.query(`DELETE FROM purchase_bills WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
          tenantId,
          billIds,
        ]);
      }

      await client.query(
        `DELETE FROM supplier_payments sp
         WHERE sp.tenant_id = $1
           AND sp.payment_date < $2::timestamptz
           AND NOT EXISTS (SELECT 1 FROM purchase_bill_payments pbp WHERE pbp.supplier_payment_id = sp.id)`,
        [tenantId, iso]
      );

      /* --- Sales returns: journals, header (items cascade), before touching sales lines --- */
      const returnsDel = await client.query(
        `SELECT r.id FROM shop_sales_returns r
         WHERE r.tenant_id = $1
         AND (
           r.return_date < $2::timestamptz
           OR EXISTS (
             SELECT 1 FROM shop_sales s
             WHERE s.id = r.original_sale_id AND s.tenant_id = $1 AND s.created_at < $2::timestamptz
           )
           OR EXISTS (
             SELECT 1 FROM mobile_orders m
             WHERE m.id = r.original_mobile_order_id AND m.tenant_id = $1 AND m.created_at < $2::timestamptz
           )
         )`,
        [tenantId, iso]
      );
      const retIds = returnsDel.map((r: any) => r.id);
      if (retIds.length > 0) {
        await client.query(
          `DELETE FROM shop_inventory_movements
           WHERE tenant_id = $1 AND type = 'SaleReturn' AND reference_id = ANY($2::text[])`,
          [tenantId, retIds]
        );
        await client.query(
          `DELETE FROM journal_entries
           WHERE tenant_id = $1 AND source_module = 'SALES_RETURN' AND source_id = ANY($2::text[])`,
          [tenantId, retIds]
        );
        await client.query(`DELETE FROM shop_sales_returns WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
          tenantId,
          retIds,
        ]);
      }

      /* --- Mobile orders --- */
      const moRows = await client.query(
        `SELECT id FROM mobile_orders WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
        [tenantId, iso]
      );
      const mobileOrderIds = moRows.map((r: any) => r.id);
      if (mobileOrderIds.length > 0) {
        await client.query(
          `DELETE FROM journal_entries
           WHERE tenant_id = $1 AND source_module = 'MobileApp' AND source_id = ANY($2::text[])`,
          [tenantId, mobileOrderIds]
        );
        await client.query(
          `DELETE FROM shop_inventory_movements
           WHERE tenant_id = $1 AND reference_id = ANY($2::text[])
             AND type IN ('Reserve', 'MobileSale', 'ReleaseReserve')`,
          [tenantId, mobileOrderIds]
        );
        await client.query(`DELETE FROM mobile_orders WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
          tenantId,
          mobileOrderIds,
        ]);
      }

      /* --- Khata: payment journals keyed by ledger id --- */
      const khataRows = await client.query(
        `SELECT id FROM khata_ledger WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
        [tenantId, iso]
      );
      const khataIds = khataRows.map((r: any) => r.id);
      if (khataIds.length > 0) {
        await client.query(
          `DELETE FROM journal_entries
           WHERE tenant_id = $1 AND source_module = 'Khata' AND source_id = ANY($2::text[])`,
          [tenantId, khataIds]
        );
      }
      await client.query(`DELETE FROM khata_ledger WHERE tenant_id = $1 AND created_at < $2::timestamptz`, [
        tenantId,
        iso,
      ]);

      /* --- POS sales --- */
      const salesRows = await client.query(
        `SELECT id FROM shop_sales WHERE tenant_id = $1 AND created_at < $2::timestamptz`,
        [tenantId, iso]
      );
      const saleIds = salesRows.map((r: any) => r.id);
      if (saleIds.length > 0) {
        await client.query(
          `DELETE FROM journal_entries
           WHERE tenant_id = $1 AND source_module = 'POS' AND source_id = ANY($2::text[])`,
          [tenantId, saleIds]
        );
        await client.query(
          `DELETE FROM shop_inventory_movements
           WHERE tenant_id = $1 AND type = 'Sale' AND reference_id = ANY($2::text[])`,
          [tenantId, saleIds]
        );
        await client.query(`DELETE FROM shop_sales WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, saleIds]);
      }

      await client.query(
        `DELETE FROM journal_entries je
         WHERE je.tenant_id = $1 AND je.source_module = 'POS' AND je.source_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM shop_sales s WHERE s.id = je.source_id AND s.tenant_id = $1)`,
        [tenantId]
      );
      await client.query(
        `DELETE FROM journal_entries je
         WHERE je.tenant_id = $1 AND je.source_module = 'MobileApp' AND je.source_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM mobile_orders m WHERE m.id = je.source_id AND m.tenant_id = $1)`,
        [tenantId]
      );
      await client.query(
        `DELETE FROM journal_entries je
         WHERE je.tenant_id = $1 AND je.source_module = 'Purchases' AND je.source_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM purchase_bills pb WHERE pb.id = je.source_id AND pb.tenant_id = $1)`,
        [tenantId]
      );
      await client.query(
        `DELETE FROM journal_entries je
         WHERE je.tenant_id = $1 AND je.source_module = 'SALES_RETURN' AND je.source_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM shop_sales_returns r WHERE r.id = je.source_id AND r.tenant_id = $1)`,
        [tenantId]
      );
      await client.query(
        `DELETE FROM journal_entries je
         WHERE je.tenant_id = $1 AND je.source_module = 'Khata' AND je.source_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM khata_ledger k WHERE k.id = je.source_id AND k.tenant_id = $1)`,
        [tenantId]
      );

      await client.query(`DELETE FROM report_aggregates WHERE tenant_id = $1`, [tenantId]);

      console.log(`  ✅ Purge committed for tenant ${tenantId}`);
    });
  });
}

async function main() {
  const dryRun = /^true$/i.test(process.env.PURGE_PREPROD_DRY_RUN || '');
  const cutoff = parsePurgeUpperBoundExclusive();

  console.log('='.repeat(72));
  console.log('purge-pre-production-transactions');
  console.log(`cutoff UTC (delete rows strictly before): ${cutoff.toISOString()}`);
  console.log(`mode: ${dryRun ? 'DRY RUN — counts only, no deletes' : 'LIVE deletes in one transaction per tenant'}`);
  console.log('='.repeat(72));

  const db = getDatabaseService();
  if (db.getType() === 'sqlite') {
    console.error(
      '\n⚠️  SQLite local DB detected. FK behavior differs after migrations; purge is written for Postgres production.\n    Do not run this against SQLite unless you have restored a PG-like schema and backups.\n'
    );
    if (!/^true$/i.test(process.env.FORCE_SQLITE_PURGE || '')) {
      process.exit(1);
    }
  }

  const singleTenant = process.env.TENANT_ID?.trim() || '';

  let tenantRows: { id: string }[];
  if (singleTenant) {
    tenantRows = await db.query(`SELECT id FROM tenants WHERE id = $1`, [singleTenant]);
    if (tenantRows.length === 0) {
      console.error(`No tenant found for TENANT_ID=${singleTenant}`);
      process.exit(1);
    }
  } else {
    tenantRows = await db.query(`SELECT id FROM tenants ORDER BY created_at ASC`);
  }

  for (const t of tenantRows) {
    try {
      await purgeOneTenant({ tenantId: t.id, cutoff, dryRun });
    } catch (e) {
      console.error(`❌ Tenant ${t.id} failed:`, e);
      throw e;
    }
  }

  await db.close();
  console.log('\n✅ purge-pre-production-transactions finished');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
