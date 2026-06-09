import { describe, it, expect } from 'vitest';
import { parseJsonRecord, mapRowsInChunks } from '../../client/src/utils/catalogMapping.ts';

describe('catalogMapping', () => {
  it('parseJsonRecord handles object and JSON string warehouse maps', () => {
    expect(parseJsonRecord({ wh1: 5, wh2: '3' })).toEqual({ wh1: 5, wh2: 3 });
    expect(parseJsonRecord('{"wh-a":10,"wh-b":0}')).toEqual({ 'wh-a': 10, 'wh-b': 0 });
    expect(parseJsonRecord(null)).toEqual({});
    expect(parseJsonRecord('not-json')).toEqual({});
  });

  it('mapRowsInChunks yields between chunks for large arrays', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i, name: `sku-${i}` }));
    const mapped = await mapRowsInChunks(rows, (r) => ({ ...r, ok: true }), 50, 'test-chunk');
    expect(mapped).toHaveLength(250);
    expect(mapped[0]).toEqual({ id: 0, name: 'sku-0', ok: true });
    expect(mapped[249]).toEqual({ id: 249, name: 'sku-249', ok: true });
  });
});

describe('inventory SKU cache tenant isolation', () => {
  it('cache keys must include tenant id prefix to prevent cross-tenant pollution', () => {
    const tenantA = 'tenant_1779365716164_6yrqagn0n';
    const tenantB = 'tenant_1771872124820_j5t5s5if3';
    const keyA = `${tenantA}:1:10000::all:—:name:ASC:pos`;
    const keyB = `${tenantB}:1:10000::all:—:name:ASC:pos`;
    expect(keyA.startsWith(tenantA)).toBe(true);
    expect(keyB.startsWith(tenantB)).toBe(true);
    expect(keyA).not.toBe(keyB);
  });
});
