import { getDatabaseService } from './databaseService.js';
import { COA, LEGACY_TO_COA } from '../constants/accountCodes.js';
import { isPayFromEligibleAssetAccount } from '../utils/payFromAccounts.js';

export class AccountingService {
  private db = getDatabaseService();

  /**
   * Get account id by enterprise code (e.g. 41001) or legacy code (e.g. INC-400).
   * Tries preferred code first, then legacy mapping, so existing tenants keep working.
   */
  async getAccountIdByCode(tenantId: string, preferredCode: string, options?: { legacyCode?: string }): Promise<string | null> {
    const codesToTry = [preferredCode];
    if (options?.legacyCode) codesToTry.push(options.legacyCode);
    else if (LEGACY_TO_COA[preferredCode]) codesToTry.push(preferredCode); // already legacy
    const legacy = LEGACY_TO_COA[preferredCode];
    if (legacy && legacy !== preferredCode) codesToTry.push(legacy);
    for (const code of codesToTry) {
      const rows = await this.db.query(
        'SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE LIMIT 1',
        [tenantId, code]
      );
      if (rows.length > 0) return (rows[0] as any).id;
    }
    return null;
  }

  /**
   * Get or create an account by code. Use for posting (POS, procurement, expense, etc.).
   * Prefer enterprise code (e.g. COA.RETAIL_SALES); creates with name/type if missing (e.g. legacy tenants).
   * If an account with the same name already exists (e.g. legacy code), returns it to avoid
   * violating idx_accounts_tenant_name_unique.
   */
  async getOrCreateAccountByCode(
    tenantId: string,
    code: string,
    name: string,
    type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense',
    client?: any
  ): Promise<string> {
    const db = client || this.db;
    let rows = await db.query(
      'SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 LIMIT 1',
      [tenantId, code]
    );
    if (rows.length > 0) return (rows[0] as any).id;
    const legacy = LEGACY_TO_COA[code];
    if (legacy && legacy !== code) {
      rows = await db.query(
        'SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2 LIMIT 1',
        [tenantId, legacy]
      );
      if (rows.length > 0) return (rows[0] as any).id;
    }
    // Avoid duplicate key on (tenant_id, LOWER(name)): reuse existing account with same name (e.g. legacy name/code).
    const byName = await db.query(
      'SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
      [tenantId, name]
    );
    if (byName.length > 0) return (byName[0] as any).id;
    const normalBalance = type === 'Asset' || type === 'Expense' ? 'debit' : 'credit';
    const res = await db.query(
      `INSERT INTO accounts (tenant_id, name, code, type, normal_balance, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [tenantId, name, code, type, normalBalance]
    );
    return (res[0] as any).id;
  }

  /**
   * Get all chart-of-accounts entries (from `accounts` table)
   * with balance computed from the sum of ledger debits/credits.
   */
  async getAccountsWithBalances(tenantId: string) {
    return this.db.query(`
      SELECT
        a.id, a.name, a.code, a.type, a.description, a.is_active,
        a.parent_account_id, a.normal_balance, a.level,
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
      GROUP BY a.id, a.name, a.code, a.type, a.description, a.is_active, a.parent_account_id, a.normal_balance, a.level
      ORDER BY a.code ASC
    `, [tenantId]);
  }

  /**
   * Paginated journal entries with ledger lines and total count.
   * Optional search (reference/description) and source_module filter.
   */
  async getJournalEntriesPage(
    tenantId: string,
    opts: {
      limit: number;
      offset: number;
      search?: string;
      sourceModule?: string;
      /** Inclusive ISO date YYYY-MM-DD (compared against journal posting date portion). */
      dateFrom?: string;
      /** Inclusive ISO date YYYY-MM-DD */
      dateTo?: string;
    }
  ): Promise<{ items: any[]; total: number }> {
    const limit = Math.max(1, Math.min(opts.limit, 500));
    const offset = Math.max(0, opts.offset);

    const conditions: string[] = ['je.tenant_id = $1'];
    const params: any[] = [tenantId];
    let next = 2;

    const rawSearch = opts.search?.trim();
    if (rawSearch) {
      const safe = rawSearch.replace(/[%_\\]/g, '');
      if (safe) {
        const pattern = `%${safe}%`;
        conditions.push(
          `(LOWER(je.reference) LIKE LOWER($${next}) OR LOWER(COALESCE(je.description, '')) LIKE LOWER($${next}))`
        );
        params.push(pattern);
        next++;
      }
    }

    if (opts.sourceModule && ['POS', 'MobileApp', 'Manual'].includes(opts.sourceModule)) {
      conditions.push(`je.source_module = $${next}`);
      params.push(opts.sourceModule);
      next++;
    }

    const isoDay = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    if (opts.dateFrom && isoDay.test(opts.dateFrom)) {
      conditions.push(`substr(cast(je.date as text), 1, 10) >= $${next}`);
      params.push(opts.dateFrom);
      next++;
    }
    if (opts.dateTo && isoDay.test(opts.dateTo)) {
      conditions.push(`substr(cast(je.date as text), 1, 10) <= $${next}`);
      params.push(opts.dateTo);
      next++;
    }

    const whereClause = conditions.join(' AND ');

    const countRows = await this.db.query(
      `SELECT COUNT(*) as c FROM journal_entries je WHERE ${whereClause}`,
      params
    );
    const total = Number((countRows[0] as any)?.c ?? 0);

    const limIdx = next;
    const offIdx = next + 1;
    const dataParams = [...params, limit, offset];
    const entries = await this.db.query(
      `
      SELECT
        je.id, je.date, je.reference, je.description,
        je.status, je.source_module, je.source_id,
        je.created_at
      FROM journal_entries je
      WHERE ${whereClause}
      ORDER BY je.date DESC, je.created_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}
    `,
      dataParams
    );

    if (entries.length === 0) {
      return { items: [], total };
    }

    const entryIdSet = new Set(entries.map((e: any) => e.id));
    const lines = await this.db.query(
      `
      SELECT
        le.id, le.journal_entry_id, le.account_id,
        a.name as account_name, a.code as account_code, a.type as account_type,
        le.debit, le.credit
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
      WHERE le.tenant_id = $1
      ORDER BY le.created_at ASC
    `,
      [tenantId]
    );

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

    const items = entries.map((e: any) => ({
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

    return { items, total };
  }

  /**
   * Get journal entries with their ledger lines (first page / cap for cache & legacy callers).
   * Includes source_module to distinguish POS vs Mobile.
   */
  async getJournalEntries(tenantId: string, limit = 200) {
    const { items } = await this.getJournalEntriesPage(tenantId, { limit, offset: 0 });
    return items;
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

    // Get COGS specifically (enterprise 51001 or legacy EXP-500)
    const cogsResult = await this.db.query(`
      SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) as cogs
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
      WHERE le.tenant_id = $1 AND (a.code = $2 OR a.code = $3)
    `, [tenantId, COA.COST_OF_GOODS_SOLD, 'EXP-500']);
    totalCOGS = parseFloat(cogsResult[0]?.cogs) || 0;

    // Get Accounts Receivable balance (enterprise 11201 or legacy AST-120)
    const arResult = await this.db.query(`
      SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) as ar_balance
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
      WHERE le.tenant_id = $1 AND (a.code = $2 OR a.code = $3)
    `, [tenantId, COA.TRADE_RECEIVABLES, 'AST-120']);
    receivablesTotal = parseFloat(arResult[0]?.ar_balance) || 0;

    // Customer advances (khata credit balances): customers who have prepaid / overpaid sit
    // with a NET CREDIT balance in the khata subledger. The GL Trade Receivables account nets
    // these against debtors, understating both Accounts Receivable and showing a phantom
    // reduction in assets. Surface them so AR reflects GROSS debtors (matching the Khata Ledger)
    // and the credit balances are presented as a Customer Advances liability. Net effect on
    // equity is zero — assets and liabilities both rise by the same amount, so the books balance.
    let customerAdvances = 0;
    try {
      const advResult = await this.db.query(`
        SELECT COALESCE(SUM(credit_balance), 0) AS total_advances
        FROM (
          SELECT customer_id,
            SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)
            - SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) AS credit_balance
          FROM khata_ledger
          WHERE tenant_id = $1
          GROUP BY customer_id
          HAVING SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)
            - SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) > 0
        ) sub
      `, [tenantId]);
      customerAdvances = parseFloat(advResult[0]?.total_advances) || 0;
    } catch {
      customerAdvances = 0;
    }
    customerAdvances = Math.max(0, Math.round(customerAdvances * 100) / 100);

    // Reclassify: AR shows gross debtors, advances move to liabilities (books stay balanced).
    receivablesTotal = receivablesTotal + customerAdvances;
    totalAssets = totalAssets + customerAdvances;
    totalLiabilities = totalLiabilities + customerAdvances;

    // Live inventory valuation (stock on hand × cost). Stock added through opening balances or
    // manual stock adjustments updates shop_inventory WITHOUT any GL entry — only purchase bills
    // debit the Merchandise Inventory GL account and sales credit it. So the GL balance can sit at
    // ~0 even when real stock exists. Surface the live valuation and offset the gap to equity
    // (effectively opening-balance capital) so the accounting page reflects the inventory the
    // business actually holds while the balance sheet still foots (assets = liabilities + equity).
    let inventoryValuation = 0;
    try {
      const invVal = await this.db.query(`
        SELECT COALESCE(SUM(i.quantity_on_hand * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0) AS total_value
        FROM shop_products p
        JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = $1
        WHERE p.tenant_id = $1 AND p.is_active = TRUE
      `, [tenantId]);
      inventoryValuation = parseFloat(invVal[0]?.total_value) || 0;
    } catch {
      inventoryValuation = 0;
    }
    inventoryValuation = Math.round(inventoryValuation * 100) / 100;

    let glInventory = 0;
    try {
      const glInv = await this.db.query(`
        SELECT COALESCE(SUM(le.debit) - SUM(le.credit), 0) AS inv_balance
        FROM ledger_entries le
        JOIN accounts a ON le.account_id = a.id AND a.tenant_id = $1
        WHERE le.tenant_id = $1 AND (a.code LIKE '113%' OR a.code = 'AST-110')
      `, [tenantId]);
      glInventory = parseFloat(glInv[0]?.inv_balance) || 0;
    } catch {
      glInventory = 0;
    }

    const inventoryEquityAdjustment = Math.round((inventoryValuation - glInventory) * 100) / 100;
    totalAssets = totalAssets + inventoryEquityAdjustment;
    totalEquity = totalEquity + inventoryEquityAdjustment;

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
      customerAdvances,
      inventoryValuation,
      inventoryEquityAdjustment,
    };
  }

  /**
   * Cash & bank balances for the finance dashboard — one row per liquid pay-from asset
   * (111xx, legacy AST cash/bank, shop-linked accounts, and user-created leaf assets
   * such as HBL or NayaPay). Balances come from the GL so POS, procurement, expenses,
   * and khata payments stay in sync.
   */
  async getBankBalances(tenantId: string) {
    const shopRows = await this.db.query(`
      SELECT
        id, name, code, account_type, currency, balance, is_active, created_at, updated_at,
        chart_account_id
      FROM shop_bank_accounts
      WHERE tenant_id = $1 AND is_active = TRUE
      ORDER BY name ASC
    `, [tenantId]);

    const linkedChartIds = new Set(
      shopRows.map((r: any) => r.chart_account_id).filter(Boolean)
    );

    const allAssetRows = await this.db.query(`
      SELECT id, name, code, type, level, parent_account_id, is_active
      FROM accounts
      WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE AND type = 'Asset'
      ORDER BY code ASC, name ASC
    `, [tenantId]);

    const childCount = new Map<string, number>();
    for (const a of allAssetRows) {
      if (a.parent_account_id) {
        childCount.set(a.parent_account_id, (childCount.get(a.parent_account_id) || 0) + 1);
      }
    }

    const chartRows = allAssetRows.filter((a: any) =>
      isPayFromEligibleAssetAccount(a, {
        hasChildren: (childCount.get(a.id) || 0) > 0,
        linkedToBank: linkedChartIds.has(a.id),
      })
    );

    if (chartRows.length === 0) return [];

    const chartIds = chartRows.map((r: any) => r.id);
    const placeholders = chartIds.map((_: any, i: number) => `$${i + 2}`).join(', ');
    const balanceRows = await this.db.query(`
      SELECT
        a.id,
        COALESCE(SUM(le.debit), 0) AS total_debit,
        COALESCE(SUM(le.credit), 0) AS total_credit,
        COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) AS balance
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.tenant_id = $1
      WHERE a.tenant_id = $1 AND a.id IN (${placeholders})
      GROUP BY a.id
    `, [tenantId, ...chartIds]);

    const ledgerByChart: Record<string, { balance: number; total_debit: number; total_credit: number }> = {};
    for (const r of balanceRows) {
      ledgerByChart[r.id] = {
        balance: parseFloat(r.balance) || 0,
        total_debit: parseFloat(r.total_debit) || 0,
        total_credit: parseFloat(r.total_credit) || 0,
      };
    }

    const shopByChart = new Map<string, any>();
    for (const s of shopRows) {
      if (s.chart_account_id) shopByChart.set(s.chart_account_id, s);
    }

    const cashFirst = (a: any, b: any) => {
      const shopA = shopByChart.get(a.id);
      const shopB = shopByChart.get(b.id);
      const codeA = String(a.code || shopA?.code || '');
      const codeB = String(b.code || shopB?.code || '');
      const isCashA =
        shopA?.account_type === 'Cash' ||
        codeA === COA.CASH_ON_HAND ||
        codeA === COA.MOBILE_WALLET ||
        codeA === COA.PETTY_CASH ||
        codeA === 'AST-100' ||
        /cash/i.test(String(a.name || shopA?.name || ''));
      const isCashB =
        shopB?.account_type === 'Cash' ||
        codeB === COA.CASH_ON_HAND ||
        codeB === COA.MOBILE_WALLET ||
        codeB === COA.PETTY_CASH ||
        codeB === 'AST-100' ||
        /cash/i.test(String(b.name || shopB?.name || ''));
      if (isCashA !== isCashB) return isCashA ? -1 : 1;
      const codeCmp = codeA.localeCompare(codeB);
      if (codeCmp !== 0) return codeCmp;
      return String(a.name || '').localeCompare(String(b.name || ''));
    };

    return [...chartRows].sort(cashFirst).map((c: any) => {
      const shop = shopByChart.get(c.id);
      const ledger = ledgerByChart[c.id];
      const code = c.code || shop?.code || '';
      const isCash =
        shop?.account_type === 'Cash' ||
        code === COA.CASH_ON_HAND ||
        code === COA.MOBILE_WALLET ||
        code === COA.PETTY_CASH ||
        code === 'AST-100' ||
        /cash/i.test(String(c.name || shop?.name || ''));

      return {
        id: shop?.id ?? c.id,
        chart_account_id: c.id,
        name: shop?.name ?? c.name,
        chart_name: c.name,
        code,
        account_type: shop?.account_type ?? (isCash ? 'Cash' : 'Bank'),
        currency: shop?.currency ?? null,
        is_active: shop?.is_active ?? true,
        created_at: shop?.created_at ?? null,
        updated_at: shop?.updated_at ?? null,
        balance: ledger?.balance ?? (shop ? parseFloat(shop.balance) || 0 : 0),
        total_debit: ledger?.total_debit ?? 0,
        total_credit: ledger?.total_credit ?? 0,
        has_shop_bank_link: Boolean(shop),
      };
    });
  }

  /**
   * Get sales breakdown by source (POS vs Mobile)
   * for analytics dashboard.
   * Mobile: includes all completed orders (Confirmed, Packed, OutForDelivery, Delivered)
   * so count and revenue stay in sync; uses order-level totals with fallback from line items.
   *
   * When `range` is set, aggregates are limited to `[range.from, range.to]` (inclusive on both ends).
   */
  async getSalesBySource(tenantId: string, range?: { from: string; to: string } | null) {
    const mobileStatusList = ['Confirmed', 'Packed', 'OutForDelivery', 'Delivered'];
    const posDateClause = range ? 'AND created_at >= $2 AND created_at <= $3' : '';
    const posParams: unknown[] = range ? [tenantId, range.from, range.to] : [tenantId];

    // POS sales (completed only)
    const posSales = await this.db.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COALESCE(AVG(grand_total), 0) as avg_order_value,
        'POS' as source
      FROM shop_sales
      WHERE tenant_id = $1 AND status IN ('Completed', 'Refunded')
      ${posDateClause}
    `, posParams);

    const returnsDateClause = range ? 'AND return_date >= $2 AND return_date <= $3' : '';
    const returnsParams: unknown[] = range ? [tenantId, range.from, range.to] : [tenantId];
    const posReturnsAgg = await this.db.query(
      `SELECT COALESCE(SUM(total_return_amount), 0) as total_returns FROM shop_sales_returns WHERE tenant_id = $1 ${returnsDateClause}`,
      returnsParams
    );

    const mobilePlaceholders = mobileStatusList.map((_, i) => `$${i + 2}`).join(', ');
    const mobileDateClause = range ? `AND created_at >= $${mobileStatusList.length + 2} AND created_at <= $${mobileStatusList.length + 3}` : '';
    const mobileParams: unknown[] = range
      ? [tenantId, ...mobileStatusList, range.from, range.to]
      : [tenantId, ...mobileStatusList];

    // Order-level aggregates: grand_total first, then (subtotal - discount + tax + delivery)
    const mobileSales = await this.db.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(
          NULLIF(SUM(grand_total), 0),
          SUM(subtotal - discount_total + tax_total + delivery_fee),
          0
        ) as total_revenue,
        COALESCE(
          NULLIF(AVG(grand_total), 0),
          AVG(subtotal - discount_total + tax_total + delivery_fee),
          0
        ) as avg_order_value,
        'Mobile' as source
      FROM mobile_orders
      WHERE tenant_id = $1 AND status IN (${mobilePlaceholders})
      ${mobileDateClause}
    `, mobileParams);

    const toNum = (v: unknown): number => (v === null || v === undefined) ? 0 : Number(v);
    const row = (r: any) => r ?? {};
    const posRow = row(posSales[0]);
    const mobileRow = row(mobileSales[0]);

    let mobileRevenue = toNum(mobileRow.total_revenue ?? mobileRow.totalRevenue);
    const mobileOrders = Math.max(0, parseInt(String(mobileRow.total_orders ?? mobileRow.totalOrders), 10) || 0);
    let mobileAvg = toNum(mobileRow.avg_order_value ?? mobileRow.avgOrderValue);

    // If order-level revenue is still 0 but we have orders, derive from mobile_order_items
    if (mobileOrders > 0 && mobileRevenue === 0) {
      const itemsDateClause = range
        ? `AND o.created_at >= $${mobileStatusList.length + 2} AND o.created_at <= $${mobileStatusList.length + 3}`
        : '';
      const fromItems = await this.db.query(`
        SELECT
          COALESCE(SUM(t.order_total), 0) as total_revenue,
          COALESCE(AVG(t.order_total), 0) as avg_order_value
        FROM (
          SELECT mi.order_id, SUM(mi.subtotal) as order_total
          FROM mobile_order_items mi
          INNER JOIN mobile_orders o ON o.id = mi.order_id AND o.tenant_id = $1 AND o.status IN (${mobilePlaceholders})
          WHERE mi.tenant_id = $1
          ${itemsDateClause}
          GROUP BY mi.order_id
        ) t
      `, mobileParams);
      const ir = fromItems[0];
      if (ir) {
        mobileRevenue = toNum(ir.total_revenue ?? (ir as any).totalRevenue);
        mobileAvg = mobileOrders > 0 ? mobileRevenue / mobileOrders : 0;
      }
    }

    // Count of delivered-but-unpaid mobile orders (receivables)
    const unpaidRes = await this.db.query(`
      SELECT COUNT(*) as unpaid_count, COALESCE(SUM(grand_total), 0) as unpaid_total
      FROM mobile_orders
      WHERE tenant_id = $1 AND status = 'Delivered' AND payment_status = 'Unpaid'
    `, [tenantId]);
    const unpaidRow = unpaidRes[0] ?? {};
    const totalReturnsPos = toNum((posReturnsAgg[0] as any)?.total_returns ?? (posReturnsAgg[0] as any)?.totalReturns);
    const posGross = toNum(posRow.total_revenue ?? posRow.totalRevenue);
    const posNet = Math.max(0, posGross - totalReturnsPos);
    const posOrders = Math.max(0, parseInt(String(posRow.total_orders ?? posRow.totalOrders), 10) || 0);
    const posAvgNet = posOrders > 0 ? posNet / posOrders : 0;

    return {
      pos: {
        totalOrders: posOrders,
        totalRevenue: posGross,
        totalReturns: totalReturnsPos,
        netRevenue: posNet,
        avgOrderValue: toNum(posRow.avg_order_value ?? posRow.avgOrderValue),
        avgNetOrderValue: posAvgNet,
      },
      mobile: {
        totalOrders: mobileOrders,
        totalRevenue: mobileRevenue,
        avgOrderValue: mobileAvg,
        unpaidCount: Math.max(0, parseInt(String(unpaidRow.unpaid_count ?? unpaidRow.unpaidCount), 10) || 0),
        unpaidTotal: toNum(unpaidRow.unpaid_total ?? unpaidRow.unpaidTotal),
      },
    };
  }

  /**
   * Daily revenue trend (POS net of returns + mobile), either rolling window or explicit `[from, to]` inclusive.
   */
  async getDailyRevenueTrend(
    tenantId: string,
    opts?: number | { from: string; to: string }
  ): Promise<{ pos: unknown[]; mobile: unknown[] }> {
    const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
    let fromIso: string;
    let toIso: string;
    if (opts !== undefined && typeof opts === 'object' && opts.from && opts.to) {
      fromIso = opts.from;
      toIso = opts.to;
    } else {
      const days = typeof opts === 'number' ? opts : 30;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      fromIso = start.toISOString();
      toIso = end.toISOString();
    }

    const posTrend = await this.db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as order_count,
        COALESCE(SUM(grand_total), 0) as revenue
      FROM shop_sales
      WHERE tenant_id = $1 AND status IN ('Completed', 'Refunded')
        AND created_at >= $2 AND created_at <= $3
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, [tenantId, fromIso, toIso]);

    const returnsByDay = await this.db.query(`
      SELECT DATE(return_date) as day, COALESCE(SUM(total_return_amount), 0) as returns_amt
      FROM shop_sales_returns
      WHERE tenant_id = $1 AND return_date >= $2 AND return_date <= $3
      GROUP BY DATE(return_date)
    `, [tenantId, fromIso, toIso]);
    const retMap = new Map<string, number>();
    for (const r of returnsByDay as any[]) {
      const k = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      retMap.set(k, toNum(r.returns_amt));
    }
    for (const row of posTrend as any[]) {
      const k = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
      const sub = retMap.get(k) || 0;
      row.revenue = Math.max(0, toNum(row.revenue) - sub);
    }

    const mobileStatusList = ['Confirmed', 'Packed', 'OutForDelivery', 'Delivered'];
    const mobileTrendPlaceholders = mobileStatusList.map((_, i) => `$${i + 2}`).join(', ');
    const mobileTrend = await this.db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as order_count,
        COALESCE(SUM(grand_total), 0) as revenue
      FROM mobile_orders
      WHERE tenant_id = $1 AND status IN (${mobileTrendPlaceholders})
        AND created_at >= $${mobileStatusList.length + 2} AND created_at <= $${mobileStatusList.length + 3}
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `, [tenantId, ...mobileStatusList, fromIso, toIso]);

    return { pos: posTrend, mobile: mobileTrend };
  }

  /**
   * Reconstructs an approximate inventory value time series over [from, to].
   *
   * Current stock is valued at each product's unit cost (weighted-average or
   * cost_price) and retail_price to get the live totals. Historical end-of-day
   * values are then reconstructed by walking backwards from "now", subtracting
   * the net value of inventory movements that occurred after each day. Movements
   * are valued at today's unit cost/retail, so the series is approximate (it
   * captures the slope of stock changes, not historical price drift).
   */
  async getInventoryValueTrend(
    tenantId: string,
    range: { from: string; to: string }
  ): Promise<{
    days: { day: string; costValue: number; retailValue: number }[];
    costNow: number;
    retailNow: number;
    costStart: number;
    retailStart: number;
  }> {
    const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

    // Live totals: quantity_on_hand x cost and x retail across active products.
    const nowRows = await this.db.query(
      `SELECT
         COALESCE(SUM(i.quantity_on_hand * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0) AS cost_now,
         COALESCE(SUM(i.quantity_on_hand * COALESCE(p.retail_price, 0)), 0) AS retail_now
       FROM shop_products p
       LEFT JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.is_active = TRUE`,
      [tenantId]
    );
    const costNow = toNum((nowRows as any[])[0]?.cost_now);
    const retailNow = toNum((nowRows as any[])[0]?.retail_now);

    // Daily net value deltas from signed movements, valued at current unit cost/retail.
    const deltaRows = await this.db.query(
      `SELECT DATE(m.created_at) AS day,
         COALESCE(SUM(m.quantity * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)), 0) AS cost_delta,
         COALESCE(SUM(m.quantity * COALESCE(p.retail_price, 0)), 0) AS retail_delta
       FROM shop_inventory_movements m
       JOIN shop_products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
       WHERE m.tenant_id = $1 AND m.created_at <= $2
       GROUP BY DATE(m.created_at)
       ORDER BY day ASC`,
      [tenantId, range.to]
    );

    const dayKey = (v: unknown): string =>
      v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    const costDeltaByDay = new Map<string, number>();
    const retailDeltaByDay = new Map<string, number>();
    for (const r of deltaRows as any[]) {
      const k = dayKey(r.day);
      costDeltaByDay.set(k, toNum(r.cost_delta));
      retailDeltaByDay.set(k, toNum(r.retail_delta));
    }

    // Build the inclusive list of day keys spanning the requested range.
    const fromKey = String(range.from).slice(0, 10);
    const toKey = String(range.to).slice(0, 10);
    const dayKeys: string[] = [];
    {
      const [fy, fm, fd] = fromKey.split('-').map(Number);
      const [ty, tm, td] = toKey.split('-').map(Number);
      const cur = new Date(Date.UTC(fy, fm - 1, fd));
      const last = new Date(Date.UTC(ty, tm - 1, td));
      while (cur <= last) {
        dayKeys.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    // Walk backwards from now: value at end of day D = value_now - sum(deltas after D).
    // Process days in descending order, accumulating the delta of the day *after* each.
    const costValueByDay = new Map<string, number>();
    const retailValueByDay = new Map<string, number>();
    let runningCost = costNow;
    let runningRetail = retailNow;
    let prevKey: string | null = null;
    for (let idx = dayKeys.length - 1; idx >= 0; idx--) {
      const k = dayKeys[idx];
      // Remove the delta that happened on the day we just stepped down from.
      if (prevKey !== null) {
        runningCost -= costDeltaByDay.get(prevKey) || 0;
        runningRetail -= retailDeltaByDay.get(prevKey) || 0;
      }
      costValueByDay.set(k, runningCost);
      retailValueByDay.set(k, runningRetail);
      prevKey = k;
    }

    const days = dayKeys.map((k) => ({
      day: k,
      costValue: Math.round((costValueByDay.get(k) || 0) * 100) / 100,
      retailValue: Math.round((retailValueByDay.get(k) || 0) * 100) / 100,
    }));

    const first = days[0];
    return {
      days,
      costNow: Math.round(costNow * 100) / 100,
      retailNow: Math.round(retailNow * 100) / 100,
      costStart: first ? first.costValue : Math.round(costNow * 100) / 100,
      retailStart: first ? first.retailValue : Math.round(retailNow * 100) / 100,
    };
  }

  /**
   * POS + mobile revenue grouped by branch name for the Executive Overview node rankings.
   */
  async getBranchRevenueTotals(tenantId: string, range: { from: string; to: string }) {
    const mobileStatusList = ['Confirmed', 'Packed', 'OutForDelivery', 'Delivered'];
    const mobilePh = mobileStatusList.map((_, i) => `$${i + 4}`).join(', ');
    const posRows = await this.db.query(
      `
      SELECT COALESCE(b.name, 'Unassigned') as branch_name,
        COALESCE(SUM(s.grand_total), 0)::float as revenue
      FROM shop_sales s
      LEFT JOIN shop_branches b ON s.branch_id = b.id AND b.tenant_id = $1
      WHERE s.tenant_id = $1 AND s.status IN ('Completed', 'Refunded')
        AND s.created_at >= $2 AND s.created_at <= $3
      GROUP BY COALESCE(b.name, 'Unassigned')
      `,
      [tenantId, range.from, range.to]
    );
    const mobileRows = await this.db.query(
      `
      SELECT COALESCE(b.name, 'Unassigned') as branch_name,
        COALESCE(
          SUM(COALESCE(NULLIF(o.grand_total, 0), o.subtotal - o.discount_total + o.tax_total + o.delivery_fee)),
          0
        ) as revenue
      FROM mobile_orders o
      LEFT JOIN shop_branches b ON o.branch_id = b.id AND b.tenant_id = $1
      WHERE o.tenant_id = $1 AND o.status IN (${mobilePh})
        AND o.created_at >= $2 AND o.created_at <= $3
      GROUP BY COALESCE(b.name, 'Unassigned')
      `,
      [tenantId, range.from, range.to, ...mobileStatusList]
    );
    const merged = new Map<string, number>();
    const add = (name: string, rev: number) => {
      const k = name || 'Unassigned';
      merged.set(k, (merged.get(k) || 0) + rev);
    };
    for (const r of posRows as any[]) {
      add(String(r.branch_name ?? 'Unassigned'), parseFloat(String(r.revenue)) || 0);
    }
    for (const r of mobileRows as any[]) {
      add(String(r.branch_name ?? 'Unassigned'), parseFloat(String(r.revenue)) || 0);
    }
    return Array.from(merged.entries())
      .map(([branch_name, revenue]) => ({ branch_name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Category performance from actual sales data.
   * When `from` + `to` (ISO) are set, only sales in `[from, to)` are included.
   */
  async getCategoryPerformance(
    tenantId: string,
    range?: { from: string; to: string } | null
  ) {
    const dateFilter =
      range?.from && range?.to
        ? `AND s.created_at >= $2 AND s.created_at < $3`
        : '';
    const params: (string)[] =
      range?.from && range?.to ? [tenantId, range.from, range.to] : [tenantId];
    return this.db.query(
      `
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
      ${dateFilter}
      GROUP BY c.name
      ORDER BY COALESCE(SUM(si.subtotal), 0) DESC
      LIMIT 20
    `,
      params
    );
  }

  private sumUnits(cats: { units_sold?: string | number }[]) {
    return (cats || []).reduce((s, c) => s + (parseFloat(String(c.units_sold)) || 0), 0);
  }

  /**
   * Aggregated data for the Supply Chain & Inventory IQ view (date window + prior period + heuristics).
   */
  async getInventoryIntelligence(tenantId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const len = Math.max(0, to.getTime() - from.getTime());
    const priorTo = from.getTime();
    const priorFrom = new Date(priorTo - len);

    const isSql = this.db.getType() === 'sqlite';

    const [currentCats, priorCats, newCatCount, whRows, movementAgg] = await Promise.all([
      this.getCategoryPerformance(tenantId, { from: fromIso, to: toIso }),
      this.getCategoryPerformance(tenantId, {
        from: priorFrom.toISOString(),
        to: from.toISOString(),
      }),
      this.db.query(
        isSql
          ? `
        SELECT COUNT(*) as n FROM categories
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (parent_id IS NULL OR parent_id = '')
          AND datetime(created_at) >= datetime($2) AND datetime(created_at) < datetime($3)
        `
          : `
        SELECT COUNT(*)::int as n FROM categories
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (parent_id IS NULL)
          AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
        `,
        [tenantId, fromIso, toIso]
      ),
      this.db.query(
        `
        SELECT w.id, w.name,
          COALESCE(SUM(CASE WHEN i.quantity_on_hand > 0 THEN i.quantity_on_hand ELSE 0 END), 0) as total_on_hand,
          COALESCE(SUM(CASE WHEN COALESCE(i.quantity_on_hand,0) <= 0 THEN 1 ELSE 0 END), 0) as skus_out
        FROM shop_warehouses w
        LEFT JOIN shop_inventory i ON i.warehouse_id = w.id AND i.tenant_id = w.tenant_id
        WHERE w.tenant_id = $1
        GROUP BY w.id, w.name
        ORDER BY w.name
        LIMIT 5
        `,
        [tenantId]
      ),
      this.db.query(
        isSql
          ? `
        SELECT COALESCE(SUM(ABS(quantity)), 0) as v
        FROM shop_inventory_movements
        WHERE tenant_id = $1
          AND datetime(created_at) >= datetime($2) AND datetime(created_at) < datetime($3)
          AND LOWER(COALESCE(type, '')) NOT IN (
            'sale', 'purchase', 'salereturn', 'mobilesale', 'releasereserve', 'purchasereturn', 'return'
          )
        `
          : `
        SELECT COALESCE(SUM(ABS(quantity::numeric)), 0) as v
        FROM shop_inventory_movements
        WHERE tenant_id = $1
          AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
          AND LOWER(COALESCE(type, '')) NOT IN (
            'sale', 'purchase', 'salereturn', 'mobilesale', 'releasereserve', 'purchasereturn', 'return'
          )
        `,
        [tenantId, fromIso, toIso]
      ),
    ]);

    const onHand = await this.db.query(
      `
      SELECT COALESCE(SUM(
        ${isSql ? 'CASE WHEN quantity_on_hand > 0 THEN quantity_on_hand ELSE 0 END' : 'GREATEST(0::numeric, quantity_on_hand::numeric)'}
      ), 0) as q
      FROM shop_inventory
      WHERE tenant_id = $1
      `,
      [tenantId]
    );
    const totalOn = parseFloat(String((onHand[0] as any)?.q ?? 0)) || 0;
    const nonRoutine = parseFloat(String((movementAgg[0] as any)?.v ?? 0)) || 0;
    const stockVarianceRate =
      totalOn > 0.01 ? Math.min(100, (nonRoutine / totalOn) * 100) : 0;

    const curUnits = this.sumUnits(currentCats as any[]);
    const prevUnits = this.sumUnits(priorCats as any[]);
    const unitsChangePct = prevUnits > 0.01 ? ((curUnits - prevUnits) / prevUnits) * 100 : curUnits > 0 ? 100 : 0;

    const warehouses = (whRows as any[]).map((r) => {
      const t = parseFloat(String(r.total_on_hand)) || 0;
      const out = parseInt(String(r.skus_out), 10) || 0;
      const isWarning = out >= 3 || (t < 0.1 && out >= 1);
      return {
        name: r.name,
        status: (isWarning ? 'warning' : 'optimized') as 'warning' | 'optimized',
        totalOnHand: t,
        skusOut: out,
      };
    });

    return {
      categoryPerformance: currentCats,
      priorTotalUnits: prevUnits,
      currentTotalUnits: curUnits,
      unitsChangePct,
      newCategoriesInPeriod: parseInt(String((newCatCount[0] as any)?.n ?? 0), 10) || 0,
      stockVarianceRate,
      warehouses,
    };
  }

  /**
   * Recent transactions list (combined POS + Mobile). Optional inclusive `[from, to]` ISO bounds filter.
   */
  async getRecentTransactions(
    tenantId: string,
    limit = 50,
    range?: { from: string; to: string } | null
  ) {
    const mobStatuses = `('Confirmed', 'Packed', 'OutForDelivery', 'Delivered')`;
    const dateClause = range ? 'AND created_at >= $3 AND created_at <= $4' : '';
    return this.db.query(
      `
      SELECT * FROM (
        SELECT id, sale_number as reference, grand_total as amount,
          payment_method, 'POS' as source, created_at, status
        FROM shop_sales
        WHERE tenant_id = $1 ${range ? dateClause : ''}
        UNION ALL
        SELECT id, order_number as reference, grand_total as amount,
          payment_method, 'Mobile' as source, created_at, status
        FROM mobile_orders
        WHERE tenant_id = $1 AND status IN ${mobStatuses}
          ${range ? dateClause : ''}
      ) q
      ORDER BY created_at DESC
      LIMIT $2
    `,
      range ? [tenantId, limit, range.from, range.to] : [tenantId, limit]
    );
  }

  /**
   * Check if an account with the same name or code already exists for this tenant.
   * Returns { field, value } if duplicate found, null otherwise.
   */
  async checkDuplicate(tenantId: string, name: string, code?: string, excludeId?: string): Promise<{ field: string; value: string } | null> {
    const nameCheck = await this.db.query(
      `SELECT id FROM accounts WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)${excludeId ? ' AND id <> $3' : ''} LIMIT 1`,
      excludeId ? [tenantId, name, excludeId] : [tenantId, name]
    );
    if (nameCheck.length > 0) return { field: 'name', value: name };

    if (code && code.trim() !== '') {
      const codeCheck = await this.db.query(
        `SELECT id FROM accounts WHERE tenant_id = $1 AND code = $2${excludeId ? ' AND id <> $3' : ''} LIMIT 1`,
        excludeId ? [tenantId, code, excludeId] : [tenantId, code]
      );
      if (codeCheck.length > 0) return { field: 'code', value: code };
    }

    return null;
  }

  /**
   * Create a new chart-of-accounts entry (account).
   * Validates name/code uniqueness per tenant before inserting.
   */
  async createAccount(tenantId: string, data: {
    name: string;
    code: string;
    type: string;
    description?: string;
    isActive?: boolean;
  }) {
    const duplicate = await this.checkDuplicate(tenantId, data.name, data.code);
    if (duplicate) {
      const err: any = new Error(
        `An account with this ${duplicate.field} already exists: "${duplicate.value}"`
      );
      err.statusCode = 409;
      throw err;
    }

    const result = await this.db.query(`
      INSERT INTO accounts (tenant_id, name, code, type, description, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, code, type, description, is_active, balance, created_at
    `, [tenantId, data.name, data.code, data.type, data.description || null, data.isActive !== false]);
    return result[0];
  }

  /**
   * Update an existing chart-of-accounts entry.
   * Validates name/code uniqueness (excluding current account) before updating.
   */
  async updateAccount(tenantId: string, accountId: string, data: {
    name?: string;
    code?: string;
    type?: string;
    description?: string;
    isActive?: boolean;
  }) {
    const existing = await this.db.query(
      `SELECT id, name, code, type, description, is_active FROM accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId]
    );
    if (!existing.length) {
      const err: any = new Error('Account not found');
      err.statusCode = 404;
      throw err;
    }
    const current = existing[0];
    const name = data.name !== undefined ? data.name.trim() : current.name;
    const code = data.code !== undefined ? (data.code || '').trim() : (current.code || '');
    const type = data.type !== undefined ? data.type : current.type;
    const description = data.description !== undefined ? data.description : current.description;
    const isActive = data.isActive !== undefined ? data.isActive : current.is_active;

    const duplicate = await this.checkDuplicate(tenantId, name, code || undefined, accountId);
    if (duplicate) {
      const err: any = new Error(
        `An account with this ${duplicate.field} already exists: "${duplicate.value}"`
      );
      err.statusCode = 409;
      throw err;
    }

    await this.db.query(`
      UPDATE accounts
      SET name = $1, code = $2, type = $3, description = $4, is_active = $5, updated_at = NOW()
      WHERE id = $6 AND tenant_id = $7
    `, [name, code || null, type, description || null, isActive, accountId, tenantId]);
    const updated = await this.db.query(
      `SELECT id, name, code, type, description, is_active, balance, created_at, updated_at FROM accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId]
    );
    return updated[0];
  }

  /**
   * Delete a chart-of-accounts entry. Only allowed when the account has no ledger entries.
   */
  async deleteAccount(tenantId: string, accountId: string) {
    const existing = await this.db.query(
      `SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId]
    );
    if (!existing.length) {
      const err: any = new Error('Account not found');
      err.statusCode = 404;
      throw err;
    }
    const hasLedger = await this.db.query(
      `SELECT 1 FROM ledger_entries WHERE account_id = $1 AND tenant_id = $2 LIMIT 1`,
      [accountId, tenantId]
    );
    if (hasLedger.length) {
      const err: any = new Error('Cannot delete account that has transactions. Deactivate it instead or remove its transactions first.');
      err.statusCode = 409;
      throw err;
    }
    await this.db.query(`DELETE FROM accounts WHERE id = $1 AND tenant_id = $2`, [accountId, tenantId]);
    return { success: true };
  }

  /**
   * Post journal entry + ledger for a manual entry (from UI).
   * Validates: journal must balance (sum debit = sum credit); posting only to leaf accounts (level 4 or legacy without level).
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
    const totalDebit = data.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      const err: any = new Error('Journal must balance: total debits must equal total credits.');
      err.statusCode = 400;
      throw err;
    }

    return this.db.transaction(async (client: any) => {
      const accountIds = [...new Set(data.lines.map((l) => l.accountId))];
      const placeholders = accountIds.map((_, i) => `$${i + 2}`).join(', ');
      const levelRows = await client.query(
        `SELECT id, level FROM accounts WHERE tenant_id = $1 AND id IN (${placeholders})`,
        [tenantId, ...accountIds]
      );
      const levelByAccount: Record<string, number | null> = {};
      for (const r of levelRows) {
        levelByAccount[r.id] = r.level != null ? Number(r.level) : null;
      }
      for (const aid of accountIds) {
        const level = levelByAccount[aid];
        if (level != null && level < 4) {
          const err: any = new Error('Posting is only allowed to leaf (postable) accounts. This account is a parent/header account.');
          err.statusCode = 400;
          throw err;
        }
      }

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
              WHERE a2.id = $2 AND a2.tenant_id = $1
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

  /**
   * Update an existing journal entry and its ledger lines. Recomputes affected account balances
   * and invalidates report aggregates so accounts and related transactions stay in sync.
   */
  async updateJournalEntry(tenantId: string, journalEntryId: string, data: {
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
    const totalDebit = data.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      const err: any = new Error('Journal must balance: total debits must equal total credits.');
      err.statusCode = 400;
      throw err;
    }

    return this.db.transaction(async (client: any) => {
      const existing = await client.query(
        'SELECT id FROM journal_entries WHERE id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );
      if (!existing.length) {
        const err: any = new Error('Journal entry not found');
        err.statusCode = 404;
        throw err;
      }

      const accountIds = [...new Set(data.lines.map((l) => l.accountId))];
      const placeholders = accountIds.map((_, i) => `$${i + 2}`).join(', ');
      const levelRows = await client.query(
        `SELECT id, level FROM accounts WHERE tenant_id = $1 AND id IN (${placeholders})`,
        [tenantId, ...accountIds]
      );
      const levelByAccount: Record<string, number | null> = {};
      for (const r of levelRows) {
        levelByAccount[r.id] = r.level != null ? Number(r.level) : null;
      }
      for (const aid of accountIds) {
        const level = levelByAccount[aid];
        if (level != null && level < 4) {
          const err: any = new Error('Posting is only allowed to leaf (postable) accounts. This account is a parent/header account.');
          err.statusCode = 400;
          throw err;
        }
      }

      const oldLines = await client.query(
        'SELECT account_id FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );
      const affectedAccountIds = new Set<string>([
        ...oldLines.map((r: any) => r.account_id),
        ...accountIds,
      ]);

      await client.query(
        `UPDATE journal_entries SET date = $1, reference = $2, description = $3
         WHERE id = $4 AND tenant_id = $5`,
        [data.date, data.reference, data.description, journalEntryId, tenantId]
      );

      await client.query(
        'DELETE FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );

      for (const line of data.lines) {
        if (line.debit > 0 || line.credit > 0) {
          await client.query(`
            INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
            VALUES ($1, $2, $3, $4, $5)
          `, [tenantId, journalEntryId, line.accountId, line.debit || 0, line.credit || 0]);
        }
      }

      for (const accountId of affectedAccountIds) {
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
            WHERE a2.id = $2 AND a2.tenant_id = $1
          ),
          updated_at = NOW()
          WHERE id = $2 AND tenant_id = $1
        `, [tenantId, accountId]);
      }

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { journalId: journalEntryId };
    });
  }

  /**
   * Delete a journal entry and its ledger lines. Cascades to ledger_entries; recomputes
   * affected account balances and invalidates report aggregates so accounts stay in sync.
   * Related records (e.g. expenses with journal_entry_id) may have their link set to null
   * by the database if configured with ON DELETE SET NULL.
   */
  async deleteJournalEntry(tenantId: string, journalEntryId: string) {
    return this.db.transaction(async (client: any) => {
      const existing = await client.query(
        'SELECT id FROM journal_entries WHERE id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );
      if (!existing.length) {
        const err: any = new Error('Journal entry not found');
        err.statusCode = 404;
        throw err;
      }

      const oldLines = await client.query(
        'SELECT account_id FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );
      const affectedAccountIds = [...new Set(oldLines.map((r: any) => r.account_id))];

      await client.query(
        'DELETE FROM ledger_entries WHERE journal_entry_id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );
      await client.query(
        'DELETE FROM journal_entries WHERE id = $1 AND tenant_id = $2',
        [journalEntryId, tenantId]
      );

      for (const accountId of affectedAccountIds) {
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
            WHERE a2.id = $2 AND a2.tenant_id = $1
          ),
          updated_at = NOW()
          WHERE id = $2 AND tenant_id = $1
        `, [tenantId, accountId]);
      }

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return { success: true };
    });
  }

  /**
   * Post cash variance on shift close (shortage or overage).
   * Shortage: Dr Cash Shortage Expense (81006), Cr Cash on Hand (11101).
   * Overage: Dr Cash on Hand (11101), Cr Cash Overage Income (71004).
   * Uses leaf accounts; creates them if missing. All tenant-scoped, use from within transaction.
   */
  async postCashVariance(
    tenantId: string,
    data: { shiftId: string; type: 'shortage' | 'overage'; amount: number; reason?: string },
    client?: any
  ): Promise<string> {
    const db = client || this.db;
    const amount = Math.abs(Number(data.amount));
    if (amount <= 0) return '';

    const cashAccId = await this.getOrCreateAccountByCode(
      tenantId, COA.CASH_ON_HAND, 'Cash on Hand', 'Asset', db
    );
    const ref = `Shift-${data.shiftId.slice(0, 8)}-${data.type}`;
    const desc = `${data.type === 'shortage' ? 'Cash shortage' : 'Cash overage'} at shift close${data.reason ? `: ${data.reason}` : ''}`;

    if (data.type === 'shortage') {
      const expenseAccId = await this.getOrCreateAccountByCode(
        tenantId, COA.CASH_SHORTAGE_EXPENSE, 'Cash Shortage Expense', 'Expense', db
      );
      const journalRes = await db.query(`
        INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
        VALUES ($1, NOW(), $2, $3, 'ShiftClose', $4, 'Posted')
        RETURNING id
      `, [tenantId, ref, desc, data.shiftId]);
      const journalId = journalRes[0].id;
      await db.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, expenseAccId, amount]
      );
      await db.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
        [tenantId, journalId, cashAccId, amount]
      );
      return journalId;
    } else {
      const incomeAccId = await this.getOrCreateAccountByCode(
        tenantId, COA.CASH_OVERAGE_INCOME, 'Cash Overage Income', 'Income', db
      );
      const journalRes = await db.query(`
        INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
        VALUES ($1, NOW(), $2, $3, 'ShiftClose', $4, 'Posted')
        RETURNING id
      `, [tenantId, ref, desc, data.shiftId]);
      const journalId = journalRes[0].id;
      await db.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, 0)',
        [tenantId, journalId, cashAccId, amount]
      );
      await db.query(
        'INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, $4)',
        [tenantId, journalId, incomeAccId, amount]
      );
      return journalId;
    }
  }

  /**
   * Clear all sales transaction data for the tenant. Keeps settings, accounts, users, vendors,
   * bank accounts, products, and all inventory data (stock levels and movement history).
   * Removes: sales, journal/ledger entries, transactions table, mobile orders, customer balances,
   * report aggregates; purchase bills, bill items, bill payments, supplier payments;
   * and zeros Cash & Bank balances so the dashboard shows 0 after clear.
   */
  async clearAllTransactions(tenantId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      // Expense records reference journal_entries; delete first so journal cascade is clean (table may not exist before migration 017)
      try {
        await client.execute('DELETE FROM expenses WHERE tenant_id = $1', [tenantId]);
      } catch (_) {
        // expenses table may not exist if migration 017 not applied
      }
      // Purchase bills & payments (migration 018): bill payments link bills to supplier_payments; delete in dependency order
      try {
        await client.execute('DELETE FROM purchase_bill_payments WHERE tenant_id = $1', [tenantId]);
        await client.execute('DELETE FROM supplier_payments WHERE tenant_id = $1', [tenantId]);
        await client.execute('DELETE FROM purchase_bills WHERE tenant_id = $1', [tenantId]);
      } catch (_) {
        // procurement tables may not exist if migration 018 not applied
      }
      // Parent tables only; child rows removed by CASCADE. Inventories (shop_inventory, shop_inventory_movements) are not touched.
      await client.execute('DELETE FROM shop_sales WHERE tenant_id = $1', [tenantId]);
      await client.execute('DELETE FROM journal_entries WHERE tenant_id = $1', [tenantId]);
      await client.execute('DELETE FROM transactions WHERE tenant_id = $1', [tenantId]);
      await client.execute('DELETE FROM mobile_orders WHERE tenant_id = $1', [tenantId]);
      await client.execute('DELETE FROM customer_balance WHERE tenant_id = $1', [tenantId]);
      await client.execute('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
      // Zero denormalized Cash & Bank balances so "Cash & Bank Balances" shows 0 after clear
      await client.execute('UPDATE shop_bank_accounts SET balance = 0, updated_at = NOW() WHERE tenant_id = $1', [tenantId]);
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
