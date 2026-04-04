import { describe, it, expect } from 'vitest';
import {
  allocateDiscountAcrossLines,
  computeBundleBasePrice,
  computeOfferBundlePricing,
  roundMoney,
} from './offerPricing.js';

describe('offerPricing', () => {
  it('computes bundle base', () => {
    expect(computeBundleBasePrice([{ unitPrice: 10, quantity: 2 }, { unitPrice: 5, quantity: 1 }])).toBe(25);
  });

  it('percentage discount', () => {
    const { finalSubtotal, discountFromBase } = computeOfferBundlePricing(
      'discount',
      'percentage',
      20,
      null,
      100
    );
    expect(discountFromBase).toBe(20);
    expect(finalSubtotal).toBe(80);
  });

  it('fixed bundle price', () => {
    const { finalSubtotal, discountFromBase } = computeOfferBundlePricing(
      'bundle',
      null,
      null,
      99,
      120
    );
    expect(finalSubtotal).toBe(99);
    expect(discountFromBase).toBe(21);
  });

  it('allocates discount across lines with rounding fix', () => {
    const lines = [
      { unitPrice: 10, quantity: 1 },
      { unitPrice: 10, quantity: 1 },
    ];
    const d = allocateDiscountAcrossLines(lines, 5);
    expect(roundMoney(d.reduce((a, b) => a + b, 0))).toBe(5);
  });
});
