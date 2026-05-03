import { getDatabaseService } from './databaseService.js';
import { mobileProductSellableStockSql } from './mobileOrderService.js';

function normalizeIngredientName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slugify(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'recipe';
}

function safeNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

export interface RecipeIngredientInput {
  id?: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  optional?: boolean;
  product_id: string;
  sort_order?: number;
}

export interface RecipeStepInput {
  id?: string;
  step_number: number;
  instruction: string;
  image_url?: string | null;
}

export interface RecipeCreateInput {
  title: string;
  description?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  difficulty?: string | null;
  cuisine?: string | null;
  calories?: number | null;
  category_id?: string | null;
  is_active?: boolean;
  is_featured?: boolean;
  is_quick_meal?: boolean;
  is_budget_meal?: boolean;
  is_trending?: boolean;
  ingredients: RecipeIngredientInput[];
  steps: RecipeStepInput[];
}

export class RecipeService {
  private db = getDatabaseService();

  private async uniqueSlug(tenantId: string, base: string, excludeRecipeId?: string): Promise<string> {
    let slug = slugify(base);
    let n = 0;
    while (true) {
      const trySlug = n === 0 ? slug : `${slug}-${n}`;
      const rows = await this.db.query(
        `SELECT id FROM recipes WHERE tenant_id = $1 AND slug = $2 ${excludeRecipeId ? 'AND id <> $3' : ''}`,
        excludeRecipeId ? [tenantId, trySlug, excludeRecipeId] : [tenantId, trySlug]
      );
      if (rows.length === 0) return trySlug;
      n += 1;
    }
  }

  async assertUniqueTitle(tenantId: string, title: string, excludeRecipeId?: string): Promise<void> {
    const rows = await this.db.query(
      `SELECT id FROM recipes
       WHERE tenant_id = $1 AND LOWER(TRIM(title)) = LOWER(TRIM($2)) ${excludeRecipeId ? 'AND id <> $3' : ''}`,
      excludeRecipeId ? [tenantId, title, excludeRecipeId] : [tenantId, title]
    );
    if (rows.length > 0) {
      throw new Error('A recipe with this title already exists');
    }
  }

  async createRecipe(tenantId: string, userId: string | null, input: RecipeCreateInput): Promise<string> {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Title is required');
    if (!input.ingredients?.length) throw new Error('At least one ingredient is required');
    for (const ing of input.ingredients) {
      if (!String(ing.product_id || '').trim()) throw new Error('Each ingredient must be linked to a product');
      if (!String(ing.ingredient_name || '').trim()) throw new Error('Each ingredient needs a name');
    }
    await this.assertUniqueTitle(tenantId, title);
    const slug = await this.uniqueSlug(tenantId, title);

    const id = crypto.randomUUID();
    const servings = Math.max(1, Math.round(safeNum(input.servings, 1)));

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO recipes (
          id, tenant_id, title, slug, description, image_url, video_url,
          prep_time_minutes, cook_time_minutes, servings, difficulty, cuisine, calories,
          category_id, is_active, is_featured, is_quick_meal, is_budget_meal, is_trending, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
        )`,
        [
          id,
          tenantId,
          title,
          slug,
          input.description ?? null,
          input.image_url ?? null,
          input.video_url ?? null,
          Math.max(0, Math.round(safeNum(input.prep_time_minutes, 0))),
          Math.max(0, Math.round(safeNum(input.cook_time_minutes, 0))),
          servings,
          input.difficulty ?? null,
          input.cuisine ?? null,
          input.calories != null ? Math.round(safeNum(input.calories, 0)) : null,
          input.category_id ?? null,
          input.is_active !== false,
          !!input.is_featured,
          !!input.is_quick_meal,
          !!input.is_budget_meal,
          !!input.is_trending,
          userId,
        ]
      );

      let sort = 0;
      for (const ing of input.ingredients) {
        const pid = String(ing.product_id).trim();
        const prod = await client.query(
          'SELECT id FROM shop_products WHERE id = $1 AND tenant_id = $2',
          [pid, tenantId]
        );
        if (prod.length === 0) throw new Error(`Product not found for ingredient: ${ing.ingredient_name}`);
        const ingId = crypto.randomUUID();
        const norm = normalizeIngredientName(ing.ingredient_name);
        await client.query(
          `INSERT INTO recipe_ingredients (
            id, tenant_id, recipe_id, ingredient_name, normalized_name, quantity, unit, optional, product_id, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            ingId,
            tenantId,
            id,
            String(ing.ingredient_name).trim(),
            norm,
            safeNum(ing.quantity, 1),
            String(ing.unit || '').trim(),
            !!ing.optional,
            pid,
            sort++,
          ]
        );
      }

      for (const st of input.steps) {
        const sid = crypto.randomUUID();
        await client.query(
          `INSERT INTO recipe_steps (id, tenant_id, recipe_id, step_number, instruction, image_url)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            sid,
            tenantId,
            id,
            Math.max(1, Math.round(safeNum(st.step_number, 1))),
            String(st.instruction || '').trim(),
            st.image_url ?? null,
          ]
        );
      }
    });

    return id;
  }

  async updateRecipe(tenantId: string, recipeId: string, input: RecipeCreateInput): Promise<void> {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Title is required');
    if (!input.ingredients?.length) throw new Error('At least one ingredient is required');
    for (const ing of input.ingredients) {
      if (!String(ing.product_id || '').trim()) throw new Error('Each ingredient must be linked to a product');
      if (!String(ing.ingredient_name || '').trim()) throw new Error('Each ingredient needs a name');
    }
    await this.assertUniqueTitle(tenantId, title, recipeId);

    const existing = await this.db.query(
      'SELECT id, slug FROM recipes WHERE id = $1 AND tenant_id = $2',
      [recipeId, tenantId]
    );
    if (existing.length === 0) throw new Error('Recipe not found');

    let slug = existing[0].slug as string;
    const oldRows = await this.db.query(
      'SELECT LOWER(TRIM(title)) AS t FROM recipes WHERE id = $1',
      [recipeId]
    );
    const oldTitle = oldRows[0]?.t as string;
    if (oldTitle !== title.trim().toLowerCase()) {
      slug = await this.uniqueSlug(tenantId, title, recipeId);
    }

    const servings = Math.max(1, Math.round(safeNum(input.servings, 1)));

    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE recipes SET
          title = $2, slug = $3, description = $4, image_url = $5, video_url = $6,
          prep_time_minutes = $7, cook_time_minutes = $8, servings = $9,
          difficulty = $10, cuisine = $11, calories = $12, category_id = $13,
          is_active = $14, is_featured = $15, is_quick_meal = $16, is_budget_meal = $17, is_trending = $18,
          updated_at = NOW()
        WHERE id = $1 AND tenant_id = $19`,
        [
          recipeId,
          title,
          slug,
          input.description ?? null,
          input.image_url ?? null,
          input.video_url ?? null,
          Math.max(0, Math.round(safeNum(input.prep_time_minutes, 0))),
          Math.max(0, Math.round(safeNum(input.cook_time_minutes, 0))),
          servings,
          input.difficulty ?? null,
          input.cuisine ?? null,
          input.calories != null ? Math.round(safeNum(input.calories, 0)) : null,
          input.category_id ?? null,
          input.is_active !== false,
          !!input.is_featured,
          !!input.is_quick_meal,
          !!input.is_budget_meal,
          !!input.is_trending,
          tenantId,
        ]
      );

      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1 AND tenant_id = $2', [
        recipeId,
        tenantId,
      ]);
      await client.query('DELETE FROM recipe_steps WHERE recipe_id = $1 AND tenant_id = $2', [recipeId, tenantId]);

      let sort = 0;
      for (const ing of input.ingredients) {
        const pid = String(ing.product_id).trim();
        const prod = await client.query(
          'SELECT id FROM shop_products WHERE id = $1 AND tenant_id = $2',
          [pid, tenantId]
        );
        if (prod.length === 0) throw new Error(`Product not found for ingredient: ${ing.ingredient_name}`);
        const ingId = crypto.randomUUID();
        const norm = normalizeIngredientName(ing.ingredient_name);
        await client.query(
          `INSERT INTO recipe_ingredients (
            id, tenant_id, recipe_id, ingredient_name, normalized_name, quantity, unit, optional, product_id, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            ingId,
            tenantId,
            recipeId,
            String(ing.ingredient_name).trim(),
            norm,
            safeNum(ing.quantity, 1),
            String(ing.unit || '').trim(),
            !!ing.optional,
            pid,
            sort++,
          ]
        );
      }

      for (const st of input.steps) {
        const sid = crypto.randomUUID();
        await client.query(
          `INSERT INTO recipe_steps (id, tenant_id, recipe_id, step_number, instruction, image_url)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            sid,
            tenantId,
            recipeId,
            Math.max(1, Math.round(safeNum(st.step_number, 1))),
            String(st.instruction || '').trim(),
            st.image_url ?? null,
          ]
        );
      }
    });
  }

  async deleteRecipe(tenantId: string, recipeId: string): Promise<void> {
    await this.db.execute('DELETE FROM recipes WHERE id = $1 AND tenant_id = $2', [recipeId, tenantId]);
  }

  async listAdminRecipes(
    tenantId: string,
    opts: { search?: string; category_id?: string; is_active?: boolean; limit?: number; offset?: number }
  ) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [tenantId];
    let wh = 'WHERE r.tenant_id = $1';
    let p = 2;

    if (opts.search?.trim()) {
      wh += ` AND (r.title ILIKE $${p} OR r.cuisine ILIKE $${p})`;
      params.push(`%${opts.search.trim()}%`);
      p++;
    }
    if (opts.category_id) {
      wh += ` AND r.category_id = $${p}`;
      params.push(opts.category_id);
      p++;
    }
    if (opts.is_active === true) wh += ' AND r.is_active = TRUE';
    if (opts.is_active === false) wh += ' AND r.is_active = FALSE';

    const countRows = await this.db.query(`SELECT COUNT(*) AS c FROM recipes r ${wh}`, params);
    const total = Number(countRows[0]?.c ?? 0);

    params.push(limit, offset);
    const rows = await this.db.query(
      `SELECT r.*, c.name AS category_name
       FROM recipes r
       LEFT JOIN recipe_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
       ${wh}
       ORDER BY r.updated_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      params
    );

    return { items: rows, total, limit, offset };
  }

  async getAdminRecipe(tenantId: string, recipeId: string) {
    const recipes = await this.db.query(
      `SELECT r.*, c.name AS category_name
       FROM recipes r
       LEFT JOIN recipe_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [recipeId, tenantId]
    );
    if (recipes.length === 0) return null;
    const ingredients = await this.db.query(
      `SELECT ri.*, p.name AS product_name, p.sku AS product_sku
       FROM recipe_ingredients ri
       JOIN shop_products p ON p.id = ri.product_id AND p.tenant_id = ri.tenant_id
       WHERE ri.recipe_id = $1 AND ri.tenant_id = $2
       ORDER BY ri.sort_order ASC, ri.ingredient_name ASC`,
      [recipeId, tenantId]
    );
    const steps = await this.db.query(
      `SELECT * FROM recipe_steps WHERE recipe_id = $1 AND tenant_id = $2 ORDER BY step_number ASC`,
      [recipeId, tenantId]
    );
    return { recipe: recipes[0], ingredients, steps };
  }

  // --- Mobile ---

  async listMobileRecipes(
    tenantId: string,
    opts: {
      category_id?: string;
      search?: string;
      trending?: boolean;
      featured?: boolean;
      quick?: boolean;
      budget?: boolean;
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = Math.min(60, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [tenantId];
    let wh = 'WHERE r.tenant_id = $1 AND r.is_active = TRUE';
    let p = 2;

    if (opts.category_id) {
      wh += ` AND r.category_id = $${p}`;
      params.push(opts.category_id);
      p++;
    }
    if (opts.trending) wh += ' AND r.is_trending = TRUE';
    if (opts.featured) wh += ' AND r.is_featured = TRUE';
    if (opts.quick) wh += ' AND (r.is_quick_meal = TRUE OR (r.prep_time_minutes + r.cook_time_minutes) <= 30)';
    if (opts.budget) wh += ' AND r.is_budget_meal = TRUE';

    const q = opts.search?.trim();
    if (q) {
      wh += ` AND (
        r.title ILIKE $${p}
        OR r.cuisine ILIKE $${p}
        OR EXISTS (
          SELECT 1 FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.id AND ri.tenant_id = r.tenant_id
            AND (ri.ingredient_name ILIKE $${p} OR ri.normalized_name ILIKE $${p + 1})
        )
      )`;
      const low = `%${q}%`;
      const norm = `%${normalizeIngredientName(q)}%`;
      params.push(low, norm);
      p += 2;
    }

    const countRows = await this.db.query(`SELECT COUNT(*) AS c FROM recipes r ${wh}`, params);
    const total = Number(countRows[0]?.c ?? 0);

    params.push(limit, offset);
    const rows = await this.db.query(
      `SELECT r.id, r.title, r.slug, r.description, r.image_url, r.prep_time_minutes, r.cook_time_minutes,
              r.servings, r.difficulty, r.cuisine, r.calories, r.category_id,
              r.is_featured, r.is_quick_meal, r.is_budget_meal, r.is_trending,
              c.name AS category_name
       FROM recipes r
       LEFT JOIN recipe_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
       ${wh}
       ORDER BY r.is_featured DESC, r.updated_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      params
    );

    return { items: rows, total, limit, offset };
  }

  async getMobileRecipeDetail(tenantId: string, recipeId: string, customerId?: string | null) {
    const recipes = await this.db.query(
      `SELECT r.*, c.name AS category_name
       FROM recipes r
       LEFT JOIN recipe_categories c ON c.id = r.category_id AND c.tenant_id = r.tenant_id
       WHERE r.id = $1 AND r.tenant_id = $2 AND r.is_active = TRUE`,
      [recipeId, tenantId]
    );
    if (recipes.length === 0) return null;

    const stockExpr = mobileProductSellableStockSql();
    const ingredients = await this.db.query(
      `SELECT ri.id, ri.ingredient_name, ri.normalized_name, ri.quantity, ri.unit, ri.optional, ri.product_id, ri.sort_order,
              p.name AS product_name, p.sku AS product_sku,
              COALESCE(p.mobile_price, p.retail_price) AS product_price,
              ${stockExpr} AS available_stock,
              p.image_url AS product_image_url,
              p.tax_rate,
              p.mobile_visible,
              p.is_active AS product_is_active,
              p.sales_deactivated
       FROM recipe_ingredients ri
       JOIN shop_products p ON p.id = ri.product_id AND p.tenant_id = ri.tenant_id
       WHERE ri.recipe_id = $1 AND ri.tenant_id = $2
       ORDER BY ri.sort_order ASC, ri.ingredient_name ASC`,
      [recipeId, tenantId]
    );

    const steps = await this.db.query(
      `SELECT id, step_number, instruction, image_url FROM recipe_steps
       WHERE recipe_id = $1 AND tenant_id = $2 ORDER BY step_number ASC`,
      [recipeId, tenantId]
    );

    let saved = false;
    if (customerId) {
      const s = await this.db.query(
        'SELECT 1 FROM user_saved_recipes WHERE tenant_id = $1 AND user_id = $2 AND recipe_id = $3',
        [tenantId, customerId, recipeId]
      );
      saved = s.length > 0;
    }

    return { recipe: recipes[0], ingredients, steps, saved };
  }

  /**
   * Build merged cart lines for recipe ingredients. Quantities scale by servings / recipe.servings.
   * Only includes sellable mobile-visible products (same rules as catalog).
   */
  async generateCartForRecipe(
    tenantId: string,
    recipeId: string,
    targetServings?: number
  ): Promise<
    {
      product_id: string;
      product_name: string;
      quantity: number;
      sku?: string;
      price: number;
      tax_rate: number;
      image_url: string | null;
      available_stock: number;
    }[]
  > {
    const rRows = await this.db.query(
      'SELECT id, servings, is_active FROM recipes WHERE id = $1 AND tenant_id = $2',
      [recipeId, tenantId]
    );
    if (rRows.length === 0) throw new Error('Recipe not found');
    if (!rRows[0].is_active) throw new Error('Recipe is not available');

    const baseServings = Math.max(1, Math.round(safeNum(rRows[0].servings, 1)));
    const scale =
      targetServings != null && targetServings > 0 ? targetServings / baseServings : 1;

    const stockExpr = mobileProductSellableStockSql();
    const lines = await this.db.query(
      `SELECT ri.product_id, ri.ingredient_name, ri.quantity AS ing_qty, ri.optional,
              p.name AS product_name, p.sku,
              COALESCE(p.mobile_price, p.retail_price) AS price,
              p.tax_rate, p.image_url,
              ${stockExpr} AS available_stock,
              p.mobile_visible, p.is_active AS product_is_active, p.sales_deactivated
       FROM recipe_ingredients ri
       JOIN shop_products p ON p.id = ri.product_id AND p.tenant_id = ri.tenant_id
       WHERE ri.recipe_id = $1 AND ri.tenant_id = $2`,
      [recipeId, tenantId]
    );

    const byProduct = new Map<
      string,
      {
        product_id: string;
        product_name: string;
        quantity: number;
        sku?: string;
        price: number;
        tax_rate: number;
        image_url: string | null;
        available_stock: number;
      }
    >();

    for (const row of lines) {
      if (!row.mobile_visible || !row.product_is_active || row.sales_deactivated) {
        continue;
      }
      const price = safeNum(row.price, 0);
      if (price <= 0) continue;

      const qtyRaw = safeNum(row.ing_qty, 1) * scale;
      const qty = Math.round(qtyRaw * 10000) / 10000;
      const merged = Math.max(0.0001, qty);

      const pid = row.product_id as string;
      const stock = safeNum(row.available_stock, 0);
      const existing = byProduct.get(pid);
      const name = row.product_name as string;
      if (existing) {
        existing.quantity = Math.round((existing.quantity + merged) * 10000) / 10000;
      } else {
        byProduct.set(pid, {
          product_id: pid,
          product_name: name,
          quantity: merged,
          sku: row.sku ?? undefined,
          price,
          tax_rate: safeNum(row.tax_rate, 0),
          image_url: row.image_url ?? null,
          available_stock: stock,
        });
      }
    }

    if (byProduct.size === 0) {
      throw new Error('No ingredients are available for purchase right now');
    }

    return Array.from(byProduct.values());
  }

  async saveRecipeForUser(tenantId: string, userId: string, recipeId: string): Promise<void> {
    const r = await this.db.query(
      'SELECT id FROM recipes WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE',
      [recipeId, tenantId]
    );
    if (r.length === 0) throw new Error('Recipe not found');

    await this.db.execute(
      `INSERT INTO user_saved_recipes (id, tenant_id, user_id, recipe_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, recipe_id) DO NOTHING`,
      [crypto.randomUUID(), tenantId, userId, recipeId]
    );
  }

  async unsaveRecipeForUser(tenantId: string, userId: string, recipeId: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM user_saved_recipes WHERE tenant_id = $1 AND user_id = $2 AND recipe_id = $3',
      [tenantId, userId, recipeId]
    );
  }

  async listSavedRecipes(
    tenantId: string,
    userId: string,
    opts: { limit?: number; offset?: number }
  ) {
    const limit = Math.min(60, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);

    const countRows = await this.db.query(
      'SELECT COUNT(*) AS c FROM user_saved_recipes WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId]
    );
    const total = Number(countRows[0]?.c ?? 0);

    const rows = await this.db.query(
      `SELECT r.id, r.title, r.slug, r.image_url, r.prep_time_minutes, r.cook_time_minutes, r.servings, r.difficulty,
              us.created_at AS saved_at
       FROM user_saved_recipes us
       JOIN recipes r ON r.id = us.recipe_id AND r.tenant_id = us.tenant_id
       WHERE us.tenant_id = $1 AND us.user_id = $2 AND r.is_active = TRUE
       ORDER BY us.created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, userId, limit, offset]
    );
    return { items: rows, total, limit, offset };
  }

  // --- Categories (admin) ---

  async listCategories(tenantId: string) {
    return this.db.query(
      `SELECT * FROM recipe_categories WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
  }

  async createCategory(tenantId: string, name: string, image_url?: string | null) {
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO recipe_categories (id, tenant_id, name, image_url) VALUES ($1, $2, $3, $4)`,
      [id, tenantId, String(name).trim(), image_url ?? null]
    );
    return id;
  }

  async updateCategory(tenantId: string, catId: string, data: { name?: string; image_url?: string | null }) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (data.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(String(data.name).trim());
    }
    if (data.image_url !== undefined) {
      sets.push(`image_url = $${i++}`);
      params.push(data.image_url);
    }
    if (!sets.length) return;
    sets.push('updated_at = NOW()');
    params.push(catId, tenantId);
    await this.db.execute(
      `UPDATE recipe_categories SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
      params
    );
  }

  async deleteCategory(tenantId: string, catId: string): Promise<void> {
    await this.db.execute(
      'UPDATE recipes SET category_id = NULL WHERE tenant_id = $1 AND category_id = $2',
      [tenantId, catId]
    );
    await this.db.execute('DELETE FROM recipe_categories WHERE id = $1 AND tenant_id = $2', [catId, tenantId]);
  }
}

let _recipe: RecipeService | null = null;
export function getRecipeService(): RecipeService {
  if (!_recipe) _recipe = new RecipeService();
  return _recipe;
}
