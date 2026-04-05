import { describe, it, expect } from 'vitest';
import { assertRowsAffected } from './assertRows.js';

describe('assertRowsAffected', () => {
  it('throws when no rows', () => {
    expect(() => assertRowsAffected([], 'no rows')).toThrow('no rows');
  });

  it('returns rows when non-empty', () => {
    expect(assertRowsAffected([{ a: 1 }], 'x')).toEqual([{ a: 1 }]);
  });
});
