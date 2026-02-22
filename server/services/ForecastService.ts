import { getDatabaseService } from './databaseService.js';

export interface ForecastConfig {
    budgetWeight: number; // e.g. 0.7
    historyWeight: number; // e.g. 0.3
}

export class ForecastService {
    private db = getDatabaseService();

    async runBudgetForecast(tenantId: string, month: number, year: number, config: ForecastConfig = { budgetWeight: 0.7, historyWeight: 0.3 }) {
        return this.db.transaction(async (client) => {
            // 1. Create or get forecast_run
            const runRes = await client.query(`
                INSERT INTO forecast_runs (tenant_id, forecast_month, forecast_year, status, generated_at)
                VALUES ($1, $2, $3, 'Active', NOW())
                ON CONFLICT (tenant_id, forecast_month, forecast_year) 
                DO UPDATE SET 
                    generated_at = NOW(),
                    status = 'Active'
                RETURNING id
            `, [tenantId, month, year]);

            const forecastId = runRes[0].id;

            // 2. Fetch all unique products involved in active budgets for this month/year OR in historical sales last 3 months
            // We want to forecast for all active products basically, but primarily focusing on those with demand.

            // a) Get Planned Quantities from Budgets
            const plannedDemand = await client.query(`
                SELECT product_id, SUM(planned_quantity) as total_planned
                FROM budget_items
                WHERE tenant_id = $1 AND budget_id IN (
                    SELECT id FROM budgets WHERE tenant_id = $1 AND month = $2 AND year = $3
                )
                GROUP BY product_id
            `, [tenantId, month, year]);

            // b) Get Historical Average (Last 3 Months)
            // We'll look at shop_sale_items
            const historicalDemand = await client.query(`
                SELECT product_id, SUM(quantity) / 3.0 as avg_monthly_qty
                FROM shop_sale_items
                WHERE tenant_id = $1 
                AND created_at >= NOW() - INTERVAL '3 months'
                GROUP BY product_id
            `, [tenantId]);

            // c) Get Product Details (Current Stock, Prices, Category)
            const products = await client.query(`
                SELECT 
                    p.id, p.name, p.cost_price, p.retail_price, p.category_id,
                    COALESCE(SUM(i.quantity_on_hand), 0) as current_stock
                FROM shop_products p
                LEFT JOIN shop_inventory i ON p.id = i.product_id
                WHERE p.tenant_id = $1 AND p.is_active = TRUE
                GROUP BY p.id
            `, [tenantId]);

            const plannedMap = new Map(plannedDemand.map((d: any) => [d.product_id, parseFloat(d.total_planned) || 0]));
            const historyMap = new Map(historicalDemand.map((d: any) => [d.product_id, parseFloat(d.avg_monthly_qty) || 0]));

            let totalProjectedRevenue = 0;
            let totalProjectedProfit = 0;

            // 3. Process Product Forecasts
            await client.query('DELETE FROM product_forecasts WHERE forecast_id = $1', [forecastId]);

            for (const prod of products) {
                const planned = plannedMap.get(prod.id) || 0;
                const history = historyMap.get(prod.id) || 0;

                // Formula: (W1 * Planned) + (W2 * History)
                // If new product with no history or budgets, forecast is 0 unless we have fallback logic.
                let forecastQty = (Number(planned) * config.budgetWeight) + (Number(history) * config.historyWeight);

                // If both are 0 but product is active, we might want to predict at least some demand if it was ever sold?
                // But the requirement says fallback to historical if no budgets. 
                // If both are 0, forecast is 0.

                const revenue = Number(forecastQty) * (parseFloat(prod.retail_price) || 0);
                const cost = Number(forecastQty) * (parseFloat(prod.cost_price) || 0);
                const profit = Number(revenue) - Number(cost);

                // Inventory Risk
                let riskLevel = 'Normal';
                let stockOutRisk = 0;
                let overstockRisk = 0;
                let reorderQty = 0;

                const stock = parseFloat(prod.current_stock) || 0;
                if (forecastQty > stock) {
                    riskLevel = 'Stock-Out';
                    stockOutRisk = ((forecastQty - stock) / forecastQty) * 100;
                    reorderQty = forecastQty - stock + (forecastQty * 0.2); // Add 20% safety stock
                } else if (stock > forecastQty * 3 && stock > 0) { // Over 3 months of inventory
                    riskLevel = 'Overstock';
                    overstockRisk = ((stock - forecastQty) / stock) * 100;
                }

                await client.query(`
                    INSERT INTO product_forecasts (
                        forecast_id, tenant_id, product_id, forecast_quantity, forecast_revenue, forecast_profit,
                        historical_avg_quantity, planned_quantity, stock_risk_level, stock_out_risk_percent,
                        overstock_risk_percent, reorder_recommendation
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `, [
                    forecastId, tenantId, prod.id, forecastQty, revenue, profit,
                    history, planned, riskLevel, stockOutRisk, overstockRisk, reorderQty
                ]);

                totalProjectedRevenue += revenue;
                totalProjectedProfit += profit;
            }

            // 4. Aggregate by Category
            await client.query('DELETE FROM category_forecasts WHERE forecast_id = $1', [forecastId]);
            await client.query(`
                INSERT INTO category_forecasts (forecast_id, tenant_id, category_id, forecast_revenue, forecast_profit)
                SELECT $1, $2, p.category_id, SUM(pf.forecast_revenue), SUM(pf.forecast_profit)
                FROM product_forecasts pf
                JOIN shop_products p ON pf.product_id = p.id
                WHERE pf.forecast_id = $1 AND p.category_id IS NOT NULL
                GROUP BY p.category_id
            `, [forecastId, tenantId]);

            // 5. Cash Flow Forecast (Simplified)
            // Projected Inflow = Forecast Revenue
            // Projected Outflow = Σ (Expected Purchase Cost) + Fixed Costs (if known)
            // For now, Outflow = COGS of Forecasted Sales + Reorder Costs
            const reorderCosts = await client.query(`
                SELECT SUM(pf.reorder_recommendation * p.cost_price) as total_reorder_cost
                FROM product_forecasts pf
                JOIN shop_products p ON pf.product_id = p.id
                WHERE pf.forecast_id = $1
            `, [forecastId]);

            const inflow = totalProjectedRevenue;
            const outflow = (totalProjectedRevenue - totalProjectedProfit) + (parseFloat(reorderCosts[0].total_reorder_cost) || 0);

            await client.query('DELETE FROM cash_flow_forecasts WHERE forecast_id = $1', [forecastId]);
            await client.query(`
                INSERT INTO cash_flow_forecasts (
                    forecast_id, tenant_id, projected_inflow, projected_outflow, working_capital_requirement, liquidity_risk_level
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                forecastId, tenantId, inflow, outflow,
                Math.max(0, outflow - inflow),
                (outflow > inflow * 1.2) ? 'High' : (outflow > inflow) ? 'Medium' : 'Low'
            ]);

            // 6. Update Forecast Run Summary
            // Calculate Confidence Score (based on data availability)
            // If we have both budget and history, confidence is higher.
            const stats = await client.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE planned_quantity > 0 AND historical_avg_quantity > 0) as both_data,
                    COUNT(*) as total_products
                FROM product_forecasts
                WHERE forecast_id = $1
            `, [forecastId]);

            const bothData = parseInt(stats[0].both_data) || 1;
            const totalProducts = parseInt(stats[0].total_products) || 1;
            const confidenceScore = (bothData / totalProducts) * 100;

            await client.query(`
                UPDATE forecast_runs
                SET total_projected_revenue = $1,
                    total_projected_profit = $2,
                    confidence_score = $3
                WHERE id = $4
            `, [totalProjectedRevenue, totalProjectedProfit, confidenceScore, forecastId]);

            return {
                forecastId,
                totalProjectedRevenue,
                totalProjectedProfit,
                confidenceScore
            };
        });
    }

    async getForecastDashboard(tenantId: string, month: number, year: number) {
        const run = await this.db.query(`
            SELECT * FROM forecast_runs 
            WHERE tenant_id = $1 AND forecast_month = $2 AND forecast_year = $3
        `, [tenantId, month, year]);

        if (run.length === 0) return null;

        const forecastId = run[0].id;

        const productForecasts = await this.db.query(`
            SELECT pf.*, p.name as product_name, p.sku as product_sku, c.name as category_name
            FROM product_forecasts pf
            JOIN shop_products p ON pf.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE pf.forecast_id = $1
            ORDER BY pf.forecast_revenue DESC
            LIMIT 20
        `, [forecastId]);

        const categoryForecasts = await this.db.query(`
            SELECT cf.*, c.name as category_name
            FROM category_forecasts cf
            JOIN categories c ON cf.category_id = c.id
            WHERE cf.forecast_id = $1
            ORDER BY cf.forecast_revenue DESC
        `, [forecastId]);

        const cashFlow = await this.db.query(`
            SELECT * FROM cash_flow_forecasts WHERE forecast_id = $1
        `, [forecastId]);

        const inventoryRisks = await this.db.query(`
            SELECT pf.*, p.name as product_name
            FROM product_forecasts pf
            JOIN shop_products p ON pf.product_id = p.id
            WHERE pf.forecast_id = $1 AND pf.stock_risk_level != 'Normal'
            ORDER BY pf.stock_out_risk_percent DESC
            LIMIT 10
        `, [forecastId]);

        return {
            summary: run[0],
            products: productForecasts,
            categories: categoryForecasts,
            cashFlow: cashFlow[0],
            inventoryRisks: inventoryRisks
        };
    }

    async getProductForecast(tenantId: string, productId: string, month: number, year: number) {
        return this.db.query(`
            SELECT pf.*, fr.forecast_month, fr.forecast_year
            FROM product_forecasts pf
            JOIN forecast_runs fr ON pf.forecast_id = fr.id
            WHERE pf.tenant_id = $1 AND pf.product_id = $2 AND fr.forecast_month = $3 AND fr.forecast_year = $4
        `, [tenantId, productId, month, year]);
    }
}

let forecastServiceInstance: ForecastService | null = null;
export function getForecastService(): ForecastService {
    if (!forecastServiceInstance) {
        forecastServiceInstance = new ForecastService();
    }
    return forecastServiceInstance;
}
