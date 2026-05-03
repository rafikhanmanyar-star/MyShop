/**
 * Merge recipe ingredient lines across multiple recipes with serving multipliers
 * and canonical unit normalization (g, ml, count).
 */

export interface RawIngredientLine {
  ingredient_name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
  product_id: string | null;
  optional?: boolean;
}

export interface AggregatedIngredientLine {
  merge_key: string;
  ingredient_name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
  /** When sources disagree, keep first non-null product_id */
  product_id: string | null;
}

function normalizeUnit(raw: string): string {
  const u = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '');
  if (!u) return 'piece';
  const map: Record<string, string> = {
    gram: 'g',
    grams: 'g',
    g: 'g',
    kg: 'kg',
    kilo: 'kg',
    kilogram: 'kg',
    kilograms: 'kg',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    millilitre: 'ml',
    l: 'l',
    liter: 'l',
    litres: 'l',
    liters: 'l',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    pcs: 'piece',
    pc: 'piece',
    piece: 'piece',
    pieces: 'piece',
    unit: 'piece',
    bunch: 'bunch',
    pinch: 'pinch',
  };
  return map[u] ?? u;
}

/** Convert quantity to canonical base for merging within the same family. */
export function convertToBaseQuantity(quantity: number, unit: string): { baseQty: number; baseUnit: string } {
  const u = normalizeUnit(unit);
  if (!Number.isFinite(quantity) || quantity <= 0) return { baseQty: 0, baseUnit: u };

  switch (u) {
    case 'kg':
      return { baseQty: quantity * 1000, baseUnit: 'g' };
    case 'g':
      return { baseQty: quantity, baseUnit: 'g' };
    case 'l':
      return { baseQty: quantity * 1000, baseUnit: 'ml' };
    case 'ml':
      return { baseQty: quantity, baseUnit: 'ml' };
    case 'tbsp':
      return { baseQty: quantity * 15, baseUnit: 'ml' };
    case 'tsp':
      return { baseQty: quantity * 5, baseUnit: 'ml' };
    default:
      return { baseQty: quantity, baseUnit: u };
  }
}

/** Pick display unit when base is large (g -> kg, ml -> l). */
export function fromBaseQuantity(baseQty: number, baseUnit: string): { quantity: number; unit: string } {
  if (baseUnit === 'g' && baseQty >= 1000) {
    return { quantity: Math.round((baseQty / 1000) * 1000) / 1000, unit: 'kg' };
  }
  if (baseUnit === 'ml' && baseQty >= 1000) {
    return { quantity: Math.round((baseQty / 1000) * 1000) / 1000, unit: 'l' };
  }
  return {
    quantity: Math.round(baseQty * 1000) / 1000,
    unit: baseUnit,
  };
}

function mergeKey(normalizedName: string, baseUnit: string): string {
  return `${normalizedName}::${baseUnit}`;
}

/**
 * Aggregates lines that share the same normalized name and compatible mass/volume base units.
 * Optional ingredients are included but callers may filter.
 */
export function aggregateIngredients(lines: RawIngredientLine[]): AggregatedIngredientLine[] {
  const buckets = new Map<
    string,
    { baseQty: number; baseUnit: string; label: string; norm: string; product_id: string | null }
  >();

  for (const line of lines) {
    if (line.optional) continue;
    const name = String(line.ingredient_name || '').trim();
    const norm = String(line.normalized_name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!name && !norm) continue;
    const { baseQty, baseUnit } = convertToBaseQuantity(line.quantity, line.unit);
    if (baseQty <= 0) continue;

    const key = mergeKey(norm || name.toLowerCase(), baseUnit);
    const existing = buckets.get(key);
    const displayName = name || norm;

    if (!existing) {
      buckets.set(key, {
        baseQty,
        baseUnit,
        label: displayName,
        norm: norm || name.toLowerCase(),
        product_id: line.product_id,
      });
    } else {
      existing.baseQty += baseQty;
      if (!existing.product_id && line.product_id) existing.product_id = line.product_id;
    }
  }

  const out: AggregatedIngredientLine[] = [];
  for (const [, v] of buckets) {
    const { quantity, unit } = fromBaseQuantity(v.baseQty, v.baseUnit);
    out.push({
      merge_key: mergeKey(v.norm, v.baseUnit),
      ingredient_name: v.label,
      normalized_name: v.norm,
      quantity,
      unit,
      product_id: v.product_id,
    });
  }

  out.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));
  return out;
}
