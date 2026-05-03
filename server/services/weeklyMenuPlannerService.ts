import { getDatabaseService } from './databaseService.js';
import type { IDatabaseService } from './databaseService.js';
import { aggregateIngredients, type RawIngredientLine } from './ingredientAggregationService.js';
import { getMenuProductMappingService } from './menuProductMappingService.js';
import { mobileProductSellableStockSql } from './mobileOrderService.js';

const MEALS_PER_WEEK = 21; // 7 * 3 main meals; snacks add more in UI

function safeNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function newId(): string {
  return crypto.randomUUID();
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface CreateMenuInput {
  title: string;
  week_start_date: string; // ISO date YYYY-MM-DD
}

export interface AddMenuItemInput {
  day_of_week: number;
  meal_type: MealType;
  recipe_id?: string | null;
  custom_meal_name?: string | null;
  servings?: number;
  notes?: string | null;
}

export interface MoveMenuItemInput {
  day_of_week: number;
  meal_type: MealType;
  sort_order?: number;
}

/** Rough macro split when DB has only calories (display estimates). */
function estimateMacrosFromCalories(kcal: number): { protein_g: number; carbs_g: number; fat_g: number } {
  if (!kcal || kcal <= 0) return { protein_g: 0, carbs_g: 0, fat_g: 0 };
  return {
    protein_g: Math.round((kcal * 0.15) / 4),
    carbs_g: Math.round((kcal * 0.55) / 4),
    fat_g: Math.round((kcal * 0.3) / 9),
  };
}

export class WeeklyMenuPlannerService {
  constructor(private db: IDatabaseService = getDatabaseService()) {}

  async assertMenuOwner(tenantId: string, customerId: string, menuId: string): Promise<any> {
    const rows = await this.db.query(
      `SELECT * FROM weekly_menus
       WHERE id = $1 AND tenant_id = $2 AND customer_id = $3 AND deleted_at IS NULL`,
      [menuId, tenantId, customerId]
    );
    if (rows.length === 0) throw new Error('Menu not found');
    return rows[0];
  }

  async assertItemOwner(tenantId: string, customerId: string, itemId: string): Promise<any> {
    const rows = await this.db.query(
      `SELECT wmi.* FROM weekly_menu_items wmi
       JOIN weekly_menus wm ON wm.id = wmi.weekly_menu_id AND wm.tenant_id = wmi.tenant_id
       WHERE wmi.id = $1 AND wmi.tenant_id = $2 AND wm.customer_id = $3 AND wm.deleted_at IS NULL`,
      [itemId, tenantId, customerId]
    );
    if (rows.length === 0) throw new Error('Menu item not found');
    return rows[0];
  }

  private async logEvent(tenantId: string, customerId: string, eventType: string, payload: Record<string, unknown>) {
    try {
      const id = newId();
      const payloadJson = JSON.stringify(payload);
      if (this.db.getType() === 'postgres') {
        await this.db.query(
          `INSERT INTO menu_planner_events (id, tenant_id, customer_id, event_type, payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [id, tenantId, customerId, eventType, payloadJson]
        );
      } else {
        await this.db.query(
          `INSERT INTO menu_planner_events (id, tenant_id, customer_id, event_type, payload)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, tenantId, customerId, eventType, payloadJson]
        );
      }
    } catch {
      /* ignore analytics failures */
    }
  }

  async createMenu(tenantId: string, customerId: string, input: CreateMenuInput): Promise<string> {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Title is required');
    const weekStart = String(input.week_start_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('week_start_date must be YYYY-MM-DD');

    const id = newId();
    const dateVal =
      this.db.getType() === 'postgres'
        ? `INSERT INTO weekly_menus (id, tenant_id, customer_id, title, week_start_date, status)
           VALUES ($1, $2, $3, $4, $5::date, 'draft')`
        : `INSERT INTO weekly_menus (id, tenant_id, customer_id, title, week_start_date, status)
           VALUES ($1, $2, $3, $4, $5, 'draft')`;
    await this.db.query(dateVal, [id, tenantId, customerId, title, weekStart]);
    await this.logEvent(tenantId, customerId, 'menu_created', { weekly_menu_id: id });
    return id;
  }

  async listMenus(
    tenantId: string,
    customerId: string,
    opts: { week_start_date?: string; limit?: number; offset?: number }
  ) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [tenantId, customerId];
    let wh = 'WHERE wm.tenant_id = $1 AND wm.customer_id = $2 AND wm.deleted_at IS NULL';
    let p = 3;
    if (opts.week_start_date?.trim()) {
      wh +=
        this.db.getType() === 'postgres'
          ? ` AND wm.week_start_date = $${p}::date`
          : ` AND wm.week_start_date = $${p}`;
      params.push(opts.week_start_date.trim());
      p++;
    }
    const countRows = await this.db.query(`SELECT COUNT(*) AS c FROM weekly_menus wm ${wh}`, params);
    const total = Number(countRows[0]?.c ?? 0);
    params.push(limit, offset);
    const rows = await this.db.query(
      `SELECT wm.*,
        (SELECT COUNT(*) FROM weekly_menu_items wmi WHERE wmi.weekly_menu_id = wm.id) AS item_count
       FROM weekly_menus wm
       ${wh}
       ORDER BY wm.week_start_date DESC, wm.updated_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      params
    );
    return { items: rows, total, limit, offset };
  }

  async getMenuDetail(tenantId: string, customerId: string, menuId: string) {
    const menu = await this.assertMenuOwner(tenantId, customerId, menuId);

    const items = await this.db.query(
      `SELECT wmi.*,
        r.title AS recipe_title,
        r.image_url AS recipe_image_url,
        r.prep_time_minutes,
        r.cook_time_minutes,
        r.servings AS recipe_base_servings,
        r.calories AS recipe_calories,
        r.cuisine
       FROM weekly_menu_items wmi
       LEFT JOIN recipes r ON r.id = wmi.recipe_id AND r.tenant_id = wmi.tenant_id
       WHERE wmi.weekly_menu_id = $1 AND wmi.tenant_id = $2
       ORDER BY wmi.day_of_week ASC, wmi.sort_order ASC, wmi.created_at ASC`,
      [menuId, tenantId]
    );

    let totalKcal = 0;
    let plannedMainSlots = 0;
    for (const row of items as any[]) {
      if (row.recipe_id && row.recipe_calories) {
        const base = Math.max(1, safeNum(row.recipe_base_servings, 1));
        const serv = safeNum(row.servings, 1);
        totalKcal += (safeNum(row.recipe_calories, 0) * serv) / base;
      }
      if (row.recipe_id || row.custom_meal_name) plannedMainSlots += 1;
    }

    const daysInPlan = 7;
    const estDailyKcal = daysInPlan > 0 ? Math.round(totalKcal / daysInPlan) : 0;
    const macros = estimateMacrosFromCalories(estDailyKcal);
    const macroTargets = { protein_g: 120, carbs_g: 250, fat_g: 70 };

    const lastList = await this.db.query(
      `SELECT id, generated_at FROM shopping_lists
       WHERE weekly_menu_id = $1 AND tenant_id = $2 AND customer_id = $3
       ORDER BY generated_at DESC LIMIT 1`,
      [menuId, tenantId, customerId]
    );

    let estShoppingTotal: number | null = null;
    if (lastList.length > 0) {
      const listId = (lastList[0] as any).id;
      const sumRows = await this.db.query(
        `SELECT COALESCE(SUM(
          COALESCE(p.mobile_price, p.retail_price, 0) * sli.quantity
        ), 0) AS s
         FROM shopping_list_items sli
         JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
         LEFT JOIN shop_products p ON p.id = sli.matched_product_id AND p.tenant_id = sl.tenant_id
         WHERE sli.shopping_list_id = $1
           AND (
             sli.availability_type = 'in_shop'
             OR (sli.availability_type IS NULL AND sli.matched_product_id IS NOT NULL)
           )
           AND sli.matched_product_id IS NOT NULL`,
        [listId]
      );
      estShoppingTotal = safeNum(sumRows[0]?.s, 0);
    }

    const pct =
      MEALS_PER_WEEK > 0 ? Math.min(100, Math.round((plannedMainSlots / MEALS_PER_WEEK) * 100)) : 0;

    return {
      menu,
      items,
      nutrition_summary: {
        estimated_daily_calories: estDailyKcal,
        total_week_calories: Math.round(totalKcal),
        macros_estimate_g: macros,
        macro_targets_g: macroTargets,
        progress: {
          planned_slots: plannedMainSlots,
          target_slots: MEALS_PER_WEEK,
          percent: pct,
        },
      },
      last_shopping_list: lastList[0] || null,
      estimated_cart_total: estShoppingTotal,
    };
  }

  async updateMenu(
    tenantId: string,
    customerId: string,
    menuId: string,
    patch: { title?: string; status?: 'draft' | 'published'; week_start_date?: string }
  ) {
    await this.assertMenuOwner(tenantId, customerId, menuId);
    const parts: string[] = [];
    const vals: unknown[] = [];
    let pi = 1;
    if (patch.title != null) {
      const t = String(patch.title).trim();
      if (!t) throw new Error('Title cannot be empty');
      parts.push(`title = $${pi++}`);
      vals.push(t);
    }
    if (patch.status != null) {
      if (patch.status !== 'draft' && patch.status !== 'published') throw new Error('Invalid status');
      parts.push(`status = $${pi++}`);
      vals.push(patch.status);
    }
    if (patch.week_start_date != null) {
      const d = String(patch.week_start_date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('week_start_date must be YYYY-MM-DD');
      parts.push(
        this.db.getType() === 'postgres'
          ? `week_start_date = $${pi++}::date`
          : `week_start_date = $${pi++}`
      );
      vals.push(d);
    }
    if (parts.length === 0) return;
    parts.push('updated_at = NOW()');
    vals.push(menuId, tenantId, customerId);
    await this.db.execute(
      `UPDATE weekly_menus SET ${parts.join(', ')}
       WHERE id = $${pi++} AND tenant_id = $${pi++} AND customer_id = $${pi} AND deleted_at IS NULL`,
      vals
    );
  }

  async softDeleteMenu(tenantId: string, customerId: string, menuId: string) {
    await this.assertMenuOwner(tenantId, customerId, menuId);
    await this.db.execute(
      `UPDATE weekly_menus SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND customer_id = $3`,
      [menuId, tenantId, customerId]
    );
  }

  async duplicateMenu(tenantId: string, customerId: string, menuId: string, newWeekStart: string) {
    await this.assertMenuOwner(tenantId, customerId, menuId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newWeekStart)) throw new Error('week_start_date must be YYYY-MM-DD');

    const menuRow = await this.db.query(
      `SELECT title FROM weekly_menus WHERE id = $1 AND tenant_id = $2`,
      [menuId, tenantId]
    );
    const baseTitle = String((menuRow[0] as any)?.title || 'Weekly plan');

    return this.db.transaction(async (client) => {
      const newMenuId = newId();
      const insMenu =
        this.db.getType() === 'postgres'
          ? `INSERT INTO weekly_menus (id, tenant_id, customer_id, title, week_start_date, status)
             VALUES ($1, $2, $3, $4, $5::date, 'draft')`
          : `INSERT INTO weekly_menus (id, tenant_id, customer_id, title, week_start_date, status)
             VALUES ($1, $2, $3, $4, $5, 'draft')`;
      await client.query(insMenu, [newMenuId, tenantId, customerId, `${baseTitle} (copy)`, newWeekStart]);

      const oldItems = await client.query(
        `SELECT * FROM weekly_menu_items WHERE weekly_menu_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [menuId, tenantId]
      );

      for (const it of oldItems as any[]) {
        const nid = newId();
        await client.query(
          `INSERT INTO weekly_menu_items (
            id, tenant_id, weekly_menu_id, day_of_week, meal_type, recipe_id, custom_meal_name, servings, notes, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            nid,
            tenantId,
            newMenuId,
            it.day_of_week,
            it.meal_type,
            it.recipe_id,
            it.custom_meal_name,
            it.servings,
            it.notes,
            it.sort_order,
          ]
        );
      }

      await this.logEvent(tenantId, customerId, 'menu_duplicated', { from_menu_id: menuId, to_menu_id: newMenuId });
      return newMenuId;
    });
  }

  async addMenuItem(tenantId: string, customerId: string, menuId: string, input: AddMenuItemInput) {
    await this.assertMenuOwner(tenantId, customerId, menuId);

    const recipeId = input.recipe_id?.trim() || null;
    const custom = input.custom_meal_name?.trim() || null;
    if (!recipeId && !custom) throw new Error('Either recipe_id or custom_meal_name is required');
    if (recipeId) {
      const r = await this.db.query(
        `SELECT id FROM recipes WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [recipeId, tenantId]
      );
      if (r.length === 0) throw new Error('Recipe not found or inactive');
    }

    const day = Math.max(0, Math.min(6, Math.round(safeNum(input.day_of_week, 0))));
    const meal = String(input.meal_type || '').toLowerCase();
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(meal)) throw new Error('Invalid meal_type');

    const sortRows = await this.db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n
       FROM weekly_menu_items
       WHERE weekly_menu_id = $1 AND tenant_id = $2 AND day_of_week = $3 AND meal_type = $4`,
      [menuId, tenantId, day, meal]
    );
    const sortOrder = Number(sortRows[0]?.n ?? 0);

    const id = newId();
    const servings = Math.max(0.25, safeNum(input.servings, 1));

    await this.db.query(
      `INSERT INTO weekly_menu_items (
        id, tenant_id, weekly_menu_id, day_of_week, meal_type, recipe_id, custom_meal_name, servings, notes, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, tenantId, menuId, day, meal, recipeId, custom, servings, input.notes?.trim() || null, sortOrder]
    );

    await this.db.execute(
      `UPDATE weekly_menus SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [menuId, tenantId]
    );

    return id;
  }

  async updateMenuItem(
    tenantId: string,
    customerId: string,
    itemId: string,
    patch: Partial<AddMenuItemInput>
  ) {
    const existing = await this.assertItemOwner(tenantId, customerId, itemId);
    const recipeId =
      patch.recipe_id !== undefined ? patch.recipe_id?.trim() || null : existing.recipe_id;
    const custom =
      patch.custom_meal_name !== undefined
        ? patch.custom_meal_name?.trim() || null
        : existing.custom_meal_name;

    const nextRecipe = recipeId ?? null;
    const nextCustom = custom ?? null;
    if (!nextRecipe && !nextCustom) throw new Error('Either recipe_id or custom_meal_name is required');

    if (nextRecipe) {
      const r = await this.db.query(
        `SELECT id FROM recipes WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [nextRecipe, tenantId]
      );
      if (r.length === 0) throw new Error('Recipe not found or inactive');
    }

    const parts: string[] = [];
    const vals: unknown[] = [];
    let pi = 1;

    if (patch.recipe_id !== undefined || patch.custom_meal_name !== undefined) {
      parts.push(`recipe_id = $${pi++}`, `custom_meal_name = $${pi++}`);
      vals.push(nextRecipe, nextCustom);
    }
    if (patch.servings !== undefined) {
      parts.push(`servings = $${pi++}`);
      vals.push(Math.max(0.25, safeNum(patch.servings, 1)));
    }
    if (patch.notes !== undefined) {
      parts.push(`notes = $${pi++}`);
      vals.push(patch.notes?.trim() || null);
    }
    if (patch.day_of_week !== undefined) {
      parts.push(`day_of_week = $${pi++}`);
      vals.push(Math.max(0, Math.min(6, Math.round(safeNum(patch.day_of_week, 0)))));
    }
    if (patch.meal_type !== undefined) {
      const m = String(patch.meal_type || '').toLowerCase();
      if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(m)) throw new Error('Invalid meal_type');
      parts.push(`meal_type = $${pi++}`);
      vals.push(m);
    }

    if (parts.length === 0) return;

    vals.push(itemId, tenantId);
    await this.db.execute(
      `UPDATE weekly_menu_items SET ${parts.join(', ')} WHERE id = $${pi++} AND tenant_id = $${pi}`,
      vals
    );

    await this.db.execute(
      `UPDATE weekly_menus SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [existing.weekly_menu_id, tenantId]
    );
  }

  async deleteMenuItem(tenantId: string, customerId: string, itemId: string) {
    const existing = await this.assertItemOwner(tenantId, customerId, itemId);
    await this.db.execute(`DELETE FROM weekly_menu_items WHERE id = $1 AND tenant_id = $2`, [
      itemId,
      tenantId,
    ]);
    await this.db.execute(
      `UPDATE weekly_menus SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [existing.weekly_menu_id, tenantId]
    );
  }

  async moveMenuItem(tenantId: string, customerId: string, itemId: string, move: MoveMenuItemInput) {
    const existing = await this.assertItemOwner(tenantId, customerId, itemId);
    const day = Math.max(0, Math.min(6, Math.round(safeNum(move.day_of_week, 0))));
    const meal = String(move.meal_type || '').toLowerCase();
    if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(meal)) throw new Error('Invalid meal_type');

    let sortOrder = move.sort_order;
    if (sortOrder == null) {
      const sortRows = await this.db.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n
         FROM weekly_menu_items
         WHERE weekly_menu_id = $1 AND tenant_id = $2 AND day_of_week = $3 AND meal_type = $4 AND id <> $5`,
        [existing.weekly_menu_id, tenantId, day, meal, itemId]
      );
      sortOrder = Number(sortRows[0]?.n ?? 0);
    }

    await this.db.execute(
      `UPDATE weekly_menu_items SET day_of_week = $1, meal_type = $2, sort_order = $3
       WHERE id = $4 AND tenant_id = $5`,
      [day, meal, sortOrder, itemId, tenantId]
    );
    await this.db.execute(
      `UPDATE weekly_menus SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [existing.weekly_menu_id, tenantId]
    );
  }

  async generateShoppingList(tenantId: string, customerId: string, menuId: string): Promise<string> {
    await this.assertMenuOwner(tenantId, customerId, menuId);

    const items = await this.db.query(
      `SELECT wmi.recipe_id, wmi.servings,
              r.servings AS base_servings
       FROM weekly_menu_items wmi
       JOIN recipes r ON r.id = wmi.recipe_id AND r.tenant_id = wmi.tenant_id
       WHERE wmi.weekly_menu_id = $1 AND wmi.tenant_id = $2 AND r.is_active = TRUE`,
      [menuId, tenantId]
    );

    if (items.length === 0) {
      throw new Error('No recipe-based meals in this plan; add recipes to generate a shopping list.');
    }

    const recipeIds = [...new Set((items as any[]).map((i) => i.recipe_id))];
    const ingParams = recipeIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const ingRows = await this.db.query(
      `SELECT ri.recipe_id, ri.ingredient_name, ri.normalized_name, ri.quantity, ri.unit, ri.optional,
              ri.product_id
       FROM recipe_ingredients ri
       WHERE ri.tenant_id = $1 AND ri.recipe_id IN (${ingParams})`,
      [tenantId, ...recipeIds]
    );

    const scaleByRecipe = new Map<string, number>();
    for (const row of items as any[]) {
      const base = Math.max(1, safeNum(row.base_servings, 1));
      const scale = safeNum(row.servings, 1) / base;
      scaleByRecipe.set(row.recipe_id, (scaleByRecipe.get(row.recipe_id) || 0) + scale);
    }

    const raw: RawIngredientLine[] = [];
    for (const ir of ingRows as any[]) {
      const totalScale = scaleByRecipe.get(ir.recipe_id) || 1;
      raw.push({
        ingredient_name: ir.ingredient_name,
        normalized_name: ir.normalized_name || ir.ingredient_name,
        quantity: safeNum(ir.quantity, 1) * totalScale,
        unit: ir.unit,
        product_id: ir.product_id,
        optional: Boolean(ir.optional),
      });
    }

    const aggregated = aggregateIngredients(raw);
    const mapper = getMenuProductMappingService();

    return this.db.transaction(async (client) => {
      await client.query(
        `DELETE FROM shopping_list_items WHERE shopping_list_id IN (
          SELECT id FROM shopping_lists WHERE weekly_menu_id = $1 AND tenant_id = $2
        )`,
        [menuId, tenantId]
      );
      await client.query(`DELETE FROM shopping_lists WHERE weekly_menu_id = $1 AND tenant_id = $2`, [
        menuId,
        tenantId,
      ]);

      const listId = newId();
      await client.query(
        `INSERT INTO shopping_lists (id, tenant_id, customer_id, weekly_menu_id) VALUES ($1,$2,$3,$4)`,
        [listId, tenantId, customerId, menuId]
      );

      let externalMarketCount = 0;
      for (const line of aggregated) {
        const mapped = await mapper.resolveIngredientProductMatch(
          tenantId,
          line.ingredient_name,
          line.normalized_name,
          line.product_id
        );
        if (mapped.availability_type === 'external_market') externalMarketCount += 1;
        const itemId = newId();
        await client.query(
          `INSERT INTO shopping_list_items (
            id, shopping_list_id, ingredient_name, quantity, unit, matched_product_id, category, source_recipe_id,
            availability_type, product_match_status, suggested_product_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            itemId,
            listId,
            line.ingredient_name,
            line.quantity,
            line.unit,
            mapped.matched_product_id,
            mapped.category,
            null,
            mapped.availability_type,
            mapped.product_match_status,
            mapped.suggested_product_id,
          ]
        );

        if (mapped.availability_type === 'external_market') {
          const gid = newId();
          await client.query(
            `INSERT INTO menu_planner_inventory_gaps (
              id, tenant_id, customer_id, shopping_list_id,
              ingredient_name, normalized_name, quantity, unit,
              product_match_status, suggested_product_id
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              gid,
              tenantId,
              customerId,
              listId,
              line.ingredient_name,
              line.normalized_name,
              line.quantity,
              line.unit,
              mapped.product_match_status,
              mapped.suggested_product_id,
            ]
          );
        }
      }

      await this.logEvent(tenantId, customerId, 'shopping_list_generated', {
        weekly_menu_id: menuId,
        shopping_list_id: listId,
        line_count: aggregated.length,
        external_market_count: externalMarketCount,
      });

      return listId;
    });
  }

  /** Grouped list for mobile; labels are stable category keys. */
  async getShoppingListDetail(tenantId: string, customerId: string, shoppingListId: string) {
    const lists = await this.db.query(
      `SELECT sl.* FROM shopping_lists sl
       JOIN weekly_menus wm ON wm.id = sl.weekly_menu_id AND wm.tenant_id = sl.tenant_id
       WHERE sl.id = $1 AND sl.tenant_id = $2 AND sl.customer_id = $3 AND wm.deleted_at IS NULL`,
      [shoppingListId, tenantId, customerId]
    );
    if (lists.length === 0) throw new Error('Shopping list not found');

    const rows = await this.db.query(
      `SELECT sli.*,
        p.name AS product_name,
        COALESCE(p.mobile_price, p.retail_price) AS product_unit_price
       FROM shopping_list_items sli
       LEFT JOIN shop_products p ON p.id = sli.matched_product_id AND p.tenant_id = $2
       WHERE sli.shopping_list_id = $1
       ORDER BY (sli.category IS NULL), sli.category ASC, sli.ingredient_name ASC`,
      [shoppingListId, tenantId]
    );

    const normAvailability = (r: any) =>
      r.availability_type ||
      (r.matched_product_id ? 'in_shop' : 'external_market');

    const inShopItems = (rows as any[]).filter((r) => normAvailability(r) === 'in_shop');
    const externalMarketItems = (rows as any[]).filter((r) => normAvailability(r) === 'external_market');

    const byCat = (list: any[]) => {
      const m: Record<string, any[]> = {};
      for (const r of list) {
        const k = r.category || 'other';
        if (!m[k]) m[k] = [];
        m[k].push(r);
      }
      const labelKey: Record<string, string> = {
        produce: 'PRODUCE',
        dairy_eggs: 'DAIRY & EGGS',
        meat: 'MEAT',
        spices: 'SPICES',
        pantry: 'PANTRY',
        other: 'OTHER',
      };
      return Object.entries(m)
        .map(([key, items]) => ({
          category: key,
          label: labelKey[key] || key.toUpperCase(),
          items,
          item_count: items.length,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    const groups = byCat(rows as any[]);
    const groups_in_shop = byCat(inShopItems);
    const groups_external_market = byCat(externalMarketItems);

    const checked = (rows as any[]).filter((x) => x.is_checked).length;
    const est = inShopItems.reduce((s, r) => {
      const price = safeNum(r.product_unit_price, 0);
      return s + price * safeNum(r.quantity, 0);
    }, 0);

    return {
      list: lists[0],
      in_shop_items: inShopItems,
      external_market_items: externalMarketItems,
      groups,
      groups_in_shop,
      groups_external_market,
      summary: {
        total_items: rows.length,
        in_shop_count: inShopItems.length,
        external_market_count: externalMarketItems.length,
        checked_items: checked,
        estimated_total: Math.round(est * 100) / 100,
      },
    };
  }

  /**
   * Printable / exportable lines for local market purchases (no catalog SKU).
   */
  async getExternalMarketListForExport(tenantId: string, customerId: string, shoppingListId: string) {
    await this.getShoppingListDetail(tenantId, customerId, shoppingListId);
    const rows = await this.db.query(
      `SELECT sli.ingredient_name, sli.quantity, sli.unit, sli.product_match_status
       FROM shopping_list_items sli
       WHERE sli.shopping_list_id = $1
         AND (sli.availability_type = 'external_market'
           OR (sli.availability_type IS NULL AND sli.matched_product_id IS NULL))
       ORDER BY sli.ingredient_name ASC`,
      [shoppingListId]
    );
    return {
      shopping_list_id: shoppingListId,
      generated_at: new Date().toISOString(),
      lines: (rows as any[]).map((r) => ({
        ingredient_name: r.ingredient_name,
        quantity: safeNum(r.quantity, 0),
        unit: r.unit || '',
        product_match_status: r.product_match_status || 'not_found',
      })),
    };
  }

  async patchShoppingListItem(
    tenantId: string,
    customerId: string,
    shoppingListId: string,
    itemId: string,
    patch: { is_checked?: boolean; is_at_home?: boolean; matched_product_id?: string | null }
  ) {
    await this.getShoppingListDetail(tenantId, customerId, shoppingListId); // ownership

    const parts: string[] = [];
    const vals: unknown[] = [];
    let pi = 1;
    if (patch.is_checked !== undefined) {
      parts.push(`is_checked = $${pi++}`);
      vals.push(patch.is_checked);
    }
    if (patch.is_at_home !== undefined) {
      parts.push(`is_at_home = $${pi++}`);
      vals.push(patch.is_at_home);
    }
    if (patch.matched_product_id !== undefined) {
      const pid = patch.matched_product_id?.trim() || null;
      if (pid) {
        const p = await this.db.query(
          `SELECT id FROM shop_products WHERE id = $1 AND tenant_id = $2
            AND COALESCE(mobile_visible, TRUE) = TRUE
            AND COALESCE(is_active, TRUE) = TRUE AND COALESCE(sales_deactivated, FALSE) = FALSE`,
          [pid, tenantId]
        );
        if (p.length === 0) throw new Error('Product not available');
        parts.push(`matched_product_id = $${pi++}`, `availability_type = $${pi++}`, `product_match_status = $${pi++}`);
        vals.push(pid, 'in_shop', 'matched');
      } else {
        parts.push(
          `matched_product_id = $${pi++}`,
          `availability_type = $${pi++}`,
          `product_match_status = $${pi++}`
        );
        vals.push(null, 'external_market', 'not_found');
      }
    }
    if (parts.length === 0) return;

    vals.push(itemId, shoppingListId);
    await this.db.execute(
      `UPDATE shopping_list_items SET ${parts.join(', ')}
       WHERE id = $${pi++} AND shopping_list_id = $${pi}`,
      vals
    );
  }

  async addShoppingListToCart(
    tenantId: string,
    customerId: string,
    shoppingListId: string,
    opts: { all?: boolean; item_ids?: string[] }
  ) {
    await this.getShoppingListDetail(tenantId, customerId, shoppingListId);

    const listSnapshot = await this.db.query(
      `SELECT id, ingredient_name, quantity, unit, availability_type, matched_product_id, is_at_home
       FROM shopping_list_items WHERE shopping_list_id = $1`,
      [shoppingListId]
    );

    const normAvail = (r: any) =>
      r.availability_type || (r.matched_product_id ? 'in_shop' : 'external_market');

    const stockExpr = mobileProductSellableStockSql();
    const useFilter = !opts.all && opts.item_ids && opts.item_ids.length > 0;
    const filterIds = useFilter ? opts.item_ids! : [];
    const inClause = useFilter ? filterIds.map((_, i) => `$${3 + i}`).join(', ') : '';
    const homeSql =
      this.db.getType() === 'postgres'
        ? 'NOT COALESCE(sli.is_at_home, false)'
        : 'COALESCE(sli.is_at_home, 0) = 0';
      const inShopSql =
        `(sli.availability_type = 'in_shop' OR (sli.availability_type IS NULL AND sli.matched_product_id IS NOT NULL))`;

    const query = useFilter
      ? `SELECT sli.id, sli.quantity, sli.added_to_cart, sli.ingredient_name,
            p.id AS product_id, p.name, p.sku,
            COALESCE(p.mobile_price, p.retail_price) AS price,
            p.tax_rate, p.image_url,
            ${stockExpr} AS available_stock,
            p.mobile_visible, p.is_active AS product_is_active, p.sales_deactivated
           FROM shopping_list_items sli
           JOIN shop_products p ON p.id = sli.matched_product_id AND p.tenant_id = $2
           WHERE sli.shopping_list_id = $1
             AND sli.id IN (${inClause})
             AND (${homeSql})
             AND (${inShopSql})
             AND sli.matched_product_id IS NOT NULL`
      : `SELECT sli.id, sli.quantity, sli.added_to_cart, sli.ingredient_name,
            p.id AS product_id, p.name, p.sku,
            COALESCE(p.mobile_price, p.retail_price) AS price,
            p.tax_rate, p.image_url,
            ${stockExpr} AS available_stock,
            p.mobile_visible, p.is_active AS product_is_active, p.sales_deactivated
           FROM shopping_list_items sli
           JOIN shop_products p ON p.id = sli.matched_product_id AND p.tenant_id = $2
           WHERE sli.shopping_list_id = $1
             AND (${homeSql})
             AND (${inShopSql})
             AND sli.matched_product_id IS NOT NULL`;

    const qParams = useFilter ? [shoppingListId, tenantId, ...filterIds] : [shoppingListId, tenantId];

    const rows = await this.db.query(query, qParams);

    const cartLines: any[] = [];
    const mergedByProduct = new Map<string, any>();
    const consumedListItemIds = new Set<string>();

    for (const row of rows as any[]) {
      if (!row.mobile_visible || !row.product_is_active || row.sales_deactivated) continue;
      consumedListItemIds.add(row.id);
      const qty = Math.max(0.01, safeNum(row.quantity, 1));
      const ex = mergedByProduct.get(row.product_id);
      if (ex) ex.quantity += qty;
      else {
        const line = {
          product_id: row.product_id,
          product_name: row.name,
          quantity: qty,
          sku: row.sku,
          price: safeNum(row.price, 0),
          tax_rate: safeNum(row.tax_rate, 0),
          image_url: row.image_url,
          available_stock: safeNum(row.available_stock, 0),
        };
        mergedByProduct.set(row.product_id, line);
      }
    }

    for (const line of mergedByProduct.values()) {
      const cap =
        line.available_stock > 0 ? Math.min(line.quantity, line.available_stock) : line.quantity;
      cartLines.push({ ...line, quantity: cap });
    }

    const addedToCartPayload = cartLines.map((c) => ({
      product_id: c.product_id,
      product_name: c.product_name,
      quantity: c.quantity,
      sku: c.sku,
      price: c.price,
      tax_rate: c.tax_rate,
      image_url: c.image_url,
      available_stock: c.available_stock,
    }));

    const unavailableItems: {
      id: string;
      ingredient_name: string;
      quantity: number;
      unit: string;
      availability_type: string;
      reason: string;
    }[] = [];

    for (const r of listSnapshot as any[]) {
      const avail = normAvail(r);
      if (avail === 'external_market') {
        unavailableItems.push({
          id: r.id,
          ingredient_name: r.ingredient_name,
          quantity: safeNum(r.quantity, 0),
          unit: r.unit || '',
          availability_type: 'external_market',
          reason: 'external_market',
        });
        continue;
      }
      const atHome =
        this.db.getType() === 'postgres'
          ? Boolean(r.is_at_home)
          : Boolean(Number(r.is_at_home));
      if (atHome) {
        unavailableItems.push({
          id: r.id,
          ingredient_name: r.ingredient_name,
          quantity: safeNum(r.quantity, 0),
          unit: r.unit || '',
          availability_type: 'in_shop',
          reason: 'at_home',
        });
        continue;
      }
      if (!consumedListItemIds.has(r.id)) {
        unavailableItems.push({
          id: r.id,
          ingredient_name: r.ingredient_name,
          quantity: safeNum(r.quantity, 0),
          unit: r.unit || '',
          availability_type: 'in_shop',
          reason: 'not_added_not_listed_or_blocked',
        });
      }
    }

    if (consumedListItemIds.size > 0) {
      const ph = [...consumedListItemIds].map((_, i) => `$${i + 2}`).join(', ');
      await this.db.execute(
        `UPDATE shopping_list_items SET added_to_cart = TRUE
         WHERE shopping_list_id = $1 AND id IN (${ph})`,
        [shoppingListId, ...consumedListItemIds]
      );
    }

    await this.logEvent(tenantId, customerId, 'shopping_list_add_to_cart', {
      shopping_list_id: shoppingListId,
      cart_line_count: cartLines.length,
      unavailable_count: unavailableItems.filter((u) => u.reason === 'external_market').length,
    });

    return {
      added_to_cart: addedToCartPayload,
      unavailable_items: unavailableItems,
      items: addedToCartPayload,
    };
  }

  async listTemplates(tenantId: string, customerId: string) {
    const rows = await this.db.query(
      `SELECT * FROM menu_templates
       WHERE tenant_id = $1 AND (visibility = 'public' OR customer_id = $2)
       ORDER BY visibility DESC, created_at DESC
       LIMIT 100`,
      [tenantId, customerId]
    );
    return rows;
  }

  async createTemplateFromMenu(
    tenantId: string,
    customerId: string,
    menuId: string,
    name: string,
    visibility: 'private' | 'public'
  ) {
    await this.assertMenuOwner(tenantId, customerId, menuId);
    const tmplName = String(name || '').trim();
    if (!tmplName) throw new Error('Template name is required');

    return this.db.transaction(async (client) => {
      const tid = newId();
      await client.query(
        `INSERT INTO menu_templates (id, tenant_id, customer_id, name, visibility)
         VALUES ($1,$2,$3,$4,$5)`,
        [tid, tenantId, customerId, tmplName, visibility]
      );

      const items = await client.query(
        `SELECT day_of_week, meal_type, recipe_id, custom_meal_name, servings, sort_order
         FROM weekly_menu_items WHERE weekly_menu_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
        [menuId, tenantId]
      );

      for (const it of items as any[]) {
        const iid = newId();
        await client.query(
          `INSERT INTO menu_template_items (
            id, template_id, day_of_week, meal_type, recipe_id, custom_meal_name, servings, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            iid,
            tid,
            it.day_of_week,
            it.meal_type,
            it.recipe_id,
            it.custom_meal_name,
            it.servings,
            it.sort_order,
          ]
        );
      }

      return tid;
    });
  }

  async applyTemplate(tenantId: string, customerId: string, menuId: string, templateId: string) {
    await this.assertMenuOwner(tenantId, customerId, menuId);

    const tmpl = await this.db.query(
      `SELECT id FROM menu_templates
       WHERE id = $1 AND tenant_id = $2 AND (visibility = 'public' OR customer_id = $3)`,
      [templateId, tenantId, customerId]
    );
    if (tmpl.length === 0) throw new Error('Template not found');

    return this.db.transaction(async (client) => {
      await client.query(`DELETE FROM weekly_menu_items WHERE weekly_menu_id = $1 AND tenant_id = $2`, [
        menuId,
        tenantId,
      ]);

      const items = await client.query(
        `SELECT * FROM menu_template_items WHERE template_id = $1 ORDER BY sort_order ASC, id ASC`,
        [templateId]
      );

      for (const it of items as any[]) {
        const iid = newId();
        await client.query(
          `INSERT INTO weekly_menu_items (
            id, tenant_id, weekly_menu_id, day_of_week, meal_type, recipe_id, custom_meal_name, servings, notes, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)`,
          [
            iid,
            tenantId,
            menuId,
            it.day_of_week,
            it.meal_type,
            it.recipe_id,
            it.custom_meal_name,
            it.servings,
            it.sort_order,
          ]
        );
      }

      await client.query(
        `UPDATE weekly_menus SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [menuId, tenantId]
      );

      await this.logEvent(tenantId, customerId, 'template_applied', { menuId, templateId });
    });
  }
}

let _wsvc: WeeklyMenuPlannerService | null = null;
export function getWeeklyMenuPlannerService(): WeeklyMenuPlannerService {
  if (!_wsvc) _wsvc = new WeeklyMenuPlannerService();
  return _wsvc;
}
