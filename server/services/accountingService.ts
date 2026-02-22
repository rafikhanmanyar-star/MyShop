import { getDatabaseService } from './databaseService.js';

export class AccountingService {
  private db = getDatabaseService();

  /**
   * Get all chart-of-accounts entries (from `accounts` table)
   * with balance computed from the sum of ledger debits/credits.
   */
  async getAccountsWithBalances(tenantId: string) {
    return this.db.query(`
      SELECT
        a.id, a.name, a.code, a.type, a.is_active,
        COALESCE(SUM(le.debit), 0) as total_debit,
        COALESCE(SUM(le.credit), 0) as total_credit,
        CASE
          WHEN a.type IN ('Asset', 'Expense')
            THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
          ELSE
            COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
        END as balance
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.tenant_id = $1
      WHERE a.tenant_id = $1
      GROUP BY a.id, a.name, a.code, a.type, a.is_active
      ORDER BY a.code ASC
    `, [tenantId]);
  }

  /**
   * Get journal entries with their ledger lines.
   * Includes source_module to distinguish POS vs Mobile.
   */
  async getJournalEntries(tenantId: string, limit = 200) {
    const entries = await this.db.query(`
      SELECT
        je.id, je.date, je.reference, je.description,
        je.status, je.source_module, je.source_id,
        je.created_at
      FROM journal_entries je
      WHERE je.tenant_id = $1
      ORDER BY je.date DESC, je.created_at DESC
      LIMIT $2
    `, [tenantId, limit]);

    // Fetch ledger lines for all entries in one query
    if (entries.length === 0) return [];

    // Fetch all ledger lines for this tenant (filtering in memory for SQLite compat)
    const entryIdSet = new Set(entries.map((e: any) => e.id));
    const lines = await this.db.query(`
      SELECT
        le.id, le.journal_entry_id, le.account_id,
        a.name as account_name, a.code as account_code, a.type as account_type,
        le.debit, le.credit
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      WHERE le.tenant_id = $1
      ORDER BY le.created_at ASC
    `, [tenantId]);

    // Group lines by journal entry
    const linesByEntry: Record<string, any[]> = {};
    for (const line of lines) {
      if (!entryIdSet.has(line.journal_entry_id)) continue;
      if (!linesByEntry[line.journal_entry_id]) {
        linesByEntry[line.journal_entry_id] = [];
      }
      linesByEntry[line.journal_entry_id].push({
        id: line.id,
        accountId: line.account_id,
        accountName: line.account_name,
        accountCode: line.account_code,
        accountType: line.account_type,
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
      });
    }

    return entries.map((e: any) => ({
      id: e.id,
      date: e.date,
      reference: e.reference,
      description: e.description,
      status: e.status,
      sourceModule: e.source_module,
      sourceId: e.source_id,
      createdAt: e.created_at,
      lines: linesByEntry[e.id] || [],
    }));
  }

  /**
   * Get financial summary computed from ledger entries.
   * Returns P&L-style breakdown.
   */
  async getFinancialSummary(tenantId: string) {
    const result = await this.db.query(`
      SELECT
        a.type,
        COALESCE(SUM(le.debit), 0) as total_debit,
        COALESCE(SUM(le.credit), 0) as total_credit
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.tenant_id = $1
      WHERE a.tenant_id = $1
      GROUP BY a.type
    `, [tenantId]);

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalExpenses = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let receivablesTotal = 0;

    for (const row of result) {
      const debit = parseFloat(row.total_debit) || 0;
      const credit = parseFloat(row.total_credit) || 0;

      switch (row.type) {
        case 'Income':
          totalRevenue = credit - debit;
          break;
        case 'Expense':
          totalExpenses = debit - credit;
          break;
        case 'Asset':
          totalAssets = debit - credit;
          break;
        case 'Liability':
          totalLiabilities = credit - debit;
          break;
        case 'Equity':
          totalEquity = credit - debit;
          break;
      }
    }

    // Get COGS specifically
    const cogsResult = await this.db.query(`
      SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) as cogs
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      WHERE le.tenant_id = $1 AND a.code = 'EXP-500'
    `, [tenantId]);
    totalCOGS = parseFloat(cogsResult[0]?.cogs) || 0;

    // Get Accounts Receivable balance
    const arResult = await this.db.query(`
      SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) as ar_balance
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      WHERE le.tenant_id = $1 AND a.code = 'AST-120'
    `, [tenantId]);
    receivablesTotal = parseFloat(arResult[0]?.ar_balance) || 0;

    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = totalRevenue - totalExpenses;
    const netMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalExpenses,
      netProfit,
      netMargin,
      totalAssets,
      totalLiabilities,
      totalEquity,
      receivablesTotal,
    };
  }

  /**
   * Get bank account balances from shop_bank_accounts.
   * These are the "physical" cash/bank balances.
   */
  async getBankBalances(tenantId: string) {
    return this.db.query(`
      SELECT id, name, code, account_type, currency, balance, is_active, created_at, updated_at
      FROM shop_bank_accounts
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY name ASC
    `, [tenantId]);
  }

  /**
   * Get sales breakdown by source (POS vs Mobile)
   * for analytics dashboard.
   */
  async getSalesBySource(tenantId: string) {
    // POS sales
    const posSales = await this.db.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COALESCE(AVG(grand_total), 0) as avg_order_value,
        'POS' as source
      FROM shop_sales
      WHERE tenant_id = $1 AND status = 'Completed'
    `, [tenantId]);

    // Mobile sales (delivered)
    const mobileSales = await this.db.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COALESCE(AVG(grand_total), 0) as avg_order_value,
        'Mobile' as source
      FROM mobile_orders
      WHERE tenant_id = $1 AND status = 'Delivered'
    `, [tenantId]);

    return {
      pos: {
        totalOrders: parseInt(posSales[0]?.total_orders) || 0,
        totalRevenue: parseFloat(posSales[0]?.total_revenue) || 0,
        avgOrderValue: parseFloat(posSales[0]?.avg_order_value) || 0,
      },
      mobile: {
        totalOrders: parseInt(mobileSales[0]?.total_orders) || 0,
        totalRevenue: parseFloat(mobileSales[0]?.total_revenue) || 0,
        avgOrderValue: parseFloat(mobileSales[0]?.avg_order_value) || 0,
      },
    };
  }

  /**
   * Daily revenue trend for the last N days, broken down by source.
   */
  async getDailyRevenueTrend(tenantId: string, days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    const posTrend = await this.db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as order_count,
        COALESCE(SUM(grand_total), 0) as revenue
      FROM shop_sales
      WHERE tenant_id = $1 AND status = 'Completed'
        AND created_at >= $2
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, [tenantId, cutoffStr]);

    const mobileTrend = await this.db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as order_count,
        COALESCE(SUM(grand_total), 0) as revenue
      FROM mobile_orders
      WHERE tenant_id = $1 AND status = 'Delivered'
        AND created_at >= $2
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, [tenantId, cutoffStr]);

    return { pos: posTrend, mobile: mobileTrend };
  }

  /**
   * Category performance from actual sales data
   */
  async getCategoryPerformance(tenantId: string) {
    return this.db.query(`
      SELECT
        COALESCE(c.name, 'Uncategorized') as category,
        COUNT(DISTINCT s.id) as total_sales,
        COALESCE(SUM(si.subtotal), 0) as revenue,
        COALESCE(SUM(si.quantity), 0) as units_sold
      FROM shop_sale_items si
      JOIN shop_sales s ON si.sale_id = s.id AND s.tenant_id = $1
      JOIN shop_products p ON si.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE si.tenant_id = $1
      GROUP BY c.name
      ORDER BY revenue DESC
      LIMIT 10
    `, [tenantId]);
  }

  /**
   * Recent transactions list (combined POS + Mobile)
   */
  async getRecentTransactions(tenantId: string, limit = 50) {
    return this.db.query(`
      SELECT id, sale_number as reference, grand_total as amount,
        payment_method, 'POS' as source, created_at, status
      FROM shop_sales
      WHERE tenant_id = $1
      
      UNION ALL
      
      SELECT id, order_number as reference, grand_total as amount,
        payment_method, 'Mobile' as source, created_at, status
      FROM mobile_orders
      WHERE tenant_id = $1 AND status = 'Delivered'
      
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenantId, limit]);
  }

  /**
   * Post journal entry + ledger for a manual entry (from UI)
   */
  async postManualJournalEntry(tenantId: string, data: {
    date: string;
    reference: string;
    description: string;
    lines: Array<{
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
    }>;
  }) {
    return this.db.transaction(async (client: any) => {
      const journalRes = await client.query(`
        INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, status)
        VALUES ($1, $2, $3, $4, 'Manual', 'Posted')
        RETURNING id
      `, [tenantId, data.date, data.reference, data.description]);

      const journalId = journalRes[0].id;

      for (const line of data.lines) {
        if (line.debit > 0 || line.credit > 0) {
          await client.query(`
            INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
            VALUES ($1, $2, $3, $4, $5)
          `, [tenantId, journalId, line.accountId, line.debit || 0, line.credit || 0]);
        }
      }

      // Update account balances in accounts table
      for (const line of data.lines) {
        if (line.debit > 0 || line.credit > 0) {
          await client.query(`
            UPDATE accounts
            SET balance = (
              SELECT CASE
                WHEN a2.type IN ('Asset', 'Expense')
                  THEN COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)
                ELSE
                  COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)
              END
              FROM accounts a2
              LEFT JOIN ledger_entries le ON le.account_id = a2.id AND le.tenant_id = $1
              WHERE a2.id = $2
            ),
            updated_at = NOW()
            WHERE id = $2 AND tenant_id = $1
          `, [tenantId, line.accountId]);
        }
      }

      // Invalidate report aggregates
      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { journalId };
    });
  }
}

let accountingServiceInstance: AccountingService | null = null;
export function getAccountingService(): AccountingService {
  if (!accountingServiceInstance) {
    accountingServiceInstance = new AccountingService();
  }
  return accountingServiceInstance;
}
