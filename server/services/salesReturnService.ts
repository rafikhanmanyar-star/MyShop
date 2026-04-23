import { getDatabaseService } from './databaseService.js';
import { insertReturnRestockBatch } from './inventoryBatchService.js';
import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';

export type RefundMethod = 'CASH' | 'BANK' | 'WALLET' | 'ADJUSTMENT';
export type ReturnType = 'FULL' | 'PARTIAL';

export interface ReturnLineInput {
  /** POS line (shop_sale_items.id) */
  saleLineItemId?: string;
  /** Mobile app line (mobile_order_items.id) */
  mobileOrderLineItemId?: string;
  quantity: number;
  restock?: boolean;
  reason?: string;
}

export interface CreateSalesReturnInput {
  originalSaleId?: string | null;
  originalMobileOrderId?: string | null;
  returnType: ReturnType;
  refundMethod: RefundMethod;
  bankAccountId?: string | null;
  notes?: string | null;
  items: ReturnLineInput[];
  userId?: string | null;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextReturnNumber(client: any, tenantId: string): Promise<string> {
  const rows = await client.query(
    `SELECT COUNT(*)::int AS c FROM shop_sales_returns WHERE tenant_id = $1`,
    [tenantId]
  );
  const n = (rows[0]?.c ?? 0) + 1;
  return `SR-${String(n).padStart(5, '0')}`;
}

async function getReturnedQtyByLine(client: any, tenantId: string, saleId: string): Promise<Map<string, number>> {
  const rows = await client.query(
    `SELECT i.sale_line_item_id AS line_id, COALESCE(SUM(i.quantity), 0)::numeric AS q
     FROM shop_sales_return_items i
     JOIN shop_sales_returns r ON r.id = i.sales_return_id AND r.tenant_id = i.tenant_id
     WHERE r.tenant_id = $1 AND r.original_sale_id = $2 AND i.sale_line_item_id IS NOT NULL
     GROUP BY i.sale_line_item_id`,
    [tenantId, saleId]
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(String(r.line_id), parseFloat(String(r.q)) || 0);
  }
  return map;
}

async function getReturnedQtyByMobileLine(client: any, tenantId: string, orderId: string): Promise<Map<string, number>> {
  const rows = await client.query(
    `SELECT i.mobile_order_line_item_id AS line_id, COALESCE(SUM(i.quantity), 0)::numeric AS q
     FROM shop_sales_return_items i
     JOIN shop_sales_returns r ON r.id = i.sales_return_id AND r.tenant_id = i.tenant_id
     WHERE r.tenant_id = $1 AND r.original_mobile_order_id = $2 AND i.mobile_order_line_item_id IS NOT NULL
     GROUP BY i.mobile_order_line_item_id`,
    [tenantId, orderId]
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(String(r.line_id), parseFloat(String(r.q)) || 0);
  }
  return map;
}

/**
 * Unit cost for returns/restock and COGS reversal: sale line snapshot, else the original sale inventory movement — never current product master.
 */
async function resolveUnitCostForReturnLine(
  client: any,
  tenantId: string,
  saleId: string,
  line: { unit_cost_at_sale?: unknown; product_id: string }
): Promise<number> {
  const raw = line.unit_cost_at_sale;
  if (raw != null && raw !== '') {
    const p = parseFloat(String(raw));
    if (Number.isFinite(p) && p >= 0) return p;
  }
  const mov = await client.query(
    `SELECT unit_cost FROM shop_inventory_movements
     WHERE tenant_id = $1 AND reference_id = $2 AND product_id = $3 AND type = 'Sale'
     ORDER BY created_at ASC NULLS LAST LIMIT 1`,
    [tenantId, saleId, line.product_id]
  );
  if (mov.length > 0 && mov[0].unit_cost != null && mov[0].unit_cost !== '') {
    const u = parseFloat(String(mov[0].unit_cost));
    if (Number.isFinite(u) && u >= 0) return u;
  }
  return 0;
}

async function resolveUnitCostForMobileReturnLine(
  client: any,
  tenantId: string,
  orderId: string,
  line: { unit_cost_at_sale?: unknown; product_id: string }
): Promise<number> {
  const raw = line.unit_cost_at_sale;
  if (raw != null && raw !== '') {
    const p = parseFloat(String(raw));
    if (Number.isFinite(p) && p >= 0) return p;
  }
  const mov = await client.query(
    `SELECT unit_cost FROM shop_inventory_movements
     WHERE tenant_id = $1 AND reference_id = $2 AND product_id = $3 AND type = 'MobileSale'
     ORDER BY created_at ASC NULLS LAST LIMIT 1`,
    [tenantId, orderId, line.product_id]
  );
  if (mov.length > 0 && mov[0].unit_cost != null && mov[0].unit_cost !== '') {
    const u = parseFloat(String(mov[0].unit_cost));
    if (Number.isFinite(u) && u >= 0) return u;
  }
  return 0;
}

async function resolveWarehouseId(
  client: any,
  tenantId: string,
  branchId: string | null
): Promise<string | null> {
  if (branchId) {
    const branchWh = await client.query(
      'SELECT id FROM shop_warehouses WHERE id = $1 AND tenant_id = $2 LIMIT 1',
      [branchId, tenantId]
    );
    if (branchWh.length > 0) return branchWh[0].id;
  }
  const whRes = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  return whRes.length > 0 ? whRes[0].id : null;
}

export class SalesReturnService {
  private db = getDatabaseService();

  async getReturnEligibility(tenantId: string, saleId: string) {
    const saleRows = await this.db.query(
      `SELECT s.id, s.sale_number AS "saleNumber", s.status, s.grand_total AS "grandTotal",
              s.customer_id AS "customerId", s.branch_id AS "branchId", s.payment_method AS "paymentMethod",
              s.points_earned AS "pointsEarned", s.loyalty_member_id AS "loyaltyMemberId"
       FROM shop_sales s WHERE s.id = $1 AND s.tenant_id = $2`,
      [saleId, tenantId]
    );
    if (saleRows.length === 0) return null;
    const sale = saleRows[0] as any;
    const returnedMap = await getReturnedQtyByLine(this.db, tenantId, saleId);

    const lines = await this.db.query(
      `SELECT si.id AS "saleLineItemId", si.product_id AS "productId", si.quantity AS "soldQty",
              si.unit_price AS "unitPrice", si.tax_amount AS "taxAmount", si.discount_amount AS "discountAmount",
              si.subtotal AS "lineSubtotal", si.unit_cost_at_sale AS "unitCostAtSale",
              p.name AS "productName"
       FROM shop_sale_items si
       LEFT JOIN shop_products p ON p.id = si.product_id AND p.tenant_id = $1
       WHERE si.sale_id = $2 AND si.tenant_id = $1
       ORDER BY si.created_at`,
      [tenantId, saleId]
    );

    const items = (lines as any[]).map((row) => {
      const sold = parseFloat(String(row.soldQty)) || 0;
      const returned = returnedMap.get(String(row.saleLineItemId)) || 0;
      const available = Math.max(0, roundMoney(sold - returned));
      return {
        ...row,
        alreadyReturned: returned,
        availableToReturn: available,
      };
    });

    const hasFullReturnAlready = sale.status === 'Refunded';
    const existingFull = await this.db.query(
      `SELECT id FROM shop_sales_returns WHERE tenant_id = $1 AND original_sale_id = $2 AND return_type = 'FULL' LIMIT 1`,
      [tenantId, saleId]
    );

    return {
      source: 'pos' as const,
      sale,
      blocked: sale.status === 'Void' || hasFullReturnAlready || existingFull.length > 0,
      blockReason:
        sale.status === 'Void'
          ? 'This sale is void and cannot be returned.'
          : hasFullReturnAlready || existingFull.length > 0
            ? 'This sale was already fully returned.'
            : null,
      items,
    };
  }

  /** Eligibility for a completed mobile order (delivered + paid). */
  async getMobileOrderReturnEligibility(tenantId: string, orderId: string) {
    const orderRows = await this.db.query(
      `SELECT o.id, o.order_number AS "orderNumber", o.status, o.payment_status AS "paymentStatus",
              o.grand_total AS "grandTotal", o.branch_id AS "branchId", o.payment_method AS "paymentMethod",
              o.customer_id AS "mobileCustomerId", o.return_status AS "returnStatus"
       FROM mobile_orders o WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, tenantId]
    );
    if (orderRows.length === 0) return null;
    const order = orderRows[0] as any;
    const returnedMap = await getReturnedQtyByMobileLine(this.db, tenantId, orderId);

    const lines = await this.db.query(
      `SELECT oi.id AS "mobileOrderLineItemId", oi.product_id AS "productId", oi.quantity AS "soldQty",
              oi.unit_price AS "unitPrice", oi.tax_amount AS "taxAmount", oi.discount_amount AS "discountAmount",
              oi.subtotal AS "lineSubtotal", oi.unit_cost_at_sale AS "unitCostAtSale",
              COALESCE(p.name, oi.product_name) AS "productName"
       FROM mobile_order_items oi
       LEFT JOIN shop_products p ON p.id = oi.product_id AND p.tenant_id = $1
       WHERE oi.order_id = $2 AND oi.tenant_id = $1
       ORDER BY oi.created_at`,
      [tenantId, orderId]
    );

    const items = (lines as any[]).map((row) => {
      const sold = parseFloat(String(row.soldQty)) || 0;
      const returned = returnedMap.get(String(row.mobileOrderLineItemId)) || 0;
      const available = Math.max(0, roundMoney(sold - returned));
      return {
        ...row,
        alreadyReturned: returned,
        availableToReturn: available,
      };
    });

    const hasFullReturnAlready = order.returnStatus === 'Full';
    const existingFull = await this.db.query(
      `SELECT id FROM shop_sales_returns WHERE tenant_id = $1 AND original_mobile_order_id = $2 AND return_type = 'FULL' LIMIT 1`,
      [tenantId, orderId]
    );

    const notDelivered = order.status !== 'Delivered';
    // Row uses AS "paymentStatus" — not payment_status (which would be undefined).
    const paymentStatus = order.paymentStatus ?? order.payment_status;
    const notPaid = paymentStatus !== 'Paid';

    return {
      source: 'mobile' as const,
      sale: {
        id: order.id,
        saleNumber: order.orderNumber,
        status: order.status,
        grandTotal: order.grandTotal,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
      blocked:
        notDelivered ||
        notPaid ||
        hasFullReturnAlready ||
        existingFull.length > 0,
      blockReason: notDelivered
        ? 'Only delivered mobile orders can be returned.'
        : notPaid
          ? 'Payment must be collected before processing a return.'
          : hasFullReturnAlready || existingFull.length > 0
            ? 'This order was already fully returned.'
            : null,
      items,
    };
  }

  async getMobileOrderReturnEligibilityByOrderNumber(tenantId: string, orderNumber: string) {
    const rows = await this.db.query(
      `SELECT id FROM mobile_orders WHERE tenant_id = $1 AND order_number = $2 LIMIT 1`,
      [tenantId, orderNumber.trim()]
    );
    if (rows.length === 0) return null;
    return this.getMobileOrderReturnEligibility(tenantId, rows[0].id);
  }

  async listReturns(tenantId: string, limit = 200) {
    return this.db.query(
      `SELECT r.id, r.return_number AS "returnNumber", r.original_sale_id AS "originalSaleId",
              r.original_mobile_order_id AS "originalMobileOrderId",
              COALESCE(s.sale_number, mo.order_number) AS "originalSaleNumber",
              CASE WHEN r.original_mobile_order_id IS NOT NULL THEN 'mobile' ELSE 'pos' END AS "source",
              r.customer_id AS "customerId", r.mobile_customer_id AS "mobileCustomerId",
              COALESCE(c.name, mc.name) AS "customerName",
              r.return_date AS "returnDate", r.return_type AS "returnType",
              r.refund_method AS "refundMethod", r.total_return_amount AS "totalReturnAmount",
              r.notes, r.created_at AS "createdAt",
              u.name AS "createdByName"
       FROM shop_sales_returns r
       LEFT JOIN shop_sales s ON s.id = r.original_sale_id AND s.tenant_id = r.tenant_id
       LEFT JOIN mobile_orders mo ON mo.id = r.original_mobile_order_id AND mo.tenant_id = r.tenant_id
       LEFT JOIN contacts c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
       LEFT JOIN mobile_customers mc ON mc.id = r.mobile_customer_id AND mc.tenant_id = r.tenant_id
       LEFT JOIN users u ON u.id = r.created_by AND u.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1
       ORDER BY r.return_date DESC, r.created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
  }

  async getReturnById(tenantId: string, returnId: string) {
    const rows = await this.db.query(
      `SELECT r.id, r.return_number AS "returnNumber", r.original_sale_id AS "originalSaleId",
              r.original_mobile_order_id AS "originalMobileOrderId",
              COALESCE(s.sale_number, mo.order_number) AS "originalSaleNumber",
              r.customer_id AS "customerId", r.mobile_customer_id AS "mobileCustomerId",
              r.return_date AS "returnDate", r.return_type AS "returnType",
              r.refund_method AS "refundMethod", r.total_return_amount AS "totalReturnAmount",
              r.notes, r.bank_account_id AS "bankAccountId", r.branch_id AS "branchId",
              r.created_at AS "createdAt",
              COALESCE(c.name, mc.name) AS "customerName", u.name AS "createdByName"
       FROM shop_sales_returns r
       LEFT JOIN shop_sales s ON s.id = r.original_sale_id AND s.tenant_id = r.tenant_id
       LEFT JOIN mobile_orders mo ON mo.id = r.original_mobile_order_id AND mo.tenant_id = r.tenant_id
       LEFT JOIN contacts c ON c.id = r.customer_id AND c.tenant_id = r.tenant_id
       LEFT JOIN mobile_customers mc ON mc.id = r.mobile_customer_id AND mc.tenant_id = r.tenant_id
       LEFT JOIN users u ON u.id = r.created_by AND u.tenant_id = r.tenant_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [returnId, tenantId]
    );
    if (rows.length === 0) return null;
    const ret = rows[0] as any;
    const items = await this.db.query(
      `SELECT i.id, i.quantity, i.unit_price AS "unitPrice", i.total_price AS "totalPrice",
              i.reason, i.restock, i.product_id AS "productId",
              i.sale_line_item_id AS "saleLineItemId",
              i.mobile_order_line_item_id AS "mobileOrderLineItemId",
              p.name AS "productName"
       FROM shop_sales_return_items i
       LEFT JOIN shop_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
       WHERE i.sales_return_id = $1 AND i.tenant_id = $2
       ORDER BY i.created_at`,
      [returnId, tenantId]
    );
    return { ...ret, items };
  }

  async createReturn(tenantId: string, input: CreateSalesReturnInput) {
    const { originalSaleId, originalMobileOrderId, returnType, refundMethod, items } = input;
    const hasSale = !!(originalSaleId && String(originalSaleId).trim());
    const hasMobile = !!(originalMobileOrderId && String(originalMobileOrderId).trim());
    if (hasSale === hasMobile) {
      throw new Error('Provide exactly one of originalSaleId or originalMobileOrderId');
    }
    if (!items?.length) throw new Error('Return must include at least one line');
    if (!refundMethod) throw new Error('Refund method is required');

    if (hasMobile) {
      for (const li of items) {
        if (!li.mobileOrderLineItemId || li.saleLineItemId) {
          throw new Error('Mobile order returns must use mobileOrderLineItemId only on each line');
        }
      }
      return this.createReturnForMobileOrder(tenantId, input, originalMobileOrderId!.trim());
    }

    for (const li of items) {
      if (!li.saleLineItemId || li.mobileOrderLineItemId) {
        throw new Error('POS returns must use saleLineItemId only on each line');
      }
    }

    const posSaleId = String(originalSaleId).trim();
    const result = await this.db.transaction(async (client) => {
      const saleRows = await client.query(
        `SELECT * FROM shop_sales WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [posSaleId, tenantId]
      );
      if (saleRows.length === 0) throw new Error('Original sale not found');
      const sale = saleRows[0] as any;
      if (sale.status === 'Void') throw new Error('Cannot return a void sale');
      if (sale.status === 'Refunded') throw new Error('Sale was already fully returned');
      const fullDup = await client.query(
        `SELECT id FROM shop_sales_returns WHERE tenant_id = $1 AND original_sale_id = $2 AND return_type = 'FULL' LIMIT 1`,
        [tenantId, posSaleId]
      );
      if (fullDup.length > 0) throw new Error('A full return already exists for this sale');

      const returnedMap = await getReturnedQtyByLine(client, tenantId, posSaleId);

      const lineRows = await client.query(
        `SELECT id, product_id, quantity, unit_price, tax_amount, discount_amount, subtotal, unit_cost_at_sale
         FROM shop_sale_items WHERE sale_id = $1 AND tenant_id = $2`,
        [posSaleId, tenantId]
      );
      const lineById = new Map<string, any>();
      for (const lr of lineRows) lineById.set(lr.id, lr);

      let totalReturnAmount = 0;
      const resolvedLines: {
        saleLine: any;
        qty: number;
        restock: boolean;
        reason: string | null;
        lineTotal: number;
        unitCost: number;
      }[] = [];

      for (const li of items) {
        const lineId = String(li.saleLineItemId);
        const line = lineById.get(lineId);
        if (!line) throw new Error(`Invalid sale line: ${li.saleLineItemId}`);
        const sold = parseFloat(String(line.quantity)) || 0;
        const already = returnedMap.get(lineId) || 0;
        const available = roundMoney(sold - already);
        const q = roundMoney(li.quantity);
        if (q <= 0) throw new Error('Return quantity must be positive');
        if (q > available + 1e-6) throw new Error(`Return qty exceeds available for a line (${available} left)`);

        const unitPrice = parseFloat(String(line.unit_price)) || 0;
        const lineSub = parseFloat(String(line.subtotal)) || 0;
        const lineTotal = roundMoney((lineSub / sold) * q);
        totalReturnAmount += lineTotal;

        const unitCost = await resolveUnitCostForReturnLine(client, tenantId, posSaleId, line);

        resolvedLines.push({
          saleLine: line,
          qty: q,
          restock: li.restock !== false,
          reason: li.reason?.trim() || null,
          lineTotal,
          unitCost,
        });
      }

      totalReturnAmount = roundMoney(totalReturnAmount);
      if (totalReturnAmount <= 0) throw new Error('Total return amount must be positive');

      const allSaleLines = await client.query(
        `SELECT id, quantity FROM shop_sale_items WHERE sale_id = $1 AND tenant_id = $2`,
        [posSaleId, tenantId]
      );
      const returnQtyByLine = new Map<string, number>();
      for (const li of items) {
        const key = String(li.saleLineItemId);
        const prev = returnQtyByLine.get(key) || 0;
        returnQtyByLine.set(key, roundMoney(prev + li.quantity));
      }

      let isFullReturn = true;
      for (const sl of allSaleLines) {
        const sold = parseFloat(String(sl.quantity)) || 0;
        const already = returnedMap.get(String(sl.id)) || 0;
        const thisRet = returnQtyByLine.get(String(sl.id)) || 0;
        const after = roundMoney(already + thisRet);
        if (after < sold - 1e-6) isFullReturn = false;
      }
      if (returnType === 'FULL' && !isFullReturn) {
        throw new Error('Full return requires every line to be returned in full');
      }
      if (returnType === 'PARTIAL' && isFullReturn) {
        throw new Error('Use FULL return type when returning the entire order');
      }

      if (refundMethod === 'BANK' && !input.bankAccountId) {
        throw new Error('Bank account is required for BANK refund');
      }

      const returnNumber = await nextReturnNumber(client, tenantId);
      const warehouseId = await resolveWarehouseId(client, tenantId, sale.branch_id);

      const ins = await client.query(
        `INSERT INTO shop_sales_returns (
           tenant_id, return_number, original_sale_id, customer_id, branch_id,
           return_date, return_type, refund_method, total_return_amount, notes,
           bank_account_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          tenantId,
          returnNumber,
          posSaleId,
          sale.customer_id,
          sale.branch_id,
          returnType,
          refundMethod,
          totalReturnAmount,
          input.notes ?? null,
          input.bankAccountId ?? null,
          input.userId ?? null,
        ]
      );
      const returnId = ins[0].id as string;

      for (const rl of resolvedLines) {
        await client.query(
          `INSERT INTO shop_sales_return_items (
             tenant_id, sales_return_id, sale_line_item_id, product_id,
             quantity, unit_price, total_price, reason, restock
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            tenantId,
            returnId,
            rl.saleLine.id,
            rl.saleLine.product_id,
            rl.qty,
            rl.saleLine.unit_price,
            rl.lineTotal,
            rl.reason,
            rl.restock,
          ]
        );

        if (rl.restock && warehouseId) {
          await client.query(
            `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand + $1
             WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
            [rl.qty, tenantId, rl.saleLine.product_id, warehouseId]
          );
          const unitCost = rl.unitCost > 0 ? rl.unitCost : null;
          const totalCost = unitCost != null ? roundMoney(unitCost * rl.qty) : null;
          await insertReturnRestockBatch(
            client,
            tenantId,
            rl.saleLine.product_id,
            warehouseId,
            rl.qty,
            unitCost,
            returnId
          );
          await client.query(
            `INSERT INTO shop_inventory_movements (
               tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, unit_cost, total_cost, reason
             ) VALUES ($1,$2,$3,'SaleReturn',$4,$5,$6,$7,$8,$9)`,
            [
              tenantId,
              rl.saleLine.product_id,
              warehouseId,
              rl.qty,
              returnId,
              input.userId ?? null,
              unitCost,
              totalCost,
              'Sales return',
            ]
          );
        }
      }

      if (isFullReturn) {
        await client.query(`UPDATE shop_sales SET status = 'Refunded', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
          posSaleId,
          tenantId,
        ]);
      }

      // Loyalty points reversal (proportional)
      if (sale.loyalty_member_id && (parseInt(String(sale.points_earned), 10) || 0) > 0 && parseFloat(String(sale.grand_total)) > 0) {
        const pts = Math.floor(
          (parseInt(String(sale.points_earned), 10) || 0) * (totalReturnAmount / parseFloat(String(sale.grand_total)))
        );
        if (pts > 0) {
          await client.query(
            `UPDATE shop_loyalty_members
             SET points_balance = GREATEST(0, points_balance - $1),
                 lifetime_points = GREATEST(0, lifetime_points - $1),
                 total_spend = GREATEST(0, total_spend - $2),
                 updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [pts, totalReturnAmount, sale.loyalty_member_id, tenantId]
          );
        }
      }

      // Cash / bank balance: refund pays out — reduce account balance
      const bankIdForCash = input.bankAccountId;
      if (refundMethod === 'CASH' || refundMethod === 'BANK') {
        let acctId = refundMethod === 'BANK' ? input.bankAccountId : null;
        if (refundMethod === 'CASH') {
          const cashBank = await client.query(
            `SELECT id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE ORDER BY name LIMIT 1`,
            [tenantId]
          );
          if (cashBank.length > 0) acctId = cashBank[0].id;
        }
        if (acctId) {
          await client.query(
            `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [totalReturnAmount, acctId, tenantId]
          );
        }
      }

      // Khata ledger: reduce customer obligation for any khata-tagged sale
      const isKhata = String(sale.payment_method || '').toLowerCase().includes('khata');
      if (isKhata && sale.customer_id && totalReturnAmount > 0) {
        await client.query(
          `INSERT INTO khata_ledger (tenant_id, customer_id, order_id, type, amount, note)
           VALUES ($1, $2, $3, 'credit', $4, $5)`,
          [tenantId, sale.customer_id, posSaleId, totalReturnAmount, `Return ${returnNumber}`]
        );
      }

      await this.postReturnAccounting(
        client,
        tenantId,
        returnId,
        returnNumber,
        totalReturnAmount,
        refundMethod,
        input.bankAccountId ?? null,
        sale,
        resolvedLines
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { id: returnId, returnNumber, totalReturnAmount };
    });

    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId, 'sales_return_created').catch(() => {});

    return result;
  }

  private async createReturnForMobileOrder(
    tenantId: string,
    input: CreateSalesReturnInput,
    orderId: string
  ): Promise<{ id: string; returnNumber: string; totalReturnAmount: number }> {
    const { returnType, refundMethod, items } = input;

    const result = await this.db.transaction(async (client) => {
      const orderRows = await client.query(
        `SELECT * FROM mobile_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [orderId, tenantId]
      );
      if (orderRows.length === 0) throw new Error('Mobile order not found');
      const order = orderRows[0] as any;
      if (order.status !== 'Delivered') throw new Error('Only delivered mobile orders can be returned');
      if (order.payment_status !== 'Paid') throw new Error('Payment must be collected before processing a return');
      if (order.return_status === 'Full') throw new Error('This order was already fully returned');

      const fullDup = await client.query(
        `SELECT id FROM shop_sales_returns WHERE tenant_id = $1 AND original_mobile_order_id = $2 AND return_type = 'FULL' LIMIT 1`,
        [tenantId, orderId]
      );
      if (fullDup.length > 0) throw new Error('A full return already exists for this order');

      const returnedMap = await getReturnedQtyByMobileLine(client, tenantId, orderId);

      const lineRows = await client.query(
        `SELECT id, product_id, quantity, unit_price, tax_amount, discount_amount, subtotal, unit_cost_at_sale
         FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2`,
        [orderId, tenantId]
      );
      const lineById = new Map<string, any>();
      for (const lr of lineRows) lineById.set(lr.id, lr);

      let totalReturnAmount = 0;
      const resolvedLines: {
        orderLine: any;
        qty: number;
        restock: boolean;
        reason: string | null;
        lineTotal: number;
        unitCost: number;
      }[] = [];

      for (const li of items) {
        const lineId = li.mobileOrderLineItemId!;
        const line = lineById.get(lineId);
        if (!line) throw new Error(`Invalid mobile order line: ${lineId}`);
        const sold = parseFloat(String(line.quantity)) || 0;
        const already = returnedMap.get(String(lineId)) || 0;
        const available = roundMoney(sold - already);
        const q = roundMoney(li.quantity);
        if (q <= 0) throw new Error('Return quantity must be positive');
        if (q > available + 1e-6) throw new Error(`Return qty exceeds available for a line (${available} left)`);

        const lineSub = parseFloat(String(line.subtotal)) || 0;
        const lineTotal = roundMoney((lineSub / sold) * q);
        totalReturnAmount += lineTotal;

        const unitCost = await resolveUnitCostForMobileReturnLine(client, tenantId, orderId, line);

        resolvedLines.push({
          orderLine: line,
          qty: q,
          restock: li.restock !== false,
          reason: li.reason?.trim() || null,
          lineTotal,
          unitCost,
        });
      }

      totalReturnAmount = roundMoney(totalReturnAmount);
      if (totalReturnAmount <= 0) throw new Error('Total return amount must be positive');

      const allOrderLines = await client.query(
        `SELECT id, quantity FROM mobile_order_items WHERE order_id = $1 AND tenant_id = $2`,
        [orderId, tenantId]
      );
      const returnQtyByLine = new Map<string, number>();
      for (const li of items) {
        const key = String(li.mobileOrderLineItemId);
        const prev = returnQtyByLine.get(key) || 0;
        returnQtyByLine.set(key, roundMoney(prev + li.quantity));
      }

      let isFullReturn = true;
      for (const sl of allOrderLines) {
        const sold = parseFloat(String(sl.quantity)) || 0;
        const already = returnedMap.get(String(sl.id)) || 0;
        const thisRet = returnQtyByLine.get(String(sl.id)) || 0;
        const after = roundMoney(already + thisRet);
        if (after < sold - 1e-6) isFullReturn = false;
      }
      if (returnType === 'FULL' && !isFullReturn) {
        throw new Error('Full return requires every line to be returned in full');
      }
      if (returnType === 'PARTIAL' && isFullReturn) {
        throw new Error('Use FULL return type when returning the entire order');
      }

      if (refundMethod === 'BANK' && !input.bankAccountId) {
        throw new Error('Bank account is required for BANK refund');
      }

      const returnNumber = await nextReturnNumber(client, tenantId);
      const warehouseId = await resolveWarehouseId(client, tenantId, order.branch_id);

      const ins = await client.query(
        `INSERT INTO shop_sales_returns (
           tenant_id, return_number, original_sale_id, original_mobile_order_id, mobile_customer_id, customer_id, branch_id,
           return_date, return_type, refund_method, total_return_amount, notes,
           bank_account_id, created_by
         ) VALUES ($1,$2,NULL,$3,$4,NULL,$5,NOW(),$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          tenantId,
          returnNumber,
          orderId,
          order.customer_id,
          order.branch_id,
          returnType,
          refundMethod,
          totalReturnAmount,
          input.notes ?? null,
          input.bankAccountId ?? null,
          input.userId ?? null,
        ]
      );
      const returnId = ins[0].id as string;

      for (const rl of resolvedLines) {
        await client.query(
          `INSERT INTO shop_sales_return_items (
             tenant_id, sales_return_id, sale_line_item_id, mobile_order_line_item_id, product_id,
             quantity, unit_price, total_price, reason, restock
           ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9)`,
          [
            tenantId,
            returnId,
            rl.orderLine.id,
            rl.orderLine.product_id,
            rl.qty,
            rl.orderLine.unit_price,
            rl.lineTotal,
            rl.reason,
            rl.restock,
          ]
        );

        if (rl.restock && warehouseId) {
          await client.query(
            `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand + $1
             WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
            [rl.qty, tenantId, rl.orderLine.product_id, warehouseId]
          );
          const unitCostVal = rl.unitCost > 0 ? rl.unitCost : null;
          const totalCost = unitCostVal != null ? roundMoney(unitCostVal * rl.qty) : null;
          await insertReturnRestockBatch(
            client,
            tenantId,
            rl.orderLine.product_id,
            warehouseId,
            rl.qty,
            unitCostVal,
            returnId
          );
          await client.query(
            `INSERT INTO shop_inventory_movements (
               tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, unit_cost, total_cost, reason
             ) VALUES ($1,$2,$3,'SaleReturn',$4,$5,$6,$7,$8,$9)`,
            [
              tenantId,
              rl.orderLine.product_id,
              warehouseId,
              rl.qty,
              returnId,
              input.userId ?? null,
              unitCostVal,
              totalCost,
              'Sales return (mobile)',
            ]
          );
        }
      }

      if (isFullReturn) {
        await client.query(
          `UPDATE mobile_orders SET return_status = 'Full', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [orderId, tenantId]
        );
      } else {
        await client.query(
          `UPDATE mobile_orders SET return_status = 'Partial', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND return_status = 'None'`,
          [orderId, tenantId]
        );
      }

      if (refundMethod === 'CASH' || refundMethod === 'BANK') {
        let acctId = refundMethod === 'BANK' ? input.bankAccountId : null;
        if (refundMethod === 'CASH') {
          const cashBank = await client.query(
            `SELECT id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE ORDER BY name LIMIT 1`,
            [tenantId]
          );
          if (cashBank.length > 0) acctId = cashBank[0].id;
        }
        if (acctId) {
          await client.query(
            `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [totalReturnAmount, acctId, tenantId]
          );
        }
      }

      const saleLike = {
        payment_method: order.payment_method,
        customer_id: null as string | null,
      };

      await this.postReturnAccounting(
        client,
        tenantId,
        returnId,
        returnNumber,
        totalReturnAmount,
        refundMethod,
        input.bankAccountId ?? null,
        saleLike,
        resolvedLines.map((rl) => ({ qty: rl.qty, restock: rl.restock, unitCost: rl.unitCost }))
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { id: returnId, returnNumber, totalReturnAmount };
    });

    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId, 'sales_return_created').catch(() => {});

    return result;
  }

  private async postReturnAccounting(
    client: any,
    tenantId: string,
    returnId: string,
    returnNumber: string,
    totalReturnAmount: number,
    refundMethod: RefundMethod,
    bankAccountId: string | null,
    sale: any,
    resolvedLines: { qty: number; restock: boolean; unitCost: number }[]
  ) {
    const accounting = getAccountingService();
    const getAcc = (code: string, name: string, type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense') =>
      accounting.getOrCreateAccountByCode(tenantId, code, name, type, client);

    const journalRes = await client.query(
      `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
       VALUES ($1, NOW(), $2, $3, 'SALES_RETURN', $4, 'Posted') RETURNING id`,
      [tenantId, returnNumber, `Sales return ${returnNumber}`, returnId]
    );
    if (journalRes.length === 0) return;
    const journalId = journalRes[0].id;

    const salesReturnsAcc = await getAcc(COA.SALES_RETURNS, 'Sales Returns', 'Income');
    const isCredit = sale.payment_method === 'Credit';
    const isKhata = String(sale.payment_method || '').toLowerCase().includes('khata');

    await client.query(
      `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
       VALUES ($1, $2, $3, $4, 0)`,
      [tenantId, journalId, salesReturnsAcc, totalReturnAmount]
    );

    if (refundMethod === 'WALLET') {
      const walletAcc = await getAcc(COA.CUSTOMER_ADVANCES, 'Customer Advances (Store Credit)', 'Liability');
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, walletAcc, totalReturnAmount]
      );
    } else if (refundMethod === 'ADJUSTMENT') {
      const arAcc = await getAcc(COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset');
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, arAcc, totalReturnAmount]
      );
      if (isCredit && !isKhata && sale.customer_id) {
        await client.query(
          `INSERT INTO customer_balance (tenant_id, customer_id, balance)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, customer_id) DO UPDATE SET balance = customer_balance.balance - $3, updated_at = NOW()`,
          [tenantId, sale.customer_id, totalReturnAmount]
        );
      }
    } else {
      let creditAccId: string;
      if (refundMethod === 'BANK' && bankAccountId) {
        const [bank] = await client.query(
          'SELECT name, account_type, chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
          [bankAccountId, tenantId]
        );
        if (bank?.chart_account_id) {
          creditAccId = bank.chart_account_id;
        } else {
          const accCode = bank?.account_type === 'Cash' ? COA.CASH_ON_HAND : COA.MAIN_BANK;
          const accName = bank?.account_type === 'Cash' ? 'Cash on Hand' : 'Main Bank Account';
          creditAccId = await getAcc(accCode, accName, 'Asset');
        }
      } else {
        const cashBank = await client.query(
          `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE ORDER BY name LIMIT 1`,
          [tenantId]
        );
        if (cashBank.length > 0 && cashBank[0].chart_account_id) {
          creditAccId = cashBank[0].chart_account_id;
        } else {
          creditAccId = await getAcc(COA.CASH_ON_HAND, 'Cash on Hand', 'Asset');
        }
      }
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, creditAccId, totalReturnAmount]
      );
    }

    let totalCogsReverse = 0;
    for (const rl of resolvedLines) {
      if (!rl.restock || rl.unitCost <= 0) continue;
      totalCogsReverse += rl.unitCost * rl.qty;
    }
    totalCogsReverse = roundMoney(totalCogsReverse);
    if (totalCogsReverse > 0) {
      const invAcc = await getAcc(COA.MERCHANDISE_INVENTORY, 'Merchandise Inventory', 'Asset');
      const cogsAcc = await getAcc(COA.COST_OF_GOODS_SOLD, 'Cost of Goods Sold', 'Expense');
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, invAcc, totalCogsReverse]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, cogsAcc, totalCogsReverse]
      );
    }
  }
}

let instance: SalesReturnService | null = null;
export function getSalesReturnService(): SalesReturnService {
  if (!instance) instance = new SalesReturnService();
  return instance;
}
