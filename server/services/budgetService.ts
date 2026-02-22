import { getDatabaseService } from './databaseService.js';

export interface BudgetItemInput {
    productId: string;
    plannedQuantity: number;
    plannedPrice?: number;
}

export interface BudgetCreateInput {
    month: number;
    year: number;
    type: 'Fixed' | 'Flexible';
    items: BudgetItemInput[];
}

export class BudgetService {
    private db = getDatabaseService();

    async createOrUpdateBudget(tenantId: string, customerId: string, input: BudgetCreateInput) {
        return this.db.transaction(async (client) => {
            // 1. Calculate total budget amount
            let totalAmount = 0;
            const itemsToInsert: any[] = [];

            for (const item of input.items) {
                // Get current product price if not provided
                let price = item.plannedPrice;
                if (price === undefined || price === null || isNaN(Number(price))) {
                    const prodRes = await client.query(
                        'SELECT retail_price FROM shop_products WHERE id = $1 AND tenant_id = $2',
                        [item.productId, tenantId]
                    );
                    price = prodRes.length > 0 ? parseFloat(prodRes[0].retail_price) : 0;
                }
                const p = Number(price) || 0;
                const q = Number(item.plannedQuantity) || 0;
                const itemTotal = p * q;
                totalAmount += itemTotal;

                itemsToInsert.push({
                    productId: item.productId,
                    plannedQuantity: q,
                    plannedPrice: p,
                    plannedTotal: itemTotal
                });
            }

            // 2. Insert or update budget header
            const budgetRes = await client.query(`
                INSERT INTO budgets (
                    tenant_id, customer_id, month, year, total_budget_amount, budget_type, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'active')
                ON CONFLICT (tenant_id, customer_id, month, year) 
                DO UPDATE SET 
                    total_budget_amount = EXCLUDED.total_budget_amount,
                    budget_type = EXCLUDED.budget_type,
                    updated_at = NOW()
                RETURNING id
            `, [tenantId, customerId, input.month, input.year, totalAmount, input.type]);

            const budgetId = budgetRes[0].id;

            // 3. Clear existing items and re-insert (simplest for update)
            await client.query('DELETE FROM budget_items WHERE budget_id = $1', [budgetId]);

            for (const item of itemsToInsert) {
                await client.query(`
                    INSERT INTO budget_items (
                        tenant_id, budget_id, product_id, planned_quantity, planned_price, planned_total
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `, [tenantId, budgetId, item.productId, item.plannedQuantity, item.plannedPrice, item.plannedTotal]);
            }

            // 4. Trigger reconciliation (update actuals from past orders this month)
            await this.reconcileBudgetActuals(client, tenantId, customerId, input.month, input.year, budgetId);

            return { id: budgetId, total_budget_amount: totalAmount };
        });
    }

    async getBudgets(tenantId: string, customerId: string) {
        return this.db.query(
            `SELECT * FROM budgets WHERE tenant_id = $1 AND customer_id = $2 ORDER BY year DESC, month DESC`,
            [tenantId, customerId]
        );
    }

    async getBudgetDetail(tenantId: string, budgetId: string) {
        const budgets = await this.db.query(
            `SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2`,
            [budgetId, tenantId]
        );
        if (budgets.length === 0) return null;

        const items = await this.db.query(
            `SELECT v.* FROM budget_vs_actual_view v WHERE v.budget_id = $1`,
            [budgetId]
        );

        return { ...budgets[0], items };
    }

    async getMonthlySummary(tenantId: string, customerId: string, month: number, year: number) {
        const budgets = await this.db.query(
            `SELECT * FROM budgets WHERE tenant_id = $1 AND customer_id = $2 AND month = $3 AND year = $4`,
            [tenantId, customerId, month, year]
        );
        if (budgets.length === 0) return null;

        const budget = budgets[0];
        const res = await this.db.query(`
            SELECT 
                SUM(planned_total) as total_planned,
                SUM(actual_amount) as total_actual,
                SUM(CASE WHEN actual_amount < planned_total THEN planned_total - actual_amount ELSE 0 END) as total_saved,
                SUM(CASE WHEN actual_amount > planned_total THEN actual_amount - planned_total ELSE 0 END) as total_overspent
            FROM budget_items 
            WHERE budget_id = $1
        `, [budget.id]);

        const stats = res[0];
        const totalActual = parseFloat(stats.total_actual) || 0;
        const totalPlanned = parseFloat(stats.total_planned) || 0;
        const remaining = totalPlanned - totalActual;

        return {
            budgetId: budget.id,
            totalBudget: totalPlanned,
            totalActual: totalActual,
            totalSaved: parseFloat(stats.total_saved) || 0,
            totalOverspent: parseFloat(stats.total_overspent) || 0,
            remainingBudget: remaining,
            status: budget.status,
            progress: totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0
        };
    }

    async updateActualsFromOrder(client: any, tenantId: string, customerId: string, items: { productId: string, quantity: number, subtotal: number }[]) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // 1. Find active budget for this customer/month
        const budgets = await client.query(
            'SELECT id FROM budgets WHERE tenant_id = $1 AND customer_id = $2 AND month = $3 AND year = $4 AND status = \'active\'',
            [tenantId, customerId, month, year]
        );
        if (budgets.length === 0) return;

        const budgetId = budgets[0].id;

        for (const item of items) {
            // Update actuals if product is in budget
            // Note: If product is NOT in budget, should we add it dynamically? 
            // The requirement says "Track actual purchases", but "Show savings or overspending analysis"
            // usually implies comparing against planned. 
            // If I buy something not in budget, it's still actual spending. 
            // I'll update budget_items if it exists, otherwise I'll insert a new item with 0 planned.

            const existing = await client.query(
                'SELECT id FROM budget_items WHERE budget_id = $1 AND product_id = $2',
                [budgetId, item.productId]
            );

            if (existing.length > 0) {
                await client.query(`
                    UPDATE budget_items 
                    SET actual_quantity = actual_quantity + $1,
                        actual_amount = actual_amount + $2,
                        updated_at = NOW()
                    WHERE id = $3
                `, [item.quantity, item.subtotal, existing[0].id]);
            } else {
                // Not in budget, but still tracking actual
                await client.query(`
                    INSERT INTO budget_items (
                        tenant_id, budget_id, product_id, planned_quantity, planned_price, planned_total,
                        actual_quantity, actual_amount
                    ) VALUES ($1, $2, $3, 0, 0, 0, $4, $5)
                `, [tenantId, budgetId, item.productId, item.quantity, item.subtotal]);
            }
        }
    }

    private async reconcileBudgetActuals(client: any, tenantId: string, customerId: string, month: number, year: number, budgetId: string) {
        // This method resets actuals and re-calculates them from all completed orders/sales this month
        // 1. Reset actuals
        await client.query('UPDATE budget_items SET actual_quantity = 0, actual_amount = 0 WHERE budget_id = $1', [budgetId]);

        // 2. Fetch mobile orders (Delivered)
        const mobileOrders = await client.query(`
            SELECT mi.product_id, mi.quantity, mi.subtotal
            FROM mobile_order_items mi
            JOIN mobile_orders m ON mi.order_id = m.id
            WHERE m.tenant_id = $1 AND m.customer_id = $2 AND m.status = 'Delivered'
              AND EXTRACT(MONTH FROM m.created_at) = $3 AND EXTRACT(YEAR FROM m.created_at) = $4
        `, [tenantId, customerId, month, year]);

        // 3. Fetch POS sales (if any linked to this customer)
        const posSales = await client.query(`
            SELECT si.product_id, si.quantity, si.subtotal
            FROM shop_sale_items si
            JOIN shop_sales s ON si.sale_id = s.id
            WHERE s.tenant_id = $1 AND s.customer_id = $2
              AND EXTRACT(MONTH FROM s.created_at) = $3 AND EXTRACT(YEAR FROM s.created_at) = $4
        `, [tenantId, customerId, month, year]);

        const allItems = [...mobileOrders, ...posSales];

        for (const item of allItems) {
            const existing = await client.query(
                'SELECT id FROM budget_items WHERE budget_id = $1 AND product_id = $2',
                [budgetId, item.product_id]
            );

            if (existing.length > 0) {
                await client.query(`
                    UPDATE budget_items 
                    SET actual_quantity = actual_quantity + $1,
                        actual_amount = actual_amount + $2,
                        updated_at = NOW()
                    WHERE id = $3
                `, [item.quantity, item.subtotal, existing[0].id]);
            } else {
                await client.query(`
                    INSERT INTO budget_items (
                        tenant_id, budget_id, product_id, planned_quantity, planned_price, planned_total,
                        actual_quantity, actual_amount
                    ) VALUES ($1, $2, $3, 0, 0, 0, $4, $5)
                `, [tenantId, budgetId, item.product_id, item.quantity, item.subtotal]);
            }
        }
    }

    async cloneBudget(tenantId: string, customerId: string, sourceBudgetId: string, targetMonth: number, targetYear: number) {
        return this.db.transaction(async (client) => {
            // 1. Fetch source budget and items
            const sourceBudget = await client.query(
                'SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
                [sourceBudgetId, tenantId, customerId]
            );
            if (sourceBudget.length === 0) throw new Error('Source budget not found');

            const sourceItems = await client.query(
                'SELECT * FROM budget_items WHERE budget_id = $1',
                [sourceBudgetId]
            );

            // 2. Prepare target budget data
            const input: BudgetCreateInput = {
                month: targetMonth,
                year: targetYear,
                type: sourceBudget[0].budget_type,
                items: sourceItems.map((i: any) => ({
                    productId: i.product_id,
                    plannedQuantity: i.planned_quantity,
                    plannedPrice: i.planned_price
                }))
            };

            // 3. Reuse createOrUpdateBudget logic
            return this.createOrUpdateBudget(tenantId, customerId, input);
        });
    }
}

let budgetServiceInstance: BudgetService | null = null;
export function getBudgetService(): BudgetService {
    if (!budgetServiceInstance) {
        budgetServiceInstance = new BudgetService();
    }
    return budgetServiceInstance;
}
