import { describe, it, expect } from 'vitest';
import { computeNextReturnNumber } from './salesReturnService.js';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineReturnTotal(lineSubtotal: number, soldQty: number, returnQty: number): number {
  if (soldQty <= 0 || returnQty <= 0) return 0;
  return roundMoney((lineSubtotal / soldQty) * returnQty);
}

describe('computeNextReturnNumber', () => {
  it('starts at SR-00001 when empty', () => {
    expect(computeNextReturnNumber([])).toBe('SR-00001');
  });

  it('uses max suffix + 1, not row count (gaps / deletes)', () => {
    expect(computeNextReturnNumber(['SR-00001', 'SR-00005'])).toBe('SR-00006');
    expect(computeNextReturnNumber(['SR-00001', 'SR-00003'])).toBe('SR-00004');
  });

  it('ignores non-SR patterns', () => {
    expect(computeNextReturnNumber(['RET-99', 'SR-00002'])).toBe('SR-00003');
  });
});

describe('sales return line totals', () => {
  it('proportional to original line subtotal', () => {
    expect(lineReturnTotal(100, 10, 2)).toBe(20);
    expect(lineReturnTotal(99.99, 3, 1)).toBe(33.33);
  });

  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.235)).toBe(1.24);
  });
});
