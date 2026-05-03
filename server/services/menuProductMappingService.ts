import { getDatabaseService } from './databaseService.js';
import type { IDatabaseService } from './databaseService.js';

/** Heuristic grocery aisle / category for shopping list grouping. */
export function inferIngredientCategory(
  ingredientName: string,
  productCategoryName: string | null
): string {
  const hay = `${ingredientName} ${productCategoryName || ''}`.toLowerCase();

  if (/(goat|mutton|beef|chicken|meat|fish|prawn|lamb|keema)/.test(hay)) return 'meat';
  if (/(milk|dahi|yogurt|egg|butter|cream|cheese|dairy)/.test(hay)) return 'dairy_eggs';
  if (/(onion|tomato|potato|vegetable|coriander|mint|ginger|garlic|lemon|fruit|produce|salad|basil|herb)/.test(hay))
    return 'produce';
  if (/(masala|spice|powder|cumin|coriander seed|garam|turmeric|chili flakes)/.test(hay)) return 'spices';
  if (/(rice|flour|atta|oil|pulse|daal|lentil|chickpea|gram|basmati|pasta|noodle)/.test(hay)) return 'pantry';

  const pc = (productCategoryName || '').toLowerCase();
  if (/(veg|fruit|fresh)/.test(pc)) return 'produce';
  if (/(dairy|egg|milk)/.test(pc)) return 'dairy_eggs';
  if (/(meat|poultry|seafood)/.test(pc)) return 'meat';

  return 'other';
}

function normalizeName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const SELLABLE_SQL = `COALESCE(p.mobile_visible, TRUE) = TRUE
         AND COALESCE(p.is_active, TRUE) = TRUE AND COALESCE(p.sales_deactivated, FALSE) = FALSE`;

export type ProductMatchStatus = 'matched' | 'partial_match' | 'not_found';
export type AvailabilityType = 'in_shop' | 'external_market';

export interface IngredientProductResolution {
  matched_product_id: string | null;
  suggested_product_id: string | null;
  product_match_status: ProductMatchStatus;
  availability_type: AvailabilityType;
  category: string;
  matched_product_name: string | null;
}

function categorySqlPredicate(cat: string): string {
  switch (cat) {
    case 'produce':
      return `(LOWER(COALESCE(c.name, '')) LIKE '%vegetable%' OR LOWER(COALESCE(c.name, '')) LIKE '%fruit%'
               OR LOWER(COALESCE(c.name, '')) LIKE '%fresh%' OR LOWER(COALESCE(c.name, '')) LIKE '%produce%')`;
    case 'dairy_eggs':
      return `(LOWER(COALESCE(c.name, '')) LIKE '%dairy%' OR LOWER(COALESCE(c.name, '')) LIKE '%egg%'
               OR LOWER(COALESCE(c.name, '')) LIKE '%milk%' OR LOWER(COALESCE(c.name, '')) LIKE '%yogurt%')`;
    case 'meat':
      return `(LOWER(COALESCE(c.name, '')) LIKE '%meat%' OR LOWER(COALESCE(c.name, '')) LIKE '%poultry%'
               OR LOWER(COALESCE(c.name, '')) LIKE '%fish%' OR LOWER(COALESCE(c.name, '')) LIKE '%seafood%')`;
    case 'spices':
      return `(LOWER(COALESCE(c.name, '')) LIKE '%spice%' OR LOWER(COALESCE(c.name, '')) LIKE '%masala%')`;
    case 'pantry':
      return `(LOWER(COALESCE(c.name, '')) LIKE '%grocery%' OR LOWER(COALESCE(c.name, '')) LIKE '%dry%'
               OR LOWER(COALESCE(c.name, '')) LIKE '%staple%')`;
    default:
      return `TRUE`;
  }
}

export class MenuProductMappingService {
  constructor(private db: IDatabaseService = getDatabaseService()) {}

  /**
   * Resolve catalog product with match quality + shop availability.
   * Order: preferred recipe product (sellable) → exact name → fuzzy LIKE → recipe-ingredient alias → category heuristic.
   * Non-sellable recipe product becomes suggested_product_id while searching for a sellable alternative.
   */
  async resolveIngredientProductMatch(
    tenantId: string,
    ingredientName: string,
    normalizedName: string,
    preferredProductId: string | null
  ): Promise<IngredientProductResolution> {
    const displayName = String(ingredientName || '').trim() || String(normalizedName || '').trim();
    let suggestedProductId: string | null = null;
    const norm = normalizeName(normalizedName || ingredientName);
    const like = `%${norm.replace(/%/g, '\\%')}%`;
    const inferredCat = inferIngredientCategory(displayName, null);

    const asResult = (
      matchedId: string | null,
      suggestedId: string | null,
      status: ProductMatchStatus,
      avail: AvailabilityType,
      productName: string | null
    ): IngredientProductResolution => ({
      matched_product_id: matchedId,
      suggested_product_id: suggestedId,
      product_match_status: status,
      availability_type: avail,
      category: inferIngredientCategory(displayName, productName),
      matched_product_name: productName,
    });

    if (preferredProductId?.trim()) {
      const prefRows = await this.db.query(
        `SELECT p.id, p.name, c.name AS category_name,
                CASE WHEN ${SELLABLE_SQL} THEN TRUE ELSE FALSE END AS is_sellable
         FROM shop_products p
         LEFT JOIN shop_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.id = $2
         LIMIT 1`,
        [tenantId, preferredProductId.trim()]
      );
      if (prefRows.length > 0) {
        const pr = prefRows[0] as any;
        if (pr.is_sellable) {
          return asResult(pr.id, null, 'matched', 'in_shop', pr.name);
        }
        suggestedProductId = pr.id;
      }
    }

    const exact = await this.db.query(
      `SELECT p.id, p.name, c.name AS category_name
       FROM shop_products p
       LEFT JOIN shop_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND ${SELLABLE_SQL}
         AND LOWER(TRIM(p.name)) = $2
       LIMIT 1`,
      [tenantId, norm]
    );
    if (exact.length > 0) {
      const r = exact[0] as any;
      return asResult(r.id, suggestedProductId, 'matched', 'in_shop', r.name);
    }

    const fuzzy = await this.db.query(
      `SELECT p.id, p.name, c.name AS category_name
       FROM shop_products p
       LEFT JOIN shop_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND ${SELLABLE_SQL}
         AND (
           LOWER(p.name) LIKE $2
           OR LOWER(p.name) LIKE $3
         )
       ORDER BY LENGTH(p.name) ASC
       LIMIT 1`,
      [tenantId, like, `${norm}%`]
    );
    if (fuzzy.length > 0) {
      const r = fuzzy[0] as any;
      return asResult(r.id, suggestedProductId, 'partial_match', 'in_shop', r.name);
    }

    const fromRecipes = await this.db.query(
      `SELECT ri.product_id, p.name, c.name AS category_name, COUNT(*) AS cnt
       FROM recipe_ingredients ri
       JOIN shop_products p ON p.id = ri.product_id AND p.tenant_id = ri.tenant_id
       LEFT JOIN shop_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE ri.tenant_id = $1 AND ri.normalized_name = $2 AND ${SELLABLE_SQL}
       GROUP BY ri.product_id, p.name, c.name
       ORDER BY cnt DESC
       LIMIT 1`,
      [tenantId, norm]
    );
    if (fromRecipes.length > 0) {
      const r = fromRecipes[0] as any;
      return asResult(r.product_id, suggestedProductId, 'partial_match', 'in_shop', r.name);
    }

    const catExpr = categorySqlPredicate(inferredCat);
    const lastToken = norm.split(' ').filter(Boolean).pop() || norm;
    const tokenLike = `%${lastToken.replace(/%/g, '\\%')}%`;
    const catRows = await this.db.query(
      `SELECT p.id, p.name, c.name AS category_name
       FROM shop_products p
       LEFT JOIN shop_categories c ON c.id = p.category_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND ${SELLABLE_SQL}
         AND (${catExpr})
         AND (LOWER(p.name) LIKE $2 OR LOWER(p.name) LIKE $3)
       ORDER BY LENGTH(p.name) ASC
       LIMIT 1`,
      [tenantId, tokenLike, like]
    );
    if (catRows.length > 0) {
      const r = catRows[0] as any;
      return asResult(r.id, suggestedProductId, 'partial_match', 'in_shop', r.name);
    }

    return asResult(null, suggestedProductId, 'not_found', 'external_market', null);
  }

  /** @deprecated use resolveIngredientProductMatch */
  async resolveProductForIngredient(
    tenantId: string,
    ingredientName: string,
    normalizedName: string,
    preferredProductId: string | null
  ): Promise<{ product_id: string | null; category: string; product_name: string | null }> {
    const r = await this.resolveIngredientProductMatch(
      tenantId,
      ingredientName,
      normalizedName,
      preferredProductId
    );
    return {
      product_id: r.matched_product_id,
      category: r.category,
      product_name: r.matched_product_name,
    };
  }
}

let _inst: MenuProductMappingService | null = null;
export function getMenuProductMappingService(): MenuProductMappingService {
  if (!_inst) _inst = new MenuProductMappingService();
  return _inst;
}
