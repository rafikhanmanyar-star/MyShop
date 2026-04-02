import { describe, it, expect } from 'vitest';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineReturnTotal(lineSubtotal: number, soldQty: number, returnQty: number): number {
  if (soldQty <= 0 || returnQty <= 0) return 0;
  return roundMoney((lineSubtotal / soldQty) * returnQty);
}

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
