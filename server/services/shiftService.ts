import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';

export interface CashierShift {
  id: string;
  tenant_id: string;
  cashier_id: string;
  terminal_id: string;
  opening_cash: number;
  opening_time: string;
  closing_cash_expected: number | null;
  closing_cash_actual: number | null;
  variance_amount: number | null;
  variance_reason: string | null;
  status: 'open' | 'closed';
  handed_over_to: string | null;
  closing_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftStats {
  totalSales: number;
  totalTransactions: number;
  averageBillValue: number;
  totalItemsSold: number;
  paymentBreakdown: { method: string; amount: number }[];
  cashCollected: number;
  cardCollected: number;
  bankTransfer: number;
  mobileWallet: number;
  creditSales: number;
  totalRefundAmount: number;
  refundCount: number;
  pettyCashUsed: number;
  shiftExpenses: number;
  expectedCash: number;
}

export interface CloseShiftPayload {
  closingCashActual: number;
  varianceReason?: string;
  handoverToUserId?: string;
  handoverAmount?: number;
}

export class ShiftService {
  private db = getDatabaseService();

  /** Get current open shift for cashier (optionally for a specific terminal). */
  async getCurrentShift(tenantId: string, cashierId: string, terminalId?: string): Promise<CashierShift | null> {
    let sql = `
      SELECT * FROM cashier_shifts
      WHERE tenant_id = $1 AND cashier_id = $2 AND status = 'open'
      ORDER BY opening_time DESC LIMIT 1
    `;
    const params: any[] = [tenantId, cashierId];
    if (terminalId) {
      sql = `
        SELECT * FROM cashier_shifts
        WHERE tenant_id = $1 AND cashier_id = $2 AND terminal_id = $3 AND status = 'open'
        ORDER BY opening_time DESC LIMIT 1
      `;
      params.push(terminalId);
    }
    const rows = await this.db.query(sql, params);
    return rows.length > 0 ? (rows[0] as CashierShift) : null;
  }

  /** Start a new shift. Fails if this cashier already has an open shift on this terminal. */
  async startShift(
    tenantId: string,
    cashierId: string,
    terminalId: string,
    openingCash: number
  ): Promise<CashierShift> {
    const existing = await this.getCurrentShift(tenantId, cashierId, terminalId);
    if (existing) {
      const err: any = new Error('You already have an open shift on this terminal. Close it first.');
      err.statusCode = 400;
      throw err;
    }
    const rows = await this.db.query(
      `INSERT INTO cashier_shifts (tenant_id, cashier_id, terminal_id, opening_cash)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, cashierId, terminalId, openingCash]
    );
    return rows[0] as CashierShift;
  }

  /** Get shift by id; ensure tenant match. For cashier: ensure shift belongs to them. */
  async getShiftById(tenantId: string, shiftId: string): Promise<CashierShift | null> {
    const rows = await this.db.query(
      'SELECT * FROM cashier_shifts WHERE id = $1 AND tenant_id = $2',
      [shiftId, tenantId]
    );
    return rows.length > 0 ? (rows[0] as CashierShift) : null;
  }

  /** Compute stats for a shift (sales linked by shift_id, or by terminal+cashier+time range). */
  async getShiftStats(tenantId: string, shiftId: string): Promise<ShiftStats> {
    const shift = await this.getShiftById(tenantId, shiftId);
    if (!shift) {
      const err: any = new Error('Shift not found');
      err.statusCode = 404;
      throw err;
    }

    const closingTime = shift.closing_time || '9999-12-31T23:59:59.999Z';
    // Include sales linked by shift_id OR by terminal+cashier+time range (for backwards compatibility / when shift_id not set)
    const sales = await this.db.query(
      `SELECT id, grand_total, payment_method, payment_details
       FROM shop_sales
       WHERE tenant_id = $1 AND status = 'Completed'
         AND (
           shift_id = $2
           OR (terminal_id IS NOT DISTINCT FROM $3 AND user_id IS NOT DISTINCT FROM $4 AND created_at >= $5 AND created_at <= $6)
         )
       ORDER BY created_at ASC`,
      [tenantId, shiftId, shift.terminal_id, shift.cashier_id, shift.opening_time, closingTime]
    );

    const totalSales = sales.reduce((sum: number, r: any) => sum + parseFloat(r.grand_total || 0), 0);
    const totalTransactions = sales.length;
    const totalItemsResult = await this.db.query(
      `SELECT COALESCE(SUM(si.quantity), 0) as qty
       FROM shop_sale_items si
       INNER JOIN shop_sales s ON s.id = si.sale_id AND s.tenant_id = $1 AND s.status = 'Completed'
         AND (s.shift_id = $2 OR (s.terminal_id IS NOT DISTINCT FROM $3 AND s.user_id IS NOT DISTINCT FROM $4 AND s.created_at >= $5 AND s.created_at <= $6))`,
      [tenantId, shiftId, shift.terminal_id, shift.cashier_id, shift.opening_time, closingTime]
    );
    const totalItemsSold = parseInt(totalItemsResult[0]?.qty || '0', 10);

    const paymentBreakdown: Record<string, number> = {};
    let cashCollected = 0, cardCollected = 0, bankTransfer = 0, mobileWallet = 0, creditSales = 0;
    for (const s of sales as any[]) {
      const details = Array.isArray(s.payment_details) ? s.payment_details : null;
      if (details && details.length > 0) {
        for (const p of details) {
          const m = (p.method || p.type || 'Cash').toLowerCase();
          const a = parseFloat(p.amount || 0);
          paymentBreakdown[m] = (paymentBreakdown[m] || 0) + a;
          if (m === 'cash') cashCollected += a;
          else if (m === 'card' || m === 'card_collected') cardCollected += a;
          else if (m === 'bank' || m === 'bank transfer') bankTransfer += a;
          else if (m === 'mobile' || m === 'mobile wallet') mobileWallet += a;
          else if (m === 'credit') creditSales += a;
          else cashCollected += a;
        }
      } else {
        const method = (s.payment_method || 'Cash').toLowerCase();
        const amt = parseFloat(s.grand_total || 0);
        paymentBreakdown[method] = (paymentBreakdown[method] || 0) + amt;
        if (method === 'cash') cashCollected += amt;
        else if (method === 'card' || method === 'card_collected') cardCollected += amt;
        else if (method === 'bank' || method === 'bank transfer') bankTransfer += amt;
        else if (method === 'mobile' || method === 'mobile wallet') mobileWallet += amt;
        else if (method === 'credit') creditSales += amt;
        else cashCollected += amt;
      }
    }
    const paymentBreakdownList = Object.entries(paymentBreakdown).map(([method, amount]) => ({ method, amount }));

    const refundRows = await this.db.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(grand_total), 0) as total
       FROM shop_sales
       WHERE tenant_id = $1 AND status = 'Refunded'
         AND (shift_id = $2 OR (terminal_id IS NOT DISTINCT FROM $3 AND user_id IS NOT DISTINCT FROM $4 AND created_at >= $5 AND created_at <= $6))`,
      [tenantId, shiftId, shift.terminal_id, shift.cashier_id, shift.opening_time, closingTime]
    );
    const totalRefundAmount = parseFloat(refundRows[0]?.total || 0);
    const refundCount = parseInt(refundRows[0]?.cnt || '0', 10);

    const expenseRows = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM shift_expenses WHERE tenant_id = $1 AND shift_id = $2`,
      [tenantId, shiftId]
    );
    const shiftExpenses = parseFloat(expenseRows[0]?.total || 0);
    const pettyCashUsed = shiftExpenses;

    const expectedCash =
      parseFloat(String(shift.opening_cash || 0)) +
      cashCollected -
      totalRefundAmount -
      pettyCashUsed;

    return {
      totalSales,
      totalTransactions,
      averageBillValue: totalTransactions > 0 ? totalSales / totalTransactions : 0,
      totalItemsSold,
      paymentBreakdown: paymentBreakdownList,
      cashCollected,
      cardCollected,
      bankTransfer,
      mobileWallet,
      creditSales,
      totalRefundAmount,
      refundCount,
      pettyCashUsed,
      shiftExpenses,
      expectedCash,
    };
  }

  /** Close shift: set closing_cash_expected, actual, variance; post accounting if variance; handover log; lock. */
  async closeShift(tenantId: string, shiftId: string, payload: CloseShiftPayload): Promise<CashierShift> {
    const shift = await this.getShiftById(tenantId, shiftId);
    if (!shift) {
      const err: any = new Error('Shift not found');
      err.statusCode = 404;
      throw err;
    }
    if (shift.status !== 'open') {
      const err: any = new Error('Shift is already closed');
      err.statusCode = 400;
      throw err;
    }

    const stats = await this.getShiftStats(tenantId, shiftId);
    const closingCashExpected = stats.expectedCash;
    const closingCashActual = payload.closingCashActual;
    const varianceAmount = closingCashActual - closingCashExpected;

    return this.db.transaction(async (client: any) => {
      if (Math.abs(varianceAmount) >= 0.01 && !payload.varianceReason) {
        const err: any = new Error('Variance reason is required when there is a shortage or excess.');
        err.statusCode = 400;
        throw err;
      }

      const accounting = getAccountingService();
      if (varianceAmount < -0.01) {
        await accounting.postCashVariance(
          tenantId,
          { shiftId, type: 'shortage', amount: Math.abs(varianceAmount), reason: payload.varianceReason },
          client
        );
      } else if (varianceAmount > 0.01) {
        await accounting.postCashVariance(
          tenantId,
          { shiftId, type: 'overage', amount: varianceAmount, reason: payload.varianceReason },
          client
        );
      }

      const handoverAmount = payload.handoverAmount ?? closingCashActual;
      if (payload.handoverToUserId && handoverAmount >= 0) {
        await client.query(
          `INSERT INTO cash_handover_logs (tenant_id, shift_id, from_cashier_id, to_user_id, amount, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            shiftId,
            shift.cashier_id,
            payload.handoverToUserId,
            handoverAmount,
            payload.varianceReason || null,
          ]
        );
      }

      await client.query(
        `UPDATE cashier_shifts
         SET closing_cash_expected = $1, closing_cash_actual = $2, variance_amount = $3, variance_reason = $4,
             status = 'closed', handed_over_to = $5, closing_time = NOW(), updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7`,
        [
          closingCashExpected,
          closingCashActual,
          varianceAmount,
          payload.varianceReason || null,
          payload.handoverToUserId || null,
          shiftId,
          tenantId,
        ]
      );

      const updated = await client.query(
        'SELECT * FROM cashier_shifts WHERE id = $1 AND tenant_id = $2',
        [shiftId, tenantId]
      );
      return updated[0] as CashierShift;
    });
  }

  /** List handover logs for a shift. */
  async listHandovers(tenantId: string, shiftId: string): Promise<any[]> {
    const rows = await this.db.query(
      `SELECT h.*, u_from.name as from_name, u_to.name as to_name
       FROM cash_handover_logs h
       LEFT JOIN users u_from ON u_from.id = h.from_cashier_id
       LEFT JOIN users u_to ON u_to.id = h.to_user_id
       WHERE h.tenant_id = $1 AND h.shift_id = $2
       ORDER BY h.recorded_at DESC`,
      [tenantId, shiftId]
    );
    return rows;
  }

  /** Admin: list shifts with optional filters. */
  async listShifts(
    tenantId: string,
    filters?: { status?: string; cashierId?: string; terminalId?: string; from?: string; to?: string; limit?: number }
  ): Promise<any[]> {
    let sql = `
      SELECT s.*, u.name as cashier_name, t.name as terminal_name, t.code as terminal_code, b.name as branch_name
      FROM cashier_shifts s
      LEFT JOIN users u ON u.id = s.cashier_id
      LEFT JOIN shop_terminals t ON t.id = s.terminal_id
      LEFT JOIN shop_branches b ON b.id = t.branch_id
      WHERE s.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters?.status) {
      sql += ` AND s.status = $${idx}`;
      params.push(filters.status);
      idx++;
    }
    if (filters?.cashierId) {
      sql += ` AND s.cashier_id = $${idx}`;
      params.push(filters.cashierId);
      idx++;
    }
    if (filters?.terminalId) {
      sql += ` AND s.terminal_id = $${idx}`;
      params.push(filters.terminalId);
      idx++;
    }
    if (filters?.from) {
      sql += ` AND s.opening_time >= $${idx}`;
      params.push(filters.from);
      idx++;
    }
    if (filters?.to) {
      sql += ` AND s.closing_time <= $${idx}`;
      params.push(filters.to);
      idx++;
    }
    sql += ' ORDER BY s.opening_time DESC';
    const limit = Math.min(filters?.limit ?? 50, 200);
    sql += ` LIMIT ${limit}`;
    return this.db.query(sql, params);
  }

  /** Admin: reopen a closed shift (audit trail). */
  async reopenShift(tenantId: string, shiftId: string, adminUserId: string): Promise<CashierShift> {
    const shift = await this.getShiftById(tenantId, shiftId);
    if (!shift) {
      const err: any = new Error('Shift not found');
      err.statusCode = 404;
      throw err;
    }
    if (shift.status !== 'closed') {
      const err: any = new Error('Shift is not closed');
      err.statusCode = 400;
      throw err;
    }
    await this.db.query(
      `UPDATE cashier_shifts
       SET status = 'open', closing_cash_expected = NULL, closing_cash_actual = NULL, variance_amount = NULL,
           variance_reason = NULL, handed_over_to = NULL, closing_time = NULL, reopened_by = $1, reopened_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [adminUserId, shiftId, tenantId]
    );
    const rows = await this.db.query('SELECT * FROM cashier_shifts WHERE id = $1 AND tenant_id = $2', [shiftId, tenantId]);
    return rows[0] as CashierShift;
  }

  /** Admin: variance summary and cashier performance (for dashboard). */
  async getAdminShiftSummary(tenantId: string, from?: string, to?: string): Promise<{
    openShifts: number;
    closedShifts: number;
    totalVarianceShortage: number;
    totalVarianceOverage: number;
    byCashier: { cashierId: string; cashierName: string; totalSales: number; transactionCount: number; varianceSum: number }[];
  }> {
    const openRows = await this.db.query(
      `SELECT COUNT(*) as c FROM cashier_shifts WHERE tenant_id = $1 AND status = 'open'`,
      [tenantId]
    );
    const closedRows = await this.db.query(
      `SELECT COUNT(*) as c FROM cashier_shifts WHERE tenant_id = $1 AND status = 'closed'`,
      [tenantId]
    );
    let varianceSql = `
      SELECT COALESCE(SUM(CASE WHEN variance_amount < 0 THEN variance_amount ELSE 0 END), 0) as shortage,
             COALESCE(SUM(CASE WHEN variance_amount > 0 THEN variance_amount ELSE 0 END), 0) as overage
      FROM cashier_shifts WHERE tenant_id = $1 AND status = 'closed'
    `;
    const vParams: any[] = [tenantId];
    if (from) {
      varianceSql += ' AND closing_time >= $2';
      vParams.push(from);
    }
    if (to) {
      varianceSql += ` AND closing_time <= $${vParams.length + 1}`;
      vParams.push(to);
    }
    const varianceRows = await this.db.query(varianceSql, vParams);
    const totalVarianceShortage = Math.abs(parseFloat(varianceRows[0]?.shortage || 0));
    const totalVarianceOverage = parseFloat(varianceRows[0]?.overage || 0);

    const byCashierSql = `
      SELECT s.cashier_id, u.name as cashier_name,
             (SELECT COALESCE(SUM(ss.grand_total), 0) FROM shop_sales ss WHERE ss.tenant_id = s.tenant_id AND ss.user_id = s.cashier_id AND ss.status = 'Completed') as total_sales,
             (SELECT COUNT(*) FROM shop_sales ss WHERE ss.tenant_id = s.tenant_id AND ss.user_id = s.cashier_id AND ss.status = 'Completed') as tx_count,
             COALESCE(SUM(s.variance_amount), 0) as variance_sum
      FROM cashier_shifts s
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.tenant_id = $1 AND s.status = 'closed'
      GROUP BY s.cashier_id, u.name, s.tenant_id
    `;
    const byCashierRows = await this.db.query(byCashierSql, [tenantId]);
    const byCashier = (byCashierRows as any[]).map((r) => ({
      cashierId: r.cashier_id,
      cashierName: r.cashier_name || 'Unknown',
      totalSales: parseFloat(r.total_sales || 0),
      transactionCount: parseInt(r.tx_count || '0', 10),
      varianceSum: parseFloat(r.variance_sum || 0),
    }));

    return {
      openShifts: parseInt(openRows[0]?.c || '0', 10),
      closedShifts: parseInt(closedRows[0]?.c || '0', 10),
      totalVarianceShortage,
      totalVarianceOverage,
      byCashier,
    };
  }
}

let shiftServiceInstance: ShiftService | null = null;
export function getShiftService(): ShiftService {
  if (!shiftServiceInstance) shiftServiceInstance = new ShiftService();
  return shiftServiceInstance;
}
