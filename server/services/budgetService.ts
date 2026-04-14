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

export interface SuggestedItem {
    product_id: string;
    product_name: string;
    product_sku: string;
    image_url: string | null;
    retail_price: number;
    suggested_qty: number;
    suggested_amount: number;
    last_month_qty: number;
    last_month_amount: number;
    purchase_count: number;
    is_frequent: boolean;
}

export class BudgetService {
    private db = getDatabaseService();

    async createOrUpdateBudget(tenantId: string, customerId: string, input: BudgetCreateInput) {
        return this.db.transaction(async (client) => {
            let totalAmount = 0;
            const itemsToInsert: any[] = [];

            for (const item of input.items) {
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

            await client.query('DELETE FROM budget_items WHERE budget_id = $1 AND tenant_id = $2', [budgetId, tenantId]);

            for (const item of itemsToInsert) {
                await client.query(`
                    INSERT INTO budget_items (
                        tenant_id, budget_id, product_id, planned_quantity, planned_price, planned_total
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `, [tenantId, budgetId, item.productId, item.plannedQuantity, item.plannedPrice, item.plannedTotal]);
            }

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
            `SELECT v.*, p.image_url FROM budget_vs_actual_view v 
             LEFT JOIN shop_products p ON v.product_id = p.id
             WHERE v.budget_id = $1 AND v.tenant_id = $2`,
            [budgetId, tenantId]
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
                SUM(CASE WHEN actual_amount > planned_total THEN actual_amount - planned_total ELSE 0 END) as total_overspent,
                COUNT(*) as total_items,
                SUM(CASE WHEN actual_amount > planned_total AND planned_total > 0 THEN 1 ELSE 0 END) as exceeded_items,
                SUM(CASE WHEN actual_amount > 0 AND actual_amount <= planned_total THEN 1 ELSE 0 END) as within_items,
                SUM(CASE WHEN actual_amount = 0 THEN 1 ELSE 0 END) as untouched_items
            FROM budget_items 
            WHERE budget_id = $1 AND tenant_id = $2
        `, [budget.id, tenantId]);

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
            budgetType: budget.budget_type,
            progress: totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0,
            totalItems: parseInt(stats.total_items) || 0,
            exceededItems: parseInt(stats.exceeded_items) || 0,
            withinItems: parseInt(stats.within_items) || 0,
            untouchedItems: parseInt(stats.untouched_items) || 0,
        };
    }

    /**
     * Generate auto-suggested budget based on last month's actual purchases.
     * Uses +10% buffer on quantities and amounts.
     * Also flags frequently purchased items (bought 2+ of last 3 months).
     */
    async getAutoSuggestedBudget(tenantId: string, customerId: string, targetMonth: number, targetYear: number): Promise<{ suggestions: SuggestedItem[], hasData: boolean }> {
        let refMonth = targetMonth - 1;
        let refYear = targetYear;
        if (refMonth < 1) { refMonth = 12; refYear--; }

        const salesData = await this.db.query(`
            SELECT 
                COALESCE(mi.product_id, si.product_id) as product_id,
                COALESCE(SUM(mi.quantity), 0) + COALESCE(SUM(si.quantity), 0) as total_qty,
                COALESCE(SUM(mi.subtotal), 0) + COALESCE(SUM(si.subtotal), 0) as total_amount,
                COUNT(*) as purchase_count
            FROM (
                SELECT mi2.product_id, mi2.quantity, mi2.subtotal
                FROM mobile_order_items mi2
                JOIN mobile_orders mo ON mi2.order_id = mo.id
                WHERE mo.tenant_id = $1 AND mo.customer_id = $2 AND mo.status = 'Delivered'
                  AND EXTRACT(MONTH FROM mo.created_at) = $3 AND EXTRACT(YEAR FROM mo.created_at) = $4
            ) mi
            FULL OUTER JOIN (
                SELECT si2.product_id, si2.quantity, si2.subtotal
                FROM shop_sale_items si2
                JOIN shop_sales ss ON si2.sale_id = ss.id
                WHERE ss.tenant_id = $1 AND ss.customer_id = $2
                  AND EXTRACT(MONTH FROM ss.created_at) = $3 AND EXTRACT(YEAR FROM ss.created_at) = $4
            ) si ON mi.product_id = si.product_id
            GROUP BY COALESCE(mi.product_id, si.product_id)
            HAVING COALESCE(SUM(mi.quantity), 0) + COALESCE(SUM(si.quantity), 0) > 0
            ORDER BY total_amount DESC
        `, [tenantId, customerId, refMonth, refYear]);

        if (salesData.length === 0) {
            return { suggestions: [], hasData: false };
        }

        const frequencyData = await this.getFrequentProducts(tenantId, customerId, targetMonth, targetYear);
        const frequentSet = new Set(frequencyData.map((f: any) => f.product_id));

        const productIds = salesData.map((s: any) => s.product_id);
        const placeholders = productIds.map((_: string, i: number) => `$${i + 2}`).join(',');
        const productsResult = await this.db.query(
            `SELECT id, name, sku, retail_price, image_url FROM shop_products WHERE id IN (${placeholders}) AND tenant_id = $1`,
            [tenantId, ...productIds]
        );

        const productMap = new Map(productsResult.map((p: any) => [p.id, p]));

        const suggestions: SuggestedItem[] = salesData
            .filter((s: any) => productMap.has(s.product_id))
            .map((s: any) => {
                const product = productMap.get(s.product_id)!;
                const lastQty = parseFloat(s.total_qty) || 0;
                const lastAmt = parseFloat(s.total_amount) || 0;
                const suggestedQty = Math.ceil(lastQty * 1.1);
                const currentPrice = parseFloat(product.retail_price) || 0;
                return {
                    product_id: s.product_id,
                    product_name: product.name,
                    product_sku: product.sku,
                    image_url: product.image_url,
                    retail_price: currentPrice,
                    suggested_qty: suggestedQty,
                    suggested_amount: currentPrice * suggestedQty,
                    last_month_qty: lastQty,
                    last_month_amount: lastAmt,
                    purchase_count: parseInt(s.purchase_count) || 0,
                    is_frequent: frequentSet.has(s.product_id),
                };
            });

        return { suggestions, hasData: true };
    }

    /**
     * Find products purchased in at least 2 of the last 3 months.
     */
    private async getFrequentProducts(tenantId: string, customerId: string, currentMonth: number, currentYear: number) {
        const months: { m: number; y: number }[] = [];
        for (let i = 1; i <= 3; i++) {
            let m = currentMonth - i;
            let y = currentYear;
            if (m < 1) { m += 12; y--; }
            months.push({ m, y });
        }

        const conditions = months.map((_, i) => `(EXTRACT(MONTH FROM order_date) = $${i * 2 + 3} AND EXTRACT(YEAR FROM order_date) = $${i * 2 + 4})`).join(' OR ');
        const params: any[] = [tenantId, customerId];
        months.forEach(({ m, y }) => { params.push(m, y); });

        const result = await this.db.query(`
            SELECT product_id, COUNT(DISTINCT month_key) as months_purchased
            FROM (
                SELECT mi.product_id, EXTRACT(YEAR FROM mo.created_at) * 100 + EXTRACT(MONTH FROM mo.created_at) as month_key, mo.created_at as order_date
                FROM mobile_order_items mi
                JOIN mobile_orders mo ON mi.order_id = mo.id
                WHERE mo.tenant_id = $1 AND mo.customer_id = $2 AND mo.status = 'Delivered'
                  AND (${conditions})
                UNION ALL
                SELECT si.product_id, EXTRACT(YEAR FROM ss.created_at) * 100 + EXTRACT(MONTH FROM ss.created_at) as month_key, ss.created_at as order_date
                FROM shop_sale_items si
                JOIN shop_sales ss ON si.sale_id = ss.id
                WHERE ss.tenant_id = $1 AND ss.customer_id = $2
                  AND (${conditions})
            ) combined
            GROUP BY product_id
            HAVING COUNT(DISTINCT month_key) >= 2
        `, params);

        return result;
    }

    /**
     * Get a budget alert/notification status for the customer.
     */
    async getBudgetAlerts(tenantId: string, customerId: string) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(year, month, 0).getDate();

        const alerts: { type: string; message: string; severity: 'info' | 'warning' | 'danger' }[] = [];

        const summary = await this.getMonthlySummary(tenantId, customerId, month, year);

        if (summary) {
            if (summary.progress >= 100) {
                alerts.push({ type: 'exceeded', message: `You have exceeded your monthly budget by Rs. ${Math.round(summary.totalOverspent).toLocaleString()}`, severity: 'danger' });
            } else if (summary.progress >= 80) {
                alerts.push({ type: 'near_limit', message: `You have used ${Math.round(summary.progress)}% of your monthly budget`, severity: 'warning' });
            }

            if (dayOfMonth >= 25 && summary.progress < 100) {
                const projectedSpend = (summary.totalActual / dayOfMonth) * daysInMonth;
                if (projectedSpend > summary.totalBudget) {
                    alerts.push({ type: 'projected_exceed', message: `At this rate, you may exceed your budget by month end`, severity: 'warning' });
                }
            }
        }

        if (!summary && dayOfMonth <= 5) {
            let prevMonth = month - 1;
            let prevYear = year;
            if (prevMonth < 1) { prevMonth = 12; prevYear--; }
            const prevBudget = await this.getMonthlySummary(tenantId, customerId, prevMonth, prevYear);
            if (prevBudget) {
                alerts.push({ type: 'new_month', message: `Create your budget for this month based on last month's spending`, severity: 'info' });
            }
        }

        if (dayOfMonth >= daysInMonth - 2 && summary) {
            alerts.push({ type: 'month_end', message: `Your monthly budget is ready for review`, severity: 'info' });
        }

        return { alerts, hasBudget: !!summary, month, year };
    }

    async updateActualsFromOrder(client: any, tenantId: string, customerId: string, items: { productId: string, quantity: number, subtotal: number }[]) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const budgets = await client.query(
            'SELECT id FROM budgets WHERE tenant_id = $1 AND customer_id = $2 AND month = $3 AND year = $4 AND status = \'active\'',
            [tenantId, customerId, month, year]
        );
        if (budgets.length === 0) return;

        const budgetId = budgets[0].id;

        for (const item of items) {
            const existing = await client.query(
                'SELECT id FROM budget_items WHERE budget_id = $1 AND product_id = $2 AND tenant_id = $3',
                [budgetId, item.productId, tenantId]
            );

            if (existing.length > 0) {
                await client.query(`
                    UPDATE budget_items 
                    SET actual_quantity = actual_quantity + $1,
                        actual_amount = actual_amount + $2,
                        updated_at = NOW()
                    WHERE id = $3 AND tenant_id = $4
                `, [item.quantity, item.subtotal, existing[0].id, tenantId]);
            } else {
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
        await client.query('UPDATE budget_items SET actual_quantity = 0, actual_amount = 0 WHERE budget_id = $1 AND tenant_id = $2', [budgetId, tenantId]);

        const mobileOrders = await client.query(`
            SELECT mi.product_id, mi.quantity, mi.subtotal
            FROM mobile_order_items mi
            JOIN mobile_orders m ON mi.order_id = m.id
            WHERE m.tenant_id = $1 AND m.customer_id = $2 AND m.status = 'Delivered'
              AND EXTRACT(MONTH FROM m.created_at) = $3 AND EXTRACT(YEAR FROM m.created_at) = $4
        `, [tenantId, customerId, month, year]);

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
                'SELECT id FROM budget_items WHERE budget_id = $1 AND product_id = $2 AND tenant_id = $3',
                [budgetId, item.product_id, tenantId]
            );

            if (existing.length > 0) {
                await client.query(`
                    UPDATE budget_items 
                    SET actual_quantity = actual_quantity + $1,
                        actual_amount = actual_amount + $2,
                        updated_at = NOW()
                    WHERE id = $3 AND tenant_id = $4
                `, [item.quantity, item.subtotal, existing[0].id, tenantId]);
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
            const sourceBudget = await client.query(
                'SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
                [sourceBudgetId, tenantId, customerId]
            );
            if (sourceBudget.length === 0) throw new Error('Source budget not found');

            const sourceItems = await client.query(
                'SELECT * FROM budget_items WHERE budget_id = $1 AND tenant_id = $2',
                [sourceBudgetId, tenantId]
            );

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

            return this.createOrUpdateBudget(tenantId, customerId, input);
        });
    }

    /**
     * Close previous month's budget if still active.
     */
    async closePreviousMonthBudget(tenantId: string, customerId: string) {
        const now = new Date();
        let prevMonth = now.getMonth(); // 0-indexed, so getMonth() gives previous month number in 1-index
        let prevYear = now.getFullYear();
        if (prevMonth < 1) { prevMonth = 12; prevYear--; }

        await this.db.query(
            `UPDATE budgets SET status = 'closed', updated_at = NOW() 
             WHERE tenant_id = $1 AND customer_id = $2 AND month = $3 AND year = $4 AND status = 'active'`,
            [tenantId, customerId, prevMonth, prevYear]
        );
    }
}

let budgetServiceInstance: BudgetService | null = null;
export function getBudgetService(): BudgetService {
    if (!budgetServiceInstance) {
        budgetServiceInstance = new BudgetService();
    }
    return budgetServiceInstance;
}
