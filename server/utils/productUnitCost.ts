/**
 * Resolve per-unit inventory cost from a product row (same rules as POS COGS).
 * Prefers positive average_cost; otherwise cost_price.
 */
export function resolveUnitCostFromProductRow(
  row: { average_cost?: unknown; cost_price?: unknown } | null | undefined
): number {
  if (!row) return 0;
  const acRaw = row.average_cost;
  if (acRaw != null && Number(acRaw) > 0) return Number(acRaw);
  const cp = Number(row.cost_price) || 0;
  return cp > 0 ? cp : 0;
}

export async function fetchUnitCostForProduct(
  client: { query: (sql: string, params: unknown[]) => Promise<unknown[]> },
  tenantId: string,
  productId: string
): Promise<number> {
  const prodRes = (await client.query(
    'SELECT average_cost, cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [productId, tenantId]
  )) as { average_cost?: unknown; cost_price?: unknown }[];
  if (prodRes.length === 0) return 0;
  return resolveUnitCostFromProductRow(prodRes[0]);
}
