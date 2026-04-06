/**
 * FEFO batch deductions, sellable quantity, procurement batches, return restock.
 */

export interface FefoDeductionResult {
  weightedUnitCost: number | null;
  lines: { batchId: string; qty: number; unitCost: number }[];
}

async function hasBatchRows(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM inventory_batches
     WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
     LIMIT 1`,
    [tenantId, productId, warehouseId]
  );
  return r.length > 0;
}

/** Sum of quantity_remaining on non-expired batches (NULL expiry = legacy / no date). */
export async function getSellableBatchSum(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string
): Promise<number> {
  const r = await client.query(
    `SELECT COALESCE(SUM(quantity_remaining), 0)::numeric AS s
     FROM inventory_batches
     WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
       AND quantity_remaining > 0
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)`,
    [tenantId, productId, warehouseId]
  );
  return parseFloat(String(r[0]?.s ?? 0)) || 0;
}

/**
 * Sellable units for reservation / POS: batch-based when batches exist, else legacy shop_inventory.
 */
export async function getSellableQuantityForWarehouse(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string
): Promise<number> {
  const hasBatches = await hasBatchRows(client, tenantId, productId, warehouseId);
  const inv = await client.query(
    `SELECT quantity_on_hand, quantity_reserved
     FROM shop_inventory
     WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3`,
    [tenantId, productId, warehouseId]
  );
  if (inv.length === 0) return 0;
  const reserved = parseFloat(String(inv[0].quantity_reserved ?? 0)) || 0;

  let sellableRaw: number;
  if (hasBatches) {
    sellableRaw = await getSellableBatchSum(client, tenantId, productId, warehouseId);
  } else {
    const onHand = parseFloat(String(inv[0].quantity_on_hand ?? 0)) || 0;
    sellableRaw = Math.max(0, onHand);
  }
  return Math.max(0, sellableRaw - reserved);
}

export async function hasOnlyExpiredRemaining(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string
): Promise<boolean> {
  const r = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE THEN quantity_remaining ELSE 0 END), 0)::numeric AS expired_rem,
       COALESCE(SUM(CASE WHEN expiry_date IS NULL OR expiry_date >= CURRENT_DATE THEN quantity_remaining ELSE 0 END), 0)::numeric AS good_rem
     FROM inventory_batches
     WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
       AND quantity_remaining > 0`,
    [tenantId, productId, warehouseId]
  );
  if (r.length === 0) return false;
  const expiredRem = parseFloat(String(r[0].expired_rem ?? 0)) || 0;
  const goodRem = parseFloat(String(r[0].good_rem ?? 0)) || 0;
  return expiredRem > 0 && goodRem <= 0;
}

/**
 * Deduct qty using FEFO (non-expired batches first; NULL expiry last). Updates batches + shop_inventory.
 */
export async function deductInventoryFefo(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  _referenceLabel: string
): Promise<FefoDeductionResult> {
  if (quantity <= 0) {
    throw new Error('Deduction quantity must be positive');
  }

  const hasBatches = await hasBatchRows(client, tenantId, productId, warehouseId);
  if (!hasBatches) {
    const inv = await client.query(
      `SELECT quantity_on_hand FROM shop_inventory
       WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
       FOR UPDATE`,
      [tenantId, productId, warehouseId]
    );
    if (inv.length === 0) {
      throw new Error('Insufficient stock');
    }
    const onHand = parseFloat(String(inv[0].quantity_on_hand ?? 0)) || 0;
    if (onHand < quantity) {
      throw new Error(`Insufficient stock. Available: ${onHand}, requested: ${quantity}`);
    }
    await client.query(
      `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
       WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
      [quantity, tenantId, productId, warehouseId]
    );
    return { weightedUnitCost: null, lines: [] };
  }

  const sellable = await getSellableBatchSum(client, tenantId, productId, warehouseId);
  if (sellable < quantity) {
    const onlyExpired = await hasOnlyExpiredRemaining(client, tenantId, productId, warehouseId);
    if (onlyExpired || sellable <= 0) {
      throw new Error('Expired product cannot be sold');
    }
    throw new Error(`Insufficient stock. Sellable: ${sellable}, requested: ${quantity}`);
  }

  const rows = await client.query(
    `SELECT id, quantity_remaining, cost_price, expiry_date
     FROM inventory_batches
     WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
       AND quantity_remaining > 0
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
     ORDER BY expiry_date ASC NULLS LAST, created_at ASC
     FOR UPDATE`,
    [tenantId, productId, warehouseId]
  );

  let need = quantity;
  const lines: { batchId: string; qty: number; unitCost: number }[] = [];
  let costSum = 0;
  let qtySum = 0;

  for (const row of rows) {
    if (need <= 0) break;
    const rem = parseFloat(String(row.quantity_remaining ?? 0)) || 0;
    if (rem <= 0) continue;
    const take = Math.min(rem, need);
    const uc = parseFloat(String(row.cost_price ?? 0)) || 0;
    await client.query(
      `UPDATE inventory_batches
       SET quantity_remaining = quantity_remaining - $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [take, row.id, tenantId]
    );
    lines.push({ batchId: row.id, qty: take, unitCost: uc });
    costSum += take * uc;
    qtySum += take;
    need -= take;
  }

  if (need > 0) {
    throw new Error('Insufficient stock (batch allocation incomplete)');
  }

  await client.query(
    `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
     WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
    [quantity, tenantId, productId, warehouseId]
  );

  const weightedUnitCost = qtySum > 0 ? costSum / qtySum : null;
  return {
    weightedUnitCost: Number.isFinite(weightedUnitCost as number) ? weightedUnitCost : null,
    lines,
  };
}

/** Insert batch from purchase line; bumps shop_inventory (caller already did weighted product cost). */
export async function insertPurchaseBatch(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string,
  billId: string,
  quantity: number,
  unitCost: number,
  expiryDate: string,
  batchNo: string
): Promise<string> {
  const ins = await client.query(
    `INSERT INTO inventory_batches (
       tenant_id, product_id, warehouse_id, batch_no, expiry_date,
       quantity_received, quantity_remaining, cost_price, purchase_bill_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $6, $7, $8)
     RETURNING id`,
    [tenantId, productId, warehouseId, batchNo, expiryDate, quantity, unitCost, billId]
  );
  if (!ins.length) throw new Error('Failed to create inventory batch');
  return ins[0].id as string;
}

export async function reverseBatchesForPurchaseBill(
  client: any,
  tenantId: string,
  billId: string,
  warehouseId: string
): Promise<void> {
  const batches = await client.query(
    `SELECT product_id, quantity_remaining
     FROM inventory_batches
     WHERE tenant_id = $1 AND purchase_bill_id = $2`,
    [tenantId, billId]
  );
  for (const b of batches) {
    const q = parseFloat(String(b.quantity_remaining ?? 0)) || 0;
    if (q <= 0) continue;
    await client.query(
      `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
       WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
      [q, tenantId, b.product_id, warehouseId]
    );
  }
  const neg = await client.query(
    `SELECT product_id, quantity_on_hand FROM shop_inventory
     WHERE tenant_id = $1 AND warehouse_id = $2 AND quantity_on_hand < 0 LIMIT 1`,
    [tenantId, warehouseId]
  );
  if (neg.length > 0) {
    throw new Error('Cannot reverse bill: resulting inventory would be negative. Reduce sold quantities or adjust stock first.');
  }
  await client.query(`DELETE FROM inventory_batches WHERE tenant_id = $1 AND purchase_bill_id = $2`, [
    tenantId,
    billId,
  ]);
}

/** Restock from sales return: batch row only (caller updates shop_inventory). */
export async function insertReturnRestockBatch(
  client: any,
  tenantId: string,
  productId: string,
  warehouseId: string,
  quantity: number,
  unitCost: number | null,
  returnId: string
): Promise<void> {
  const batchNo = `RET-${returnId.slice(0, 8)}`;
  const cost = unitCost != null && unitCost > 0 ? unitCost : 0;
  await client.query(
    `INSERT INTO inventory_batches (
       tenant_id, product_id, warehouse_id, batch_no, expiry_date,
       quantity_received, quantity_remaining, cost_price, purchase_bill_id
     ) VALUES ($1, $2, $3, $4, NULL, $5, $5, $6, NULL)`,
    [tenantId, productId, warehouseId, batchNo, quantity, cost]
  );
}
