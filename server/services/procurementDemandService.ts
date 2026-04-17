import { getDatabaseService } from './databaseService.js';

export interface DemandSettings {
  salesWindowDays: number;
  minimumDaysThreshold: number;
  targetStockDays: number;
}

const DEFAULT_SETTINGS: DemandSettings = {
  salesWindowDays: 7,
  minimumDaysThreshold: 5,
  targetStockDays: 15,
};

export interface DemandItem {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string | null;
  current_stock: number;
  avg_daily_sales: number;
  days_of_stock: number | null;
  suggested_order_qty: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';
  cost_price: number;
  retail_price: number;
}

export interface DemandResult {
  items: DemandItem[];
  generated_at: string;
  settings: DemandSettings;
  summary: {
    total_products: number;
    high_priority: number;
    medium_priority: number;
    low_priority: number;
    no_data: number;
    estimated_purchase_cost: number;
  };
}

function computePriority(daysOfStock: number | null, hasData: boolean): DemandItem['priority'] {
  if (!hasData) return 'NO_DATA';
  if (daysOfStock === null || daysOfStock <= 3) return 'HIGH';
  if (daysOfStock <= 7) return 'MEDIUM';
  return 'LOW';
}

export class ProcurementDemandService {
  private db = getDatabaseService();

  async generateDemandList(
    tenantId: string,
    settings?: Partial<DemandSettings>
  ): Promise<DemandResult> {
    const cfg: DemandSettings = { ...DEFAULT_SETTINGS, ...settings };
    const windowDays = Math.max(1, Math.min(90, cfg.salesWindowDays));
    const targetDays = Math.max(1, Math.min(90, cfg.targetStockDays));

    const rows: any[] = await this.db.query(
      `SELECT
        p.id                   AS product_id,
        p.name                 AS product_name,
        p.sku,
        c.name                 AS category_name,
        COALESCE(p.cost_price, 0)    AS cost_price,
        COALESCE(p.retail_price, 0)  AS retail_price,
        COALESCE(inv.total_stock, 0) AS current_stock,
        COALESCE(sales.qty_sold, 0)  AS qty_sold_in_window
      FROM shop_products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.tenant_id = $1
      LEFT JOIN (
        SELECT product_id, SUM(quantity_on_hand) AS total_stock
        FROM shop_inventory
        WHERE tenant_id = $1
        GROUP BY product_id
      ) inv ON inv.product_id = p.id
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) AS qty_sold
        FROM shop_sale_items si
        JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = $1
        WHERE s.status != 'cancelled'
          AND s.created_at >= NOW() - MAKE_INTERVAL(days => $2)
        GROUP BY si.product_id
      ) sales ON sales.product_id = p.id
      WHERE p.tenant_id = $1 AND p.is_active = TRUE
      ORDER BY p.name`,
      [tenantId, windowDays]
    );

    const items: DemandItem[] = [];
    let highCount = 0, medCount = 0, lowCount = 0, noDataCount = 0;
    let estimatedCost = 0;

    for (const r of rows) {
      const currentStock = parseFloat(r.current_stock) || 0;
      const qtySold = parseFloat(r.qty_sold_in_window) || 0;
      const avgDaily = qtySold / windowDays;
      const hasData = qtySold > 0;

      let daysOfStock: number | null = null;
      if (avgDaily > 0) {
        daysOfStock = currentStock / avgDaily;
      } else if (currentStock <= 0 && !hasData) {
        daysOfStock = null;
      } else {
        daysOfStock = hasData ? 0 : null;
      }

      const priority = computePriority(daysOfStock, hasData || currentStock <= 0);

      const requiredStock = avgDaily * targetDays;
      let suggestedQty = Math.ceil(Math.max(0, requiredStock - currentStock));

      if (currentStock <= 0 && !hasData) {
        suggestedQty = 0;
      }

      const costPrice = parseFloat(r.cost_price) || 0;
      if (suggestedQty > 0) {
        estimatedCost += suggestedQty * costPrice;
      }

      items.push({
        product_id: r.product_id,
        product_name: r.product_name,
        sku: r.sku || '',
        category_name: r.category_name,
        current_stock: currentStock,
        avg_daily_sales: Math.round(avgDaily * 100) / 100,
        days_of_stock: daysOfStock !== null ? Math.round(daysOfStock * 10) / 10 : null,
        suggested_order_qty: suggestedQty,
        priority,
        cost_price: costPrice,
        retail_price: parseFloat(r.retail_price) || 0,
      });

      if (priority === 'HIGH') highCount++;
      else if (priority === 'MEDIUM') medCount++;
      else if (priority === 'LOW') lowCount++;
      else noDataCount++;
    }

    return {
      items,
      generated_at: new Date().toISOString(),
      settings: cfg,
      summary: {
        total_products: items.length,
        high_priority: highCount,
        medium_priority: medCount,
        low_priority: lowCount,
        no_data: noDataCount,
        estimated_purchase_cost: Math.round(estimatedCost * 100) / 100,
      },
    };
  }

  async saveDraft(
    tenantId: string,
    name: string,
    items: Array<{ productId: string; suggestedQty: number; finalQty: number; currentStock: number; avgDailySales: number; daysOfStock: number | null; priority: string }>,
    settings: DemandSettings
  ): Promise<string> {
    return this.db.transaction(async (client) => {
      const draftRes = await client.query(
        `INSERT INTO procurement_demand_drafts (tenant_id, name, settings)
         VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, name, JSON.stringify(settings)]
      );
      const draftId = draftRes[0].id as string;

      for (const item of items) {
        if (item.finalQty <= 0) continue;
        await client.query(
          `INSERT INTO procurement_demand_draft_items
            (tenant_id, draft_id, product_id, current_stock, avg_daily_sales, days_of_stock, suggested_qty, final_qty, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            tenantId,
            draftId,
            item.productId,
            item.currentStock,
            item.avgDailySales,
            item.daysOfStock,
            item.suggestedQty,
            item.finalQty,
            item.priority,
          ]
        );
      }

      return draftId;
    });
  }

  async getDrafts(tenantId: string) {
    return this.db.query(
      `SELECT d.*, (SELECT COUNT(*) FROM procurement_demand_draft_items di WHERE di.draft_id = d.id AND di.tenant_id = $1) AS item_count
       FROM procurement_demand_drafts d
       WHERE d.tenant_id = $1
       ORDER BY d.created_at DESC`,
      [tenantId]
    );
  }

  async getDraftById(tenantId: string, draftId: string) {
    const drafts = await this.db.query(
      `SELECT * FROM procurement_demand_drafts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, draftId]
    );
    if (drafts.length === 0) return null;

    const items = await this.db.query(
      `SELECT di.*, p.name AS product_name, p.sku
       FROM procurement_demand_draft_items di
       JOIN shop_products p ON p.id = di.product_id AND p.tenant_id = $1
       WHERE di.tenant_id = $1 AND di.draft_id = $2
       ORDER BY
         CASE di.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END,
         p.name`,
      [tenantId, draftId]
    );

    return { ...drafts[0], items };
  }

  async deleteDraft(tenantId: string, draftId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM procurement_demand_drafts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, draftId]
    );
  }
}

let instance: ProcurementDemandService | null = null;
export function getProcurementDemandService(): ProcurementDemandService {
  if (!instance) instance = new ProcurementDemandService();
  return instance;
}
