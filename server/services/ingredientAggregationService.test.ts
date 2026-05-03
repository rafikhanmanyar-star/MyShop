import { describe, it, expect } from 'vitest';
import { aggregateIngredients, fromBaseQuantity } from './ingredientAggregationService.js';

describe('ingredientAggregationService', () => {
  it('merges same ingredient in g and kg', () => {
    const merged = aggregateIngredients([
      {
        ingredient_name: 'Rice',
        normalized_name: 'rice',
        quantity: 500,
        unit: 'g',
        product_id: 'p1',
      },
      {
        ingredient_name: 'Rice',
        normalized_name: 'rice',
        quantity: 0.3,
        unit: 'kg',
        product_id: 'p1',
      },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].quantity).toBe(800);
    expect(merged[0].unit).toBe('g');
  });

  it('converts tsp to ml base and merges tbsp', () => {
    const merged = aggregateIngredients([
      {
        ingredient_name: 'Oil',
        normalized_name: 'oil',
        quantity: 2,
        unit: 'tsp',
        product_id: null,
      },
      {
        ingredient_name: 'Oil',
        normalized_name: 'oil',
        quantity: 1,
        unit: 'tbsp',
        product_id: null,
      },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].unit).toBe('ml');
    expect(merged[0].quantity).toBe(25);
  });

  it('fromBaseQuantity promotes ml to l', () => {
    const r = fromBaseQuantity(1500, 'ml');
    expect(r.unit).toBe('l');
    expect(r.quantity).toBeCloseTo(1.5, 2);
  });

  it('skips optional ingredients', () => {
    const merged = aggregateIngredients([
      {
        ingredient_name: 'Chili',
        normalized_name: 'chili',
        quantity: 2,
        unit: 'piece',
        product_id: 'x',
        optional: true,
      },
    ]);
    expect(merged.length).toBe(0);
  });
});
