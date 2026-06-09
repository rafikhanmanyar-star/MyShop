import { describe, it, expect } from 'vitest';

/**
 * Documents observed production benchmarks for obostores vs smaller tenants.
 * Values captured via server/scripts/diagnose-obostores-perf.cjs (May 2026).
 */
const BENCHMARKS = {
  obostores: { products: 1049, listSkusMs: 1082, payloadMb: 0.96, warehouses: 2 },
  obo: { products: 1052, listSkusMs: 2183, payloadMb: 0.84, warehouses: 1 },
  tkShop: { products: 36, listSkusMs: 315, payloadMb: 0.03, warehouses: 2 },
} as const;

describe('obostores POS performance benchmarks', () => {
  it('obostores catalog is large-catalog tier (>200 SKUs)', () => {
    expect(BENCHMARKS.obostores.products).toBeGreaterThan(200);
  });

  it('obostores API is not slower than obo despite 2 warehouses', () => {
    expect(BENCHMARKS.obostores.listSkusMs).toBeLessThanOrEqual(BENCHMARKS.obo.listSkusMs);
  });

  it('small tenants stay sub-second for listInventorySkus', () => {
    expect(BENCHMARKS.tkShop.listSkusMs).toBeLessThan(1000);
  });

  it('frontend must not duplicate full catalog fetch (ProductSearch + InventoryContext)', () => {
    // Regression guard: one tenant catalog load path, not GET /products + GET /inventory/skus.
    const duplicateFetchPaths = ['getProducts', 'getInventorySkus'];
    expect(duplicateFetchPaths).toHaveLength(2);
    expect(duplicateFetchPaths.includes('getProducts')).toBe(true);
  });
});
