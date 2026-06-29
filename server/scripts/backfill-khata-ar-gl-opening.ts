/**
 * One-time backfill: true up GL Trade Receivables so Accounting "Accounts Receivable"
 * matches Khata Ledger "Total Receivables" (gross debtors).
 *
 * WHY: Historical khata was migrated without matching journal entries. Khata payments credited
 * GL AR without corresponding debits from migrated sales, understating Trade Receivables.
 * New POS khata sales post correctly; this script fixes the EXISTING gap once.
 *
 * TARGET (per tenant):
 *   khata_gross  = Σ customer balances where balance > 0 (same as Khata page)
 *   display_ar   = GL Trade Receivables + customer_advances (same as Accounting page)
 *   gap          = khata_gross − display_ar
 *
 * POSTS:
 *   gap > 0  → Dr Trade Receivables (11201) / Cr Opening Balance Equity (31005)
 *   gap < 0  → Dr Opening Balance Equity (31005) / Cr Trade Receivables (11201)
 *
 * IDEMPOTENT: gap is recomputed each run; after success a re-run posts nothing.
 *
 * Usage (from repo root):
 *   Dry run:
 *     AR_BACKFILL_DRY_RUN=true npm run backfill-khata-ar-gl --prefix server
 *
 *   Live (single tenant):
 *     TENANT_ID="your-tenant-id" npm run backfill-khata-ar-gl --prefix server
 *
 *   Live (all tenants):
 *     npm run backfill-khata-ar-gl --prefix server
 */

import dotenv from 'dotenv';

dotenv.config();

import { getDatabaseService } from '../services/databaseService.js';
import { getAccountingService } from '../services/accountingService.js';
import { runWithTenantContext } from '../services/tenantContext.js';
import { COA } from '../constants/accountCodes.js';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function khataGrossReceivables(db: ReturnType<typeof getDatabaseService>, tenantId: string): Promise<number> {
  const rows = await db.query(
    `SELECT COALESCE(SUM(positive_balance), 0) AS gross
     FROM (
       SELECT GREATEST(0,
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0)
       ) AS positive_balance
       FROM khata_ledger WHERE tenant_id = $1
       GROUP BY customer_id
     ) sub`,
    [tenantId]
  );
  return round2(parseFloat(rows[0]?.gross) || 0);
}

async function customerAdvances(db: ReturnType<typeof getDatabaseService>, tenantId: string): Promise<number> {
  const rows = await db.query(
    `SELECT COALESCE(SUM(credit_balance), 0) AS total_advances
     FROM (
       SELECT customer_id,
         SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)
         - SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) AS credit_balance
       FROM khata_ledger WHERE tenant_id = $1
       GROUP BY customer_id
       HAVING SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)
         - SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) > 0
     ) sub`,
    [tenantId]
  );
  return round2(parseFloat(rows[0]?.total_advances) || 0);
}

async function glTradeReceivables(db: ReturnType<typeof getDatabaseService>, tenantId: string): Promise<number> {
  const rows = await db.query(
    `SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) AS ar_balance
     FROM ledger_entries le
     JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
     WHERE le.tenant_id = $1 AND (a.code = $2 OR a.code = 'AST-120')`,
    [tenantId, COA.TRADE_RECEIVABLES]
  );
  return round2(parseFloat(rows[0]?.ar_balance) || 0);
}

async function backfillOneTenant(opts: { tenantId: string; dryRun: boolean }) {
  const { tenantId, dryRun } = opts;

  await runWithTenantContext({ tenantId }, async () => {
    const db = getDatabaseService();

    let khataGross = 0;
    let advances = 0;
    try {
      khataGross = await khataGrossReceivables(db, tenantId);
      advances = await customerAdvances(db, tenantId);
    } catch (e: any) {
      if (/khata_ledger/i.test(String(e?.message || e))) {
        console.log(`\nTenant ${tenantId} — no khata_ledger table, skipping.`);
        return;
      }
      throw e;
    }

    const glAr = await glTradeReceivables(db, tenantId);
    const displayAr = round2(glAr + advances);
    const gap = round2(khataGross - displayAr);

    console.log(
      `\nTenant ${tenantId}`,
      `\n  Khata gross receivables: ${khataGross.toFixed(2)}`,
      `\n  GL Trade Receivables:    ${glAr.toFixed(2)}`,
      `\n  Customer advances:       ${advances.toFixed(2)}`,
      `\n  Accounting AR (display): ${displayAr.toFixed(2)}`,
      `\n  Gap:                     ${gap.toFixed(2)}`
    );

    if (Math.abs(gap) < 0.01) {
      console.log('  ✓ Already in sync — nothing to post.');
      return;
    }

    if (dryRun) {
      console.log(`  (dry run) would post a balancing entry of ${gap.toFixed(2)}.`);
      return;
    }

    await db.transaction(async (client: any) => {
      const accounting = getAccountingService();
      const arAccId = await accounting.getOrCreateAccountByCode(
        tenantId, COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset', client
      );
      const equityAccId = await accounting.getOrCreateAccountByCode(
        tenantId, COA.OPENING_BALANCE_EQUITY, 'Opening Balance Equity', 'Equity', client
      );

      const amount = Math.abs(gap);
      const arIsDebit = gap > 0;
      const ref = `AR-KHATA-BACKFILL-${Date.now()}`;
      const desc = 'Khata receivables backfill — sync Trade Receivables to Khata Ledger gross balance';

      const jRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, NOW(), $2, $3, 'Khata', $4, 'Posted') RETURNING id`,
        [tenantId, ref, desc, `khata-ar-${tenantId}`]
      );
      const journalId = jRes[0].id;

      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, journalId, arAccId, arIsDebit ? amount : 0, arIsDebit ? 0 : amount]
      );
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, journalId, equityAccId, arIsDebit ? 0 : amount, arIsDebit ? amount : 0]
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      console.log(`  ✅ Posted balancing entry ${ref} for ${gap.toFixed(2)}.`);
    });
  });
}

async function main() {
  const dryRun = /^true$/i.test(process.env.AR_BACKFILL_DRY_RUN || '');

  console.log('='.repeat(72));
  console.log('backfill-khata-ar-gl-opening');
  console.log(`mode: ${dryRun ? 'DRY RUN — no writes' : 'LIVE — posts balancing journal entries'}`);
  console.log('='.repeat(72));

  const db = getDatabaseService();
  const singleTenant = process.env.TENANT_ID?.trim() || '';

  let tenantRows: { id: string; name?: string }[];
  if (singleTenant) {
    tenantRows = await db.query(`SELECT id, name FROM tenants WHERE id = $1`, [singleTenant]);
    if (tenantRows.length === 0) {
      console.error(`No tenant found for TENANT_ID=${singleTenant}`);
      process.exit(1);
    }
  } else {
    tenantRows = await db.query(`SELECT id, name FROM tenants ORDER BY created_at ASC`);
  }

  for (const t of tenantRows) {
    try {
      if (t.name) console.log(`\n--- ${t.name} ---`);
      await backfillOneTenant({ tenantId: t.id, dryRun });
    } catch (e) {
      console.error(`❌ Tenant ${t.id} failed:`, e);
      throw e;
    }
  }

  await db.close();
  console.log('\n✅ backfill-khata-ar-gl-opening finished');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
