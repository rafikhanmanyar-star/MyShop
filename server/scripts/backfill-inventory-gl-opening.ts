/**
 * One-time backfill: true up the General Ledger "Merchandise Inventory" account so it equals the
 * live inventory valuation (Σ quantity_on_hand × cost).
 *
 * WHY: Opening stock and manual stock adjustments historically updated shop_inventory WITHOUT any
 * GL entry — only purchase bills debit Merchandise Inventory and sales credit it via COGS. As a
 * result the GL inventory asset can read ~0 even when real stock exists. Going forward,
 * shopService.adjustInventory now posts GL entries; this script fixes the EXISTING gap once.
 *
 * WHAT IT POSTS (per tenant): a single balancing journal entry for the remaining gap:
 *   gap = inventory_valuation − current_GL_inventory_balance
 *     gap > 0  → Dr Merchandise Inventory (11301) / Cr Opening Balance Equity (31005)
 *     gap < 0  → Dr Opening Balance Equity (31005) / Cr Merchandise Inventory (11301)
 * The offset is Opening Balance Equity, so the correction never distorts revenue / COGS / profit.
 *
 * IDEMPOTENT: the gap is recomputed from the current GL each run, so after a successful backfill a
 * re-run posts nothing (gap ≈ 0).
 *
 * Usage (from repo root):
 *   Dry run (no writes, prints the gap per tenant):
 *     DATABASE_URL="postgres://…" INV_BACKFILL_DRY_RUN=true npm run backfill-inventory-gl --prefix server
 *
 *   Live (single tenant recommended):
 *     DATABASE_URL="postgres://…" TENANT_ID="your-tenant-id" npm run backfill-inventory-gl --prefix server
 *
 *   Live (all tenants):
 *     DATABASE_URL="postgres://…" npm run backfill-inventory-gl --prefix server
 */

import dotenv from 'dotenv';

dotenv.config();

import { getDatabaseService } from '../services/databaseService.js';
import { getAccountingService } from '../services/accountingService.js';
import { runWithTenantContext } from '../services/tenantContext.js';
import { COA } from '../constants/accountCodes.js';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function backfillOneTenant(opts: { tenantId: string; dryRun: boolean }) {
  const { tenantId, dryRun } = opts;

  await runWithTenantContext({ tenantId }, async () => {
    const db = getDatabaseService();

    const valRows = await db.query(
      `SELECT COALESCE(SUM(i.quantity_on_hand * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0) AS total_value
       FROM shop_products p
       JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.is_active = TRUE`,
      [tenantId]
    );
    const valuation = round2(parseFloat(valRows[0]?.total_value) || 0);

    const glRows = await db.query(
      `SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) AS inv_balance
       FROM ledger_entries le
       JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
       WHERE le.tenant_id = $1 AND (a.code LIKE '113%' OR a.code = 'AST-110')`,
      [tenantId]
    );
    const glInventory = round2(parseFloat(glRows[0]?.inv_balance) || 0);

    const gap = round2(valuation - glInventory);

    console.log(
      `\nTenant ${tenantId} — valuation: ${valuation.toFixed(2)}, GL inventory: ${glInventory.toFixed(2)}, gap: ${gap.toFixed(2)}`
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
      const invAccId = await accounting.getOrCreateAccountByCode(
        tenantId, COA.MERCHANDISE_INVENTORY, 'Merchandise Inventory', 'Asset', client
      );
      const equityAccId = await accounting.getOrCreateAccountByCode(
        tenantId, COA.OPENING_BALANCE_EQUITY, 'Opening Balance Equity', 'Equity', client
      );

      const amount = Math.abs(gap);
      const invIsDebit = gap > 0;
      const ref = `INV-OPENING-BACKFILL-${Date.now()}`;
      const desc = 'Opening inventory backfill — sync Merchandise Inventory to live valuation';

      const jRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, NOW(), $2, $3, 'Inventory', $4, 'Posted') RETURNING id`,
        [tenantId, ref, desc, `opening-${tenantId}`]
      );
      const journalId = jRes[0].id;

      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, journalId, invAccId, invIsDebit ? amount : 0, invIsDebit ? 0 : amount]
      );
      await client.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, journalId, equityAccId, invIsDebit ? 0 : amount, invIsDebit ? amount : 0]
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      console.log(`  ✅ Posted balancing entry ${ref} for ${gap.toFixed(2)}.`);
    });
  });
}

async function main() {
  const dryRun = /^true$/i.test(process.env.INV_BACKFILL_DRY_RUN || '');

  console.log('='.repeat(72));
  console.log('backfill-inventory-gl-opening');
  console.log(`mode: ${dryRun ? 'DRY RUN — no writes' : 'LIVE — posts balancing journal entries'}`);
  console.log('='.repeat(72));

  const db = getDatabaseService();
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
      await backfillOneTenant({ tenantId: t.id, dryRun });
    } catch (e) {
      console.error(`❌ Tenant ${t.id} failed:`, e);
      throw e;
    }
  }

  await db.close();
  console.log('\n✅ backfill-inventory-gl-opening finished');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
