import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';
import { COA, EXPENSE_CATEGORY_TO_COA } from '../constants/accountCodes.js';

const DEFAULT_CATEGORY_NAMES = [
  'Salaries', 'Rent', 'Utilities', 'Maintenance', 'Marketing', 'Transportation', 'Office Supplies', 'Miscellaneous',
];
const DEFAULT_CATEGORIES = DEFAULT_CATEGORY_NAMES.map((name, i) => ({
  name,
  code: EXPENSE_CATEGORY_TO_COA[name] || '61001',
  isSystem: true,
  sortOrder: i + 1,
}));

export interface CreateExpenseInput {
  expenseDate: string;
  categoryId: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank' | 'Credit';
  payeeName?: string;
  vendorId?: string;
  description?: string;
  attachmentUrl?: string;
  branchId?: string;
  recurring?: boolean;
  referenceNumber?: string;
  taxAmount?: number;
  paymentAccountId?: string; // required for Cash/Bank
  createdBy?: string;
}

export class ExpenseService {
  private db = getDatabaseService();

  /** Ensure default expense categories exist for tenant (with Chart of Accounts links) */
  async ensureDefaultCategories(tenantId: string): Promise<void> {
    const existing = await this.db.query(
      'SELECT id FROM expense_categories WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    if (existing.length > 0) return;

    for (const cat of DEFAULT_CATEGORIES) {
      const accountId = await getAccountingService().getOrCreateAccountByCode(
        tenantId, cat.code, `${cat.name} Expense`, 'Expense'
      );
      await this.db.query(
        `INSERT INTO expense_categories (tenant_id, name, account_id, is_system, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, cat.name, accountId, cat.isSystem, cat.sortOrder]
      );
    }
  }

  /** Get or create Accounts Payable account for tenant (21101 Trade Payables) */
  private async getOrCreateAccountsPayable(tenantId: string, client: any): Promise<string> {
    return getAccountingService().getOrCreateAccountByCode(
      tenantId, COA.TRADE_PAYABLES, 'Trade Payables (Suppliers)', 'Liability', client
    );
  }

  /** Get chart account id for a bank/cash account (shop_bank_accounts.chart_account_id) */
  private async getPaymentChartAccountId(tenantId: string, paymentAccountId: string, client: any): Promise<string | null> {
    const rows = await client.query(
      `SELECT chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2`,
      [paymentAccountId, tenantId]
    );
    if (rows.length === 0 || rows[0].chart_account_id == null) return null;
    return rows[0].chart_account_id;
  }

  /** Create expense and post double-entry journal. Cash/Bank: Dr Expense Cr Cash/Bank. Credit: Dr Expense Cr AP */
  async createExpense(tenantId: string, input: CreateExpenseInput): Promise<any> {
    if (!input.expenseDate || !input.categoryId || input.amount == null || input.amount <= 0) {
      const err: any = new Error('Expense date, category, and positive amount are required.');
      err.statusCode = 400;
      throw err;
    }
    if (input.paymentMethod !== 'Credit' && !input.paymentAccountId) {
      const err: any = new Error('Payment account is required for Cash/Bank expenses.');
      err.statusCode = 400;
      throw err;
    }

    const result = await this.db.transaction(async (client: any) => {
      await this.ensureDefaultCategories(tenantId);

      const categoryRow = await client.query(
        `SELECT ec.id, ec.account_id, ec.name as category_name FROM expense_categories ec
         WHERE ec.id = $1 AND ec.tenant_id = $2`,
        [input.categoryId, tenantId]
      );
      if (categoryRow.length === 0) {
        const err: any = new Error('Expense category not found.');
        err.statusCode = 404;
        throw err;
      }
      const expenseAccountId = categoryRow[0].account_id;
      const categoryName = categoryRow[0].category_name;

      const status = input.paymentMethod === 'Credit' ? 'unpaid' : 'paid';
      const ref = input.referenceNumber || `EXP-${Date.now()}`;
      const description = input.description || `${categoryName} - ${input.payeeName || 'Expense'}`;

      let creditAccountId: string;
      if (input.paymentMethod === 'Credit') {
        creditAccountId = await this.getOrCreateAccountsPayable(tenantId, client);
      } else {
        const chartId = await this.getPaymentChartAccountId(tenantId, input.paymentAccountId!, client);
        if (!chartId) {
          const err: any = new Error('Payment account is not linked to Chart of Accounts.');
          err.statusCode = 400;
          throw err;
        }
        creditAccountId = chartId;
      }

      const journalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, $2, $3, $4, 'Expense', NULL, 'Posted')
         RETURNING id`,
        [tenantId, input.expenseDate, ref, description]
      );
      const journalId = journalRes[0].id;

      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, expenseAccountId, input.amount]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, creditAccountId, input.amount]
      );

      const expenseRes = await client.query(
        `INSERT INTO expenses (
          tenant_id, branch_id, category_id, vendor_id, payee_name, amount,
          payment_account_id, expense_date, description, attachment_url, status,
          payment_method, reference_number, tax_amount, journal_entry_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id`,
        [
          tenantId,
          input.branchId || null,
          input.categoryId,
          input.vendorId || null,
          input.payeeName || null,
          input.amount,
          input.paymentAccountId || null,
          input.expenseDate,
          input.description || null,
          input.attachmentUrl || null,
          status,
          input.paymentMethod,
          input.referenceNumber || null,
          input.taxAmount ?? 0,
          journalId,
          input.createdBy || null,
        ]
      );
      const expenseId = expenseRes[0].id;

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { id: expenseId, journalEntryId: journalId };
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    return result;
  }

  /** List expenses with optional filters */
  async listExpenses(tenantId: string, filters: {
    fromDate?: string;
    toDate?: string;
    categoryId?: string;
    vendorId?: string;
    paymentMethod?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ rows: any[]; total: number }> {
    await this.ensureDefaultCategories(tenantId);

    const conditions: string[] = ['e.tenant_id = $1'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (filters.fromDate) {
      conditions.push(`e.expense_date >= $${idx}`);
      params.push(filters.fromDate);
      idx++;
    }
    if (filters.toDate) {
      conditions.push(`e.expense_date <= $${idx}`);
      params.push(filters.toDate);
      idx++;
    }
    if (filters.categoryId) {
      conditions.push(`e.category_id = $${idx}`);
      params.push(filters.categoryId);
      idx++;
    }
    if (filters.vendorId) {
      conditions.push(`e.vendor_id = $${idx}`);
      params.push(filters.vendorId);
      idx++;
    }
    if (filters.paymentMethod) {
      conditions.push(`e.payment_method = $${idx}`);
      params.push(filters.paymentMethod);
      idx++;
    }
    if (filters.search && filters.search.trim()) {
      conditions.push(`(e.description LIKE $${idx} OR e.payee_name LIKE $${idx} OR e.reference_number LIKE $${idx})`);
      params.push(`%${filters.search.trim()}%`);
      idx++;
    }
    const whereClause = conditions.join(' AND ');
    const limit = Math.min(filters.limit ?? 500, 10000);
    const offset = filters.offset ?? 0;

    const countRes = await this.db.query(
      `SELECT COUNT(*) as total FROM expenses e WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countRes[0]?.total ?? '0', 10);

    const rows = await this.db.query(
      `SELECT e.id, e.tenant_id, e.branch_id, e.category_id, e.vendor_id, e.payee_name, e.amount,
              e.payment_account_id, e.expense_date, e.description, e.attachment_url, e.status,
              e.payment_method, e.recurring_id, e.reference_number, e.tax_amount, e.journal_entry_id,
              e.created_by, e.created_at,
              ec.name as category_name,
              b.name as branch_name,
              v.name as vendor_name,
              sba.name as payment_account_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id AND ec.tenant_id = e.tenant_id
       LEFT JOIN shop_branches b ON e.branch_id = b.id AND b.tenant_id = e.tenant_id
       LEFT JOIN shop_vendors v ON e.vendor_id = v.id AND v.tenant_id = e.tenant_id
       LEFT JOIN shop_bank_accounts sba ON e.payment_account_id = sba.id AND sba.tenant_id = e.tenant_id
       WHERE ${whereClause}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return {
      rows: rows.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        payeeName: r.payee_name,
        amount: parseFloat(r.amount) || 0,
        paymentAccountId: r.payment_account_id,
        paymentAccountName: r.payment_account_name,
        expenseDate: r.expense_date,
        description: r.description,
        attachmentUrl: r.attachment_url,
        status: r.status,
        paymentMethod: r.payment_method,
        recurringId: r.recurring_id,
        referenceNumber: r.reference_number,
        taxAmount: parseFloat(r.tax_amount) || 0,
        journalEntryId: r.journal_entry_id,
        createdBy: r.created_by,
        createdAt: r.created_at,
        branchName: r.branch_name,
      })),
      total,
    };
  }

  /** Get single expense by id */
  async getExpenseById(tenantId: string, expenseId: string): Promise<any | null> {
    const all = await this.db.query(
      `SELECT e.*, ec.name as category_name, b.name as branch_name, v.name as vendor_name,
              sba.name as payment_account_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       LEFT JOIN shop_branches b ON e.branch_id = b.id
       LEFT JOIN shop_vendors v ON e.vendor_id = v.id
       LEFT JOIN shop_bank_accounts sba ON e.payment_account_id = sba.id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [expenseId, tenantId]
    );
    if (all.length === 0) return null;
    const r = all[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      payeeName: r.payee_name,
      amount: parseFloat(r.amount) || 0,
      paymentAccountId: r.payment_account_id,
      paymentAccountName: r.payment_account_name,
      expenseDate: r.expense_date,
      description: r.description,
      attachmentUrl: r.attachment_url,
      status: r.status,
      paymentMethod: r.payment_method,
      recurringId: r.recurring_id,
      referenceNumber: r.reference_number,
      taxAmount: parseFloat(r.tax_amount) || 0,
      journalEntryId: r.journal_entry_id,
      createdBy: r.created_by,
      createdAt: r.created_at,
      branchName: r.branch_name,
    };
  }

  /** Delete expense and reverse journal entry (Credit expense account, Debit cash/bank/AP) */
  async deleteExpense(tenantId: string, expenseId: string): Promise<void> {
    const expense = await this.getExpenseById(tenantId, expenseId);
    if (!expense) {
      const err: any = new Error('Expense not found.');
      err.statusCode = 404;
      throw err;
    }
    if (!expense.journalEntryId) {
      await this.db.query('DELETE FROM expenses WHERE id = $1 AND tenant_id = $2', [expenseId, tenantId]);
      const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
      notifyDailyReportUpdated(tenantId).catch(() => {});
      return;
    }

    await this.db.transaction(async (client: any) => {
      const lines = await client.query(
        `SELECT account_id, debit, credit FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2`,
        [expense.journalEntryId, tenantId]
      );
      const reverseRef = `REV-${expense.referenceNumber || expenseId}`;
      const reverseDesc = `Reversal: ${expense.description || 'Expense'}`;
      const nowDate = new Date().toISOString().slice(0, 10);
      const journalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, $2, $3, $4, 'Expense', $5, 'Posted')
         RETURNING id`,
        [tenantId, nowDate, reverseRef, reverseDesc, expenseId]
      );
      const revJournalId = journalRes[0]?.id;
      if (!revJournalId) throw new Error('Failed to create reversal journal entry.');

      for (const line of lines) {
        await client.query(
          `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, revJournalId, line.account_id, line.credit || 0, line.debit || 0]
        );
      }
      await client.execute('DELETE FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2', [expense.journalEntryId, tenantId]);
      await client.execute('DELETE FROM journal_entries WHERE id = $1 AND tenant_id = $2', [expense.journalEntryId, tenantId]);
      await client.execute('DELETE FROM expenses WHERE id = $1 AND tenant_id = $2', [expenseId, tenantId]);
      await client.execute('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
  }

  /** Get expense categories for tenant */
  async getCategories(tenantId: string): Promise<any[]> {
    await this.ensureDefaultCategories(tenantId);
    const rows = await this.db.query(
      `SELECT ec.id, ec.tenant_id, ec.name, ec.account_id, ec.is_system, ec.sort_order, a.code as account_code
       FROM expense_categories ec
       JOIN accounts a ON ec.account_id = a.id AND a.tenant_id = ec.tenant_id
       WHERE ec.tenant_id = $1
       ORDER BY ec.sort_order ASC, ec.name ASC`,
      [tenantId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      accountId: r.account_id,
      accountCode: r.account_code,
      isSystem: !!r.is_system,
      sortOrder: r.sort_order,
    }));
  }

  /** Create custom expense category (admin) */
  async createCategory(tenantId: string, data: { name: string; accountId: string }): Promise<any> {
    if (!data.name?.trim() || !data.accountId) {
      const err: any = new Error('Name and Chart of Accounts account are required.');
      err.statusCode = 400;
      throw err;
    }
    const existing = await this.db.query(
      `SELECT id FROM expense_categories WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
      [tenantId, data.name.trim()]
    );
    if (existing.length > 0) {
      const err: any = new Error('A category with this name already exists.');
      err.statusCode = 409;
      throw err;
    }
    const acc = await this.db.query(
      `SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2 AND type = 'Expense'`,
      [data.accountId, tenantId]
    );
    if (acc.length === 0) {
      const err: any = new Error('Invalid expense account.');
      err.statusCode = 400;
      throw err;
    }
    const res = await this.db.query(
      `INSERT INTO expense_categories (tenant_id, name, account_id, is_system, sort_order)
       VALUES ($1, $2, $3, FALSE, 999)
       RETURNING id, name, account_id, is_system, sort_order`,
      [tenantId, data.name.trim(), data.accountId]
    );
    return res[0];
  }

  /** Recurring: list */
  async listRecurring(tenantId: string): Promise<any[]> {
    const rows = await this.db.query(
      `SELECT r.*, ec.name as category_name
       FROM recurring_expenses r
       JOIN expense_categories ec ON r.category_id = ec.id AND ec.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1
       ORDER BY r.next_run_date ASC`,
      [tenantId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      amount: parseFloat(r.amount) || 0,
      frequency: r.frequency,
      nextRunDate: r.next_run_date,
      autoGenerate: !!r.auto_generate,
      lastGeneratedAt: r.last_generated_at,
      payeeName: r.payee_name,
      paymentAccountId: r.payment_account_id,
      paymentMethod: r.payment_method,
      description: r.description,
      createdAt: r.created_at,
    }));
  }

  /** Recurring: create */
  async createRecurring(tenantId: string, data: {
    categoryId: string;
    amount: number;
    frequency: 'weekly' | 'monthly' | 'yearly';
    nextRunDate: string;
    autoGenerate?: boolean;
    payeeName?: string;
    paymentAccountId?: string;
    paymentMethod?: string;
    description?: string;
  }): Promise<any> {
    if (!data.categoryId || data.amount <= 0 || !data.nextRunDate || !data.frequency) {
      const err: any = new Error('Category, amount, frequency, and next run date are required.');
      err.statusCode = 400;
      throw err;
    }
    const res = await this.db.query(
      `INSERT INTO recurring_expenses (tenant_id, category_id, amount, frequency, next_run_date, auto_generate, payee_name, payment_account_id, payment_method, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        tenantId,
        data.categoryId,
        data.amount,
        data.frequency,
        data.nextRunDate,
        data.autoGenerate !== false,
        data.payeeName || null,
        data.paymentAccountId || null,
        data.paymentMethod || 'Bank',
        data.description || null,
      ]
    );
    return { id: res[0].id };
  }

  /** Process due recurring expenses (create expense records and advance next_run_date) */
  async processDueRecurring(tenantId: string, upToDate: string, createdBy?: string): Promise<{ created: number }> {
    const rows = await this.db.query(
      `SELECT * FROM recurring_expenses WHERE tenant_id = $1 AND next_run_date <= $2 AND auto_generate = 1
       ORDER BY next_run_date ASC`,
      [tenantId, upToDate]
    );
    let created = 0;
    for (const r of rows) {
      try {
        await this.createExpense(tenantId, {
          expenseDate: r.next_run_date,
          categoryId: r.category_id,
          amount: parseFloat(r.amount) || 0,
          paymentMethod: (r.payment_method || 'Bank') as 'Cash' | 'Bank' | 'Credit',
          payeeName: r.payee_name,
          paymentAccountId: r.payment_account_id,
          description: r.description || `Recurring: ${r.frequency}`,
          createdBy,
        });
        created++;
        let nextRun: string;
        const d = new Date(r.next_run_date);
        if (r.frequency === 'weekly') {
          d.setDate(d.getDate() + 7);
        } else if (r.frequency === 'monthly') {
          d.setMonth(d.getMonth() + 1);
        } else {
          d.setFullYear(d.getFullYear() + 1);
        }
        nextRun = d.toISOString().slice(0, 10);
        await this.db.query(
          `UPDATE recurring_expenses SET next_run_date = $1, last_generated_at = $2, updated_at = $2 WHERE id = $3 AND tenant_id = $4`,
          [nextRun, new Date().toISOString().slice(0, 19).replace('T', ' '), r.id, tenantId]
        );
      } catch (e) {
        console.error('Recurring expense generation failed for', r.id, e);
      }
    }
    return { created };
  }

  /** Monthly expense summary */
  async getMonthlySummary(tenantId: string, year: number, month: number): Promise<any> {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${new Date(prevYear, prevMonth, 0).getDate()}`;

    const current = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, category_id, ec.name as category_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id AND ec.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.expense_date >= $2 AND e.expense_date <= $3
       GROUP BY e.category_id, ec.name`,
      [tenantId, start, end]
    );
    const prev = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date <= $3`,
      [tenantId, prevStart, prevEnd]
    );
    const prevTotal = parseFloat(prev[0]?.total ?? 0) || 0;
    const currTotal = current.reduce((s: number, r: any) => s + (parseFloat(r.total) || 0), 0);
    const growth = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;

    return {
      totalExpenses: currTotal,
      previousMonthTotal: prevTotal,
      growthPercent: growth,
      byCategory: current.map((r: any) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        total: parseFloat(r.total) || 0,
      })),
    };
  }

  /** Category-wise expense report (for charts) */
  async getCategoryWiseReport(tenantId: string, fromDate: string, toDate: string): Promise<any[]> {
    const rows = await this.db.query(
      `SELECT ec.name as category_name, e.category_id, COALESCE(SUM(e.amount), 0) as total
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id AND ec.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.expense_date >= $2 AND e.expense_date <= $3
       GROUP BY e.category_id, ec.name
       ORDER BY total DESC`,
      [tenantId, fromDate, toDate]
    );
    return rows.map((r: any) => ({
      categoryName: r.category_name || 'Uncategorized',
      categoryId: r.category_id,
      total: parseFloat(r.total) || 0,
    }));
  }

  /** Expense vs Revenue (for P&L integration) */
  async getExpenseVsRevenue(tenantId: string, fromDate: string, toDate: string): Promise<any> {
    const expenseRows = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date <= $3`,
      [tenantId, fromDate, toDate]
    );
    const salesRevenue = await this.db.query(
      `SELECT COALESCE(SUM(grand_total), 0) as total FROM shop_sales WHERE tenant_id = $1 AND status = 'Completed' AND DATE(created_at) >= $2 AND DATE(created_at) <= $3`,
      [tenantId, fromDate, toDate]
    );
    const mobileRevenue = await this.db.query(
      `SELECT COALESCE(SUM(grand_total), 0) as total FROM mobile_orders WHERE tenant_id = $1 AND status IN ('Confirmed','Packed','OutForDelivery','Delivered') AND DATE(created_at) >= $2 AND DATE(created_at) <= $3`,
      [tenantId, fromDate, toDate]
    );
    const totalExpenses = parseFloat(expenseRows[0]?.total ?? 0) || 0;
    const totalRevenue = (parseFloat(salesRevenue[0]?.total ?? 0) || 0) + (parseFloat(mobileRevenue[0]?.total ?? 0) || 0);
    const netProfit = totalRevenue - totalExpenses;
    const expensePercent = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;

    return {
      totalSales: totalRevenue,
      totalExpenses,
      netProfit,
      expensePercentOfRevenue: expensePercent,
    };
  }

  /** Vendor expense report */
  async getVendorExpenseReport(tenantId: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const joinConditions = ['e.vendor_id = v.id', 'e.tenant_id = v.tenant_id'];
    const params: any[] = [tenantId];
    let idx = 2;
    if (fromDate) {
      joinConditions.push(`e.expense_date >= $${idx}`);
      params.push(fromDate);
      idx++;
    }
    if (toDate) {
      joinConditions.push(`e.expense_date <= $${idx}`);
      params.push(toDate);
      idx++;
    }
    const joinClause = `LEFT JOIN expenses e ON ${joinConditions.join(' AND ')}`;
    const rows = await this.db.query(
      `SELECT v.id as vendor_id, v.name as vendor_name,
              COALESCE(SUM(e.amount), 0) as total_paid,
              COUNT(e.id) as expense_count
       FROM shop_vendors v
       ${joinClause}
       WHERE v.tenant_id = $1
       GROUP BY v.id, v.name
       ORDER BY total_paid DESC`,
      params
    );
    return rows.map((r: any) => ({
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      totalPaid: parseFloat(r.total_paid) || 0,
      expenseCount: parseInt(r.expense_count, 10) || 0,
    }));
  }
}

let expenseServiceInstance: ExpenseService | null = null;
export function getExpenseService(): ExpenseService {
  if (!expenseServiceInstance) {
    expenseServiceInstance = new ExpenseService();
  }
  return expenseServiceInstance;
}
