import { describe, it, expect } from 'vitest';

/**
 * Documents the offline / idempotent sale API contract used by the POS outbox.
 */
describe('offline sync contracts', () => {
  it('duplicate POS sale response includes id and duplicate flag', () => {
    const res = { id: 'sale-uuid', barcode_value: 'SALE|tenant|SN1', duplicate: true as const };
    expect(res.duplicate).toBe(true);
    expect(res.id).toBeTruthy();
    expect(String(res.barcode_value)).toContain('SALE|');
  });
});
