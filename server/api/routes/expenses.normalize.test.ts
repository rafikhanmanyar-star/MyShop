import { describe, it, expect } from 'vitest';
import { normalizeExpenseBody } from './expenses.js';

describe('normalizeExpenseBody', () => {
  it('maps legacy payment labels to CASH, BANK, OTHER', () => {
    expect(normalizeExpenseBody({ paymentMethod: 'Cash' }).paymentMethod).toBe('CASH');
    expect(normalizeExpenseBody({ paymentMethod: 'Bank' }).paymentMethod).toBe('BANK');
    expect(normalizeExpenseBody({ paymentMethod: 'Credit' }).paymentMethod).toBe('OTHER');
  });

  it('passes through uppercase codes', () => {
    expect(normalizeExpenseBody({ paymentMethod: 'CASH' }).paymentMethod).toBe('CASH');
    expect(normalizeExpenseBody({ paymentMethod: 'OTHER' }).paymentMethod).toBe('OTHER');
  });
});
