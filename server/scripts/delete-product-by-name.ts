/**
 * Find tenant by company/name hint + product by name/sku hint; report counts; optionally delete
 * related POS sales, mobile orders, sales returns, purchase bills, inventory rows, then the product.
 *
 * From server/:
 *   npx tsx scripts/delete-product-by-name.ts --dry
 *   npx tsx scripts/delete-product-by-name.ts --execute
 *
 * Optional env: TENANT_COMPANY_HINT (default obo), PRODUCT_HINT (default erasdf)
 */
import dotenv from 'dotenv';
dotenv.config();

import { getDatabaseService } from '../services/databaseService.js';
import { runWithTenantContext } from '../services/tenantContext.js';

const TENANT_HINT = process.env.TENANT_COMPANY_HINT?.trim() || 'obo';
const PRODUCT_HINT = process.env.PRODUCT_HINT?.trim() || 'erasdf';

async function main() {
  const execute = process.argv.includes('--execute');

  const db = getDatabaseService();
  if (!db.getPool()) throw new Error('DATABASE_URL / Postgres pool not available');

  const tenants = await db.query(
    `SELECT id, name, company_name, email
     FROM tenants
     WHERE company_name ILIKE $1 OR name ILIKE $1
     ORDER BY created_at ASC`,
    [`%${TENANT_HINT}%`]
  );

  if (tenants.length === 0) {
    console.log(`No tenant matching company/name hint: "${TENANT_HINT}"`);
    process.exit(1);
  }
  if (tenants.length > 1) {
    console.log('Multiple tenants matched; set TENANT_COMPANY_HINT or use exact company name:');
    console.table(tenants.map((t: any) => ({ id: t.id, name: t.name, company_name: t.company_name })));
    process.exit(1);
  }

  const tenantId = (tenants[0] as any).id as string;
  console.log('Tenant:', { id: tenantId, name: (tenants[0] as any).name, company_name: (tenants[0] as any).company_name });

  await runWithTenantContext({ tenantId }, async () => {
  const products = await db.query(
    `SELECT id, name, sku, barcode, created_at
     FROM shop_products
     WHERE tenant_id = $1
       AND (name ILIKE $2 OR sku ILIKE $2 OR barcode ILIKE $2)
     ORDER BY created_at ASC`,
    [tenantId, `%${PRODUCT_HINT}%`]
  );

  if (products.length === 0) {
    console.log(`No product matching hint "${PRODUCT_HINT}" for this tenant.`);
    process.exit(1);
  }
  if (products.length > 1) {
    console.log('Multiple products matched; set PRODUCT_HINT to a narrower string or exact sku:');
    console.table(products);
    process.exit(1);
  }

  const productId = (products[0] as any).id as string;
  console.log('Product:', products[0]);

  const count = async (label: string, sql: string) => {
    const r = await db.query(sql, [tenantId, productId]);
    const n = Number((r[0] as any)?.c ?? 0);
    console.log(`  ${label}: ${n}`);
  };

  console.log('\nRelated row counts:');
  await count('shop_sale_items', `SELECT COUNT(*)::int AS c FROM shop_sale_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('shop_sales (distinct)', `SELECT COUNT(DISTINCT sale_id)::int AS c FROM shop_sale_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('shop_sales_return_items', `SELECT COUNT(*)::int AS c FROM shop_sales_return_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('mobile_order_items', `SELECT COUNT(*)::int AS c FROM mobile_order_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('mobile_orders (distinct)', `SELECT COUNT(DISTINCT order_id)::int AS c FROM mobile_order_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('purchase_bill_items', `SELECT COUNT(*)::int AS c FROM purchase_bill_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('purchase_bills (distinct)', `SELECT COUNT(DISTINCT purchase_bill_id)::int AS c FROM purchase_bill_items WHERE tenant_id = $1 AND product_id = $2`);
  await count('inventory_batches', `SELECT COUNT(*)::int AS c FROM inventory_batches WHERE tenant_id = $1 AND product_id = $2`);
  await count('shop_inventory_movements', `SELECT COUNT(*)::int AS c FROM shop_inventory_movements WHERE tenant_id = $1 AND product_id = $2`);
  await count('shop_inventory', `SELECT COUNT(*)::int AS c FROM shop_inventory WHERE tenant_id = $1 AND product_id = $2`);
  try {
    await count(
      'procurement_demand_draft_items',
      `SELECT COUNT(*)::int AS c FROM procurement_demand_draft_items WHERE tenant_id = $1 AND product_id = $2`
    );
  } catch {
    console.log('  procurement_demand_draft_items: (table missing — skipped)');
  }

  if (!execute) {
    console.log('\nDry run (no changes). Pass --execute after backup to delete.');
    return;
  }

  await db.transaction(async (client) => {
    const q = (sql: string, params?: unknown[]) => client.query(sql, params);

    const saleIds: string[] = (
      await q(`SELECT DISTINCT sale_id FROM shop_sale_items WHERE tenant_id = $1 AND product_id = $2`, [tenantId, productId])
    ).map((r: any) => r.sale_id);

    const mobileOrderIds: string[] = (
      await q(`SELECT DISTINCT order_id FROM mobile_order_items WHERE tenant_id = $1 AND product_id = $2`, [tenantId, productId])
    ).map((r: any) => r.order_id);

    const billIds: string[] = (
      await q(`SELECT DISTINCT purchase_bill_id FROM purchase_bill_items WHERE tenant_id = $1 AND product_id = $2`, [
        tenantId,
        productId,
      ])
    ).map((r: any) => r.purchase_bill_id);

    const returnIdsFromProduct: string[] = (
      await q(`SELECT DISTINCT sales_return_id FROM shop_sales_return_items WHERE tenant_id = $1 AND product_id = $2`, [
        tenantId,
        productId,
      ])
    ).map((r: any) => r.sales_return_id);

    const returnIdsFromSales: string[] =
      saleIds.length > 0
        ? (
            await q(
              `SELECT DISTINCT r.id FROM shop_sales_returns r WHERE r.tenant_id = $1 AND r.original_sale_id = ANY($2::text[])`,
              [tenantId, saleIds]
            )
          ).map((r: any) => r.id)
        : [];

    const returnIdsFromMobile: string[] =
      mobileOrderIds.length > 0
        ? (
            await q(
              `SELECT DISTINCT r.id FROM shop_sales_returns r WHERE r.tenant_id = $1 AND r.original_mobile_order_id = ANY($2::text[])`,
              [tenantId, mobileOrderIds]
            )
          ).map((r: any) => r.id)
        : [];

    const allReturnIds = [...new Set([...returnIdsFromProduct, ...returnIdsFromSales, ...returnIdsFromMobile])];

    if (allReturnIds.length > 0) {
      await q(
        `DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND type = 'SaleReturn' AND reference_id = ANY($2::text[])`,
        [tenantId, allReturnIds]
      );
      await q(
        `DELETE FROM journal_entries WHERE tenant_id = $1 AND source_module = 'SALES_RETURN' AND source_id = ANY($2::text[])`,
        [tenantId, allReturnIds]
      );
      await q(`DELETE FROM shop_sales_returns WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, allReturnIds]);
    }

    if (mobileOrderIds.length > 0) {
      await q(
        `DELETE FROM journal_entries WHERE tenant_id = $1 AND source_module = 'MobileApp' AND source_id = ANY($2::text[])`,
        [tenantId, mobileOrderIds]
      );
      await q(
        `DELETE FROM shop_inventory_movements
         WHERE tenant_id = $1 AND reference_id = ANY($2::text[])
           AND type IN ('Reserve', 'MobileSale', 'ReleaseReserve')`,
        [tenantId, mobileOrderIds]
      );
      await q(`DELETE FROM mobile_orders WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, mobileOrderIds]);
    }

    if (billIds.length > 0) {
      await q(
        `DELETE FROM journal_entries WHERE tenant_id = $1 AND source_module = 'Purchases' AND source_id = ANY($2::text[])`,
        [tenantId, billIds]
      );
      await q(
        `DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND type = 'Purchase' AND reference_id = ANY($2::text[])`,
        [tenantId, billIds]
      );
      await q(`DELETE FROM purchase_bills WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, billIds]);
    }

    if (saleIds.length > 0) {
      await q(
        `DELETE FROM journal_entries WHERE tenant_id = $1 AND source_module = 'POS' AND source_id = ANY($2::text[])`,
        [tenantId, saleIds]
      );
      await q(
        `DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND type = 'Sale' AND reference_id = ANY($2::text[])`,
        [tenantId, saleIds]
      );
      await q(`DELETE FROM shop_sales WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, saleIds]);
    }

    await q(`DELETE FROM shop_inventory_movements WHERE tenant_id = $1 AND product_id = $2`, [tenantId, productId]);
    await q(`DELETE FROM inventory_batches WHERE tenant_id = $1 AND product_id = $2`, [tenantId, productId]);

    try {
      await q(`DELETE FROM procurement_demand_draft_items WHERE tenant_id = $1 AND product_id = $2`, [tenantId, productId]);
    } catch {
      /* optional table */
    }

    await q(`DELETE FROM shop_products WHERE tenant_id = $1 AND id = $2`, [tenantId, productId]);
  });

  console.log('\n✅ Transaction committed: removed related documents and product row.');
  });

  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
