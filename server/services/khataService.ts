import { getDatabaseService } from './databaseService.js';
import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';

export interface KhataLedgerEntry {
  id: string;
  customer_id: string;
  order_id: string | null;
  type: 'debit' | 'credit';
  amount: number;
  note: string | null;
  created_at: string;
  customer_name?: string;
  sale_number?: string;
}

export interface KhataSummaryRow {
  customer_id: string;
  customer_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

let instance: KhataService | null = null;

export function getKhataService(): KhataService {
  if (!instance) instance = new KhataService();
  return instance;
}

export class KhataService {
  private db = getDatabaseService();

  async addDebit(tenantId: string, customerId: string, orderId: string | null, amount: number, note?: string): Promise<string> {
    const res = await this.db.query(
      `INSERT INTO khata_ledger (tenant_id, customer_id, order_id, type, amount, note)
       VALUES ($1, $2, $3, 'debit', $4, $5)
       RETURNING id`,
      [tenantId, customerId, orderId, amount, note || null]
    );
    return res[0].id;
  }

  /**
   * Record khata payment: credit khata ledger, increase bank/cash (shop_bank_accounts + GL),
   * credit Trade Receivables so GL matches khata collections.
   */
  async receivePayment(
    tenantId: string,
    params: { customerId: string; amount: number; note?: string; bankAccountId: string }
  ): Promise<string> {
    const accounting = getAccountingService();
    const getAcc = (code: string, name: string, type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense', client: any) =>
      accounting.getOrCreateAccountByCode(tenantId, code, name, type, client);

    const ledgerId = await this.db.transaction(async (client) => {
      const banks = await client.query(
        `SELECT id, chart_account_id, name FROM shop_bank_accounts
         WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [params.bankAccountId, tenantId]
      );
      if (banks.length === 0) {
        throw new Error('Deposit account not found or inactive');
      }
      const bankRow = banks[0] as { id: string; chart_account_id: string | null; name: string };
      if (!bankRow.chart_account_id) {
        throw new Error('Deposit account must be linked to the chart of accounts');
      }

      const ins = await client.query(
        `INSERT INTO khata_ledger (tenant_id, customer_id, order_id, type, amount, note)
         VALUES ($1, $2, NULL, 'credit', $3, $4)
         RETURNING id`,
        [tenantId, params.customerId, params.amount, params.note ?? null]
      );
      const kId = ins[0].id as string;

      await client.query(
        `UPDATE shop_bank_accounts
         SET balance = COALESCE(balance, 0) + $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [params.amount, params.bankAccountId, tenantId]
      );

      const assetAccId = bankRow.chart_account_id;
      const arAcc = await getAcc(COA.TRADE_RECEIVABLES, 'Trade Receivables', 'Asset', client);

      const reference = `KHATA-PAY-${kId}`;
      const description =
        params.note?.trim() || `Khata payment received (${bankRow.name || 'deposit'})`;

      const jRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, NOW(), $2, $3, 'Khata', $4, 'Posted')
         RETURNING id`,
        [tenantId, reference, description, kId]
      );
      const journalId = jRes[0].id as string;

      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, assetAccId, params.amount]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, arAcc, params.amount]
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);

      return kId;
    });

    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    return ledgerId;
  }

  async getLedger(tenantId: string, customerId?: string): Promise<KhataLedgerEntry[]> {
    if (customerId) {
      const rows = await this.db.query(
        `SELECT k.id, k.customer_id, k.order_id, k.type, k.amount, k.note, k.created_at,
                c.name AS customer_name, s.sale_number
         FROM khata_ledger k
         LEFT JOIN contacts c ON c.id = k.customer_id AND c.tenant_id = k.tenant_id
         LEFT JOIN shop_sales s ON s.id = k.order_id AND s.tenant_id = k.tenant_id
         WHERE k.tenant_id = $1 AND k.customer_id = $2
         ORDER BY k.created_at DESC`,
        [tenantId, customerId]
      );
      return rows.map((r: any) => ({
        id: r.id,
        customer_id: r.customer_id,
        order_id: r.order_id,
        type: r.type,
        amount: Number(r.amount),
        note: r.note,
        created_at: r.created_at,
        customer_name: r.customer_name,
        sale_number: r.sale_number,
      }));
    }
    const rows = await this.db.query(
      `SELECT k.id, k.customer_id, k.order_id, k.type, k.amount, k.note, k.created_at,
              c.name AS customer_name, s.sale_number
       FROM khata_ledger k
       LEFT JOIN contacts c ON c.id = k.customer_id AND c.tenant_id = k.tenant_id
       LEFT JOIN shop_sales s ON s.id = k.order_id AND s.tenant_id = k.tenant_id
       WHERE k.tenant_id = $1
       ORDER BY k.created_at DESC`,
      [tenantId]
    );
    return rows.map((r: any) => ({
      id: r.id,
      customer_id: r.customer_id,
      order_id: r.order_id,
      type: r.type,
      amount: Number(r.amount),
      note: r.note,
      created_at: r.created_at,
      customer_name: r.customer_name,
      sale_number: r.sale_number,
    }));
  }

  async getBalance(tenantId: string, customerId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS balance
       FROM khata_ledger WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, customerId]
    );
    return Number(res[0]?.balance ?? 0);
  }

  async getSummaryByCustomer(tenantId: string): Promise<KhataSummaryRow[]> {
    const rows = await this.db.query(
      `SELECT
         k.customer_id,
         MAX(c.name) AS customer_name,
         COALESCE(SUM(CASE WHEN k.type = 'debit' THEN k.amount ELSE 0 END), 0) AS total_debit,
         COALESCE(SUM(CASE WHEN k.type = 'credit' THEN k.amount ELSE 0 END), 0) AS total_credit,
         COALESCE(SUM(CASE WHEN k.type = 'debit' THEN k.amount ELSE -k.amount END), 0) AS balance
       FROM khata_ledger k
       LEFT JOIN contacts c ON c.id = k.customer_id AND c.tenant_id = k.tenant_id
       WHERE k.tenant_id = $1
       GROUP BY k.customer_id`,
      [tenantId]
    );
    return rows.map((r: any) => ({
      customer_id: r.customer_id,
      customer_name: r.customer_name || 'Unknown',
      total_debit: Number(r.total_debit),
      total_credit: Number(r.total_credit),
      balance: Number(r.balance),
    }));
  }

  async getCustomerSummary(tenantId: string, customerId: string): Promise<{ totalDebit: number; totalCredit: number; balance: number } | null> {
    const rows = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) AS total_debit,
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS total_credit,
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE -amount END), 0) AS balance
       FROM khata_ledger WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, customerId]
    );
    if (!rows.length) return null;
    return {
      totalDebit: Number(rows[0].total_debit),
      totalCredit: Number(rows[0].total_credit),
      balance: Number(rows[0].balance),
    };
  }

  async listCustomers(tenantId: string): Promise<{ id: string; name: string; contact_no: string | null; company_name?: string | null }[]> {
    const rows = await this.db.query(
      `SELECT id, name, contact_no, company_name FROM contacts WHERE tenant_id = $1 AND type IN ('Customer', 'Client') ORDER BY name`,
      [tenantId]
    );
    return rows.map((r: any) => ({ id: r.id, name: r.name, contact_no: r.contact_no, company_name: r.company_name }));
  }

  async createCustomer(tenantId: string, data: { name: string; contact_no?: string; company_name?: string }): Promise<{ id: string; name: string; contact_no: string | null; company_name?: string | null }> {
    const id = `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const rows = await this.db.query(
      `INSERT INTO contacts (id, tenant_id, name, type, contact_no, company_name)
       VALUES ($1, $2, $3, 'Client', $4, $5)
       RETURNING id, name, contact_no, company_name`,
      [id, tenantId, data.name, data.contact_no ?? null, data.company_name ?? null]
    );
    const r = rows[0];
    return { id: r.id, name: r.name, contact_no: r.contact_no, company_name: r.company_name };
  }

  async updateEntry(
    tenantId: string,
    entryId: string,
    data: { type: 'debit' | 'credit'; amount: number; note?: string | null }
  ): Promise<boolean> {
    const res =
      data.note !== undefined
        ? await this.db.query(
            `UPDATE khata_ledger
             SET type = $1, amount = $2, note = $3
             WHERE tenant_id = $4 AND id = $5
             RETURNING id`,
            [data.type, data.amount, data.note, tenantId, entryId]
          )
        : await this.db.query(
            `UPDATE khata_ledger
             SET type = $1, amount = $2
             WHERE tenant_id = $3 AND id = $4
             RETURNING id`,
            [data.type, data.amount, tenantId, entryId]
          );
    if (res.length) {
      const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
      notifyDailyReportUpdated(tenantId).catch(() => {});
    }
    return res.length > 0;
  }

  async deleteEntry(tenantId: string, entryId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM khata_ledger WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, entryId]
    );
    if (res.length) {
      const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
      notifyDailyReportUpdated(tenantId).catch(() => {});
    }
    return res.length > 0;
  }
}
