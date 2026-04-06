import { getDatabaseService } from './databaseService.js';
import {
  insertPurchaseBatch,
  reverseBatchesForPurchaseBill,
} from './inventoryBatchService.js';

export interface PurchaseBillItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
  taxAmount?: number;
  subtotal: number;
  /** Required for new purchase lines: YYYY-MM-DD, must be >= today */
  expiryDate?: string;
  /** Optional; auto-generated when omitted */
  batchNo?: string;
}

export interface CreatePurchaseBillInput {
  supplierId: string;
  billNumber: string;
  billDate: string;
  dueDate?: string;
  items: PurchaseBillItemInput[];
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  /** Paid at purchase time (immediate cash/bank) */
  paidAmount?: number;
  /** Cash | Bank | Credit. If Credit, paidAmount should be 0. */
  paymentStatus: 'Credit' | 'Paid' | 'Partial';
  /** For Paid/Partial: bankAccountId for Bank, or null for Cash */
  bankAccountId?: string;
  notes?: string;
  userId?: string;
}

export interface SupplierPaymentInput {
  supplierId: string;
  amount: number;
  paymentMethod: 'Cash' | 'Bank' | 'Card';
  bankAccountId?: string;
  paymentDate: string;
  reference?: string;
  notes?: string;
  /** Allocations: which bills to apply this payment to */
  allocations: { purchaseBillId: string; amount: number }[];
}

import { getAccountingService } from './accountingService.js';
import { COA } from '../constants/accountCodes.js';

export class ProcurementService {
  private db = getDatabaseService();

  private validatePurchaseItemsForBatches(items: PurchaseBillItemInput[]): void {
    const today = new Date().toISOString().slice(0, 10);
    let line = 0;
    for (const item of items) {
      line += 1;
      if (!item.productId) throw new Error(`Line ${line}: product is required`);
      if (!item.quantity || item.quantity <= 0) throw new Error(`Line ${line}: quantity must be greater than 0`);
      if (item.unitCost == null || item.unitCost < 0) throw new Error(`Line ${line}: cost price must be zero or positive`);
      const exp = item.expiryDate?.trim();
      if (!exp) throw new Error(`Line ${line}: expiry date is required`);
      if (exp < today) throw new Error(`Line ${line}: expiry date must be today or a future date`);
    }
  }

  private async getOrCreateAccount(
    client: any,
    tenantId: string,
    name: string,
    type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense',
    code: string
  ): Promise<string> {
    return getAccountingService().getOrCreateAccountByCode(tenantId, code, name, type, client);
  }

  /**
   * Create purchase bill: save bill + items, update inventory (weighted average),
   * insert movements, post double-entry (Inventory ↑, AP or Cash/Bank).
   */
  async createPurchaseBill(tenantId: string, data: CreatePurchaseBillInput): Promise<string> {
    if (!data.items?.length) throw new Error('Purchase bill must have at least one line item');
    this.validatePurchaseItemsForBatches(data.items);

    const billId = await this.db.transaction(async (client) => {
      const balanceDue = data.totalAmount - (data.paidAmount || 0);
      const status =
        balanceDue <= 0 ? 'Paid' : (data.paidAmount && data.paidAmount > 0 ? 'Partial' : 'Posted');

      const paidNow = data.paidAmount || 0;
      const initialBankId = paidNow > 0 && (data.paymentStatus === 'Paid' || data.paymentStatus === 'Partial') ? data.bankAccountId || null : null;

      const billRes = await client.query(
        `INSERT INTO purchase_bills (
          tenant_id, supplier_id, bill_number, bill_date, due_date,
          subtotal, tax_total, total_amount, paid_amount, balance_due, status, notes, initial_payment_bank_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [
          tenantId,
          data.supplierId,
          data.billNumber,
          data.billDate,
          data.dueDate || null,
          data.subtotal,
          data.taxTotal,
          data.totalAmount,
          paidNow,
          balanceDue,
          status,
          data.notes || null,
          initialBankId,
        ]
      );
      const billId = billRes[0].id;

      let warehouseId: string;
      const whRows = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [
        tenantId,
      ]);
      if (whRows.length === 0) {
        const ins = await client.query(
          `INSERT INTO shop_warehouses (tenant_id, name, code, location, is_active)
           VALUES ($1, 'Main Warehouse', 'MAIN', 'Default', TRUE) RETURNING id`,
          [tenantId]
        );
        warehouseId = ins[0].id;
      } else {
        warehouseId = whRows[0].id;
      }

      let lineIndex = 0;
      for (const item of data.items) {
        lineIndex += 1;
        const batchNo =
          (item.batchNo && String(item.batchNo).trim()) || `B-${data.billNumber}-${lineIndex}`;
        const expiryDate = String(item.expiryDate).trim().slice(0, 10);

        await client.query(
          `INSERT INTO purchase_bill_items (tenant_id, purchase_bill_id, product_id, quantity, unit_cost, tax_amount, subtotal, expiry_date, batch_no)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)`,
          [
            tenantId,
            billId,
            item.productId,
            item.quantity,
            item.unitCost,
            item.taxAmount || 0,
            item.subtotal,
            expiryDate,
            batchNo,
          ]
        );

        const totalCost = item.quantity * item.unitCost;
        const invRows = await client.query(
          `SELECT quantity_on_hand FROM shop_inventory
           WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 LIMIT 1`,
          [tenantId, item.productId, warehouseId]
        );

        let newQty: number;
        let newAvgCost: number;
        if (invRows.length === 0) {
          await client.query(
            `INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tenant_id, product_id, warehouse_id)
             DO UPDATE SET quantity_on_hand = shop_inventory.quantity_on_hand + $4, updated_at = NOW()`,
            [tenantId, item.productId, warehouseId, item.quantity]
          );
          newQty = item.quantity;
          newAvgCost = item.unitCost;
        } else {
          const oldQty = parseFloat(invRows[0].quantity_on_hand) || 0;
          const prodRows = await client.query(
            'SELECT average_cost, cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2',
            [item.productId, tenantId]
          );
          const oldCost = (prodRows[0]?.average_cost != null && Number(prodRows[0].average_cost) > 0)
            ? Number(prodRows[0].average_cost)
            : Number(prodRows[0]?.cost_price) || 0;
          newQty = oldQty + item.quantity;
          newAvgCost = newQty > 0 ? (oldQty * oldCost + item.quantity * item.unitCost) / newQty : item.unitCost;

          await client.query(
            `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
             WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
            [item.quantity, tenantId, item.productId, warehouseId]
          );
        }

        await client.query(
          `UPDATE shop_products SET average_cost = $1, cost_price = $2, updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [newAvgCost, item.unitCost, item.productId, tenantId]
        );

        await insertPurchaseBatch(
          client,
          tenantId,
          item.productId,
          warehouseId,
          billId,
          item.quantity,
          item.unitCost,
          expiryDate,
          batchNo
        );

        await client.query(
          `INSERT INTO shop_inventory_movements (tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, unit_cost, total_cost)
           VALUES ($1, $2, $3, 'Purchase', $4, $5, $6, $7, $8)`,
          [
            tenantId,
            item.productId,
            warehouseId,
            item.quantity,
            billId,
            data.userId || null,
            item.unitCost,
            totalCost,
          ]
        );
      }

      await this.postPurchaseToAccounting(client, tenantId, billId, data);
      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
      return billId;
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
    return billId;
  }

  private async postPurchaseToAccounting(
    client: any,
    tenantId: string,
    billId: string,
    data: CreatePurchaseBillInput
  ): Promise<void> {
    const invAccId = await this.getOrCreateAccount(
      client,
      tenantId,
      'Merchandise Inventory',
      'Asset',
      COA.MERCHANDISE_INVENTORY
    );
    const apAccId = await this.getOrCreateAccount(
      client,
      tenantId,
      'Trade Payables (Suppliers)',
      'Liability',
      COA.TRADE_PAYABLES
    );

    const ref = `PB-${data.billNumber}`;
    const journalRes = await client.query(
      `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
       VALUES ($1, $2, $3, $4, 'Purchases', $5, 'Posted') RETURNING id`,
      [tenantId, data.billDate, ref, `Purchase ${data.billNumber}`, billId]
    );
    const journalId = journalRes[0].id;

    const totalAmount = data.totalAmount;
    const paidNowForAccounting = data.paidAmount || 0;

    // Debit Inventory (asset increase)
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
       VALUES ($1, $2, $3, $4, 0)`,
      [tenantId, journalId, invAccId, totalAmount]
    );
    // Credit Accounts Payable (full liability at purchase)
    await client.query(
      `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
       VALUES ($1, $2, $3, 0, $4)`,
      [tenantId, journalId, apAccId, totalAmount]
    );

    // If paid at purchase: Debit AP, Credit Cash/Bank
    if (paidNowForAccounting > 0 && (data.paymentStatus === 'Paid' || data.paymentStatus === 'Partial')) {
      let cashBankAccId: string;
      if (data.bankAccountId) {
        const bankRows = await client.query(
          'SELECT chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
          [data.bankAccountId, tenantId]
        );
        if (bankRows.length > 0 && bankRows[0].chart_account_id) {
          cashBankAccId = bankRows[0].chart_account_id;
        } else {
          cashBankAccId = await this.getOrCreateAccount(
            client,
            tenantId,
            'Main Bank Account',
            'Asset',
            COA.MAIN_BANK
          );
        }
      } else {
        const cashRows = await client.query(
          `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE ORDER BY name LIMIT 1`,
          [tenantId]
        );
        if (cashRows.length > 0 && cashRows[0].chart_account_id) {
          cashBankAccId = cashRows[0].chart_account_id;
        } else {
          cashBankAccId = await this.getOrCreateAccount(
            client,
            tenantId,
            'Cash on Hand',
            'Asset',
            COA.CASH_ON_HAND
          );
        }
      }
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, apAccId, paidNowForAccounting]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, cashBankAccId, paidNowForAccounting]
      );

      if (data.bankAccountId) {
        await client.query(
          `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [paidNowForAccounting, data.bankAccountId, tenantId]
        );
      }
    }
  }

  /**
   * Full update of purchase bill: line items, totals, metadata.
   * Reverses old accounting (Inv/AP only) and inventory, then re-posts with new amounts.
   * Keeps paid_amount unchanged (initial payment + supplier payment allocations).
   */
  async updatePurchaseBill(
    tenantId: string,
    billId: string,
    data: {
      billNumber: string;
      billDate: string;
      dueDate?: string;
      notes?: string;
      items: PurchaseBillItemInput[];
      subtotal: number;
      taxTotal: number;
      totalAmount: number;
    }
  ): Promise<void> {
    if (!data.items?.length) throw new Error('Purchase bill must have at least one line item');
    this.validatePurchaseItemsForBatches(data.items);

    await this.db.transaction(async (client) => {
      const billRows = await client.query(
        `SELECT id, bill_number, total_amount, paid_amount, initial_payment_bank_account_id
         FROM purchase_bills WHERE tenant_id = $1 AND id = $2`,
        [tenantId, billId]
      );
      if (billRows.length === 0) throw new Error('Purchase bill not found');
      const bill = billRows[0];
      const oldTotal = parseFloat(bill.total_amount) || 0;
      const paidAmount = parseFloat(bill.paid_amount) || 0;
      const newTotal = data.totalAmount;

      const invAccId = await this.getOrCreateAccount(
        client,
        tenantId,
        'Merchandise Inventory',
        'Asset',
        COA.MERCHANDISE_INVENTORY
      );
      const apAccId = await this.getOrCreateAccount(
        client,
        tenantId,
        'Trade Payables (Suppliers)',
        'Liability',
        COA.TRADE_PAYABLES
      );

      // 1) Reverse journal: only the main purchase lines (Dr Inv, Cr AP) for old total
      const jeRows = await client.query(
        `SELECT id FROM journal_entries WHERE tenant_id = $1 AND source_module = 'Purchases' AND source_id = $2`,
        [tenantId, billId]
      );
      if (jeRows.length > 0) {
        const journalId = jeRows[0].id;
        const ledgers = await client.query(
          `SELECT account_id, debit, credit FROM ledger_entries WHERE tenant_id = $1 AND journal_entry_id = $2`,
          [tenantId, journalId]
        );
        // Reverse only Inv (debit) and AP (credit) that equal oldTotal
        const revJournalRes = await client.query(
          `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
           VALUES ($1, NOW(), $2, $3, 'Purchases', $4, 'Posted') RETURNING id`,
          [tenantId, `Reversal-${bill.bill_number || billId}`, `Reversal of purchase (edit) ${bill.bill_number}`, billId]
        );
        const revJournalId = revJournalRes[0].id;
        for (const row of ledgers) {
          const debit = parseFloat(row.debit) || 0;
          const credit = parseFloat(row.credit) || 0;
          const amt = debit || credit;
          if (amt > 0 && (row.account_id === invAccId || (row.account_id === apAccId && credit === oldTotal))) {
            await client.query(
              `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
               VALUES ($1, $2, $3, $4, $5)`,
              [tenantId, revJournalId, row.account_id, credit, debit]
            );
          }
        }
      }

      // 2) Reverse inventory: batch-aware (remaining qty) or legacy line quantities
      const oldItems = await client.query(
        `SELECT product_id, quantity FROM purchase_bill_items WHERE tenant_id = $1 AND purchase_bill_id = $2`,
        [tenantId, billId]
      );
      const whRows = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      const warehouseId = whRows.length > 0 ? whRows[0].id : null;
      if (warehouseId) {
        const batchRows = await client.query(
          `SELECT 1 FROM inventory_batches WHERE tenant_id = $1 AND purchase_bill_id = $2 LIMIT 1`,
          [tenantId, billId]
        );
        if (batchRows.length > 0) {
          await reverseBatchesForPurchaseBill(client, tenantId, billId, warehouseId);
        } else {
          for (const item of oldItems) {
            const qty = parseFloat(item.quantity) || 0;
            await client.query(
              `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
               WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
              [qty, tenantId, item.product_id, warehouseId]
            );
          }
        }
      }

      const balanceDue = newTotal - paidAmount;
      const status = balanceDue <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Posted';

      // 3) Update bill row
      await client.query(
        `UPDATE purchase_bills SET
          bill_number = $1, bill_date = $2, due_date = $3, notes = $4,
          subtotal = $5, tax_total = $6, total_amount = $7, balance_due = $8, status = $9, updated_at = NOW()
         WHERE id = $10 AND tenant_id = $11`,
        [
          data.billNumber,
          data.billDate,
          data.dueDate ?? null,
          data.notes ?? null,
          data.subtotal,
          data.taxTotal,
          data.totalAmount,
          balanceDue,
          status,
          billId,
          tenantId,
        ]
      );

      // 4) Replace items
      await client.query('DELETE FROM purchase_bill_items WHERE tenant_id = $1 AND purchase_bill_id = $2', [tenantId, billId]);

      if (!warehouseId) throw new Error('No warehouse found');
      let lineIndex = 0;
      for (const item of data.items) {
        lineIndex += 1;
        const batchNo =
          (item.batchNo && String(item.batchNo).trim()) || `B-${data.billNumber}-${lineIndex}`;
        const expiryDate = String(item.expiryDate).trim().slice(0, 10);

        await client.query(
          `INSERT INTO purchase_bill_items (tenant_id, purchase_bill_id, product_id, quantity, unit_cost, tax_amount, subtotal, expiry_date, batch_no)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)`,
          [
            tenantId,
            billId,
            item.productId,
            item.quantity,
            item.unitCost,
            item.taxAmount || 0,
            item.subtotal,
            expiryDate,
            batchNo,
          ]
        );

        const totalCost = item.quantity * item.unitCost;
        const invRows = await client.query(
          `SELECT quantity_on_hand FROM shop_inventory
           WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 LIMIT 1`,
          [tenantId, item.productId, warehouseId]
        );

        let newQty: number;
        let newAvgCost: number;
        if (invRows.length === 0) {
          await client.query(
            `INSERT INTO shop_inventory (tenant_id, product_id, warehouse_id, quantity_on_hand, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (tenant_id, product_id, warehouse_id)
             DO UPDATE SET quantity_on_hand = shop_inventory.quantity_on_hand + $4, updated_at = NOW()`,
            [tenantId, item.productId, warehouseId, item.quantity]
          );
          newQty = item.quantity;
          newAvgCost = item.unitCost;
        } else {
          const oldQty = parseFloat(invRows[0].quantity_on_hand) || 0;
          const prodRows = await client.query(
            'SELECT average_cost, cost_price FROM shop_products WHERE id = $1 AND tenant_id = $2',
            [item.productId, tenantId]
          );
          const oldCost =
            prodRows[0]?.average_cost != null && Number(prodRows[0].average_cost) > 0
              ? Number(prodRows[0].average_cost)
              : Number(prodRows[0]?.cost_price) || 0;
          newQty = oldQty + item.quantity;
          newAvgCost = newQty > 0 ? (oldQty * oldCost + item.quantity * item.unitCost) / newQty : item.unitCost;

          await client.query(
            `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
             WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
            [item.quantity, tenantId, item.productId, warehouseId]
          );
        }

        await client.query(
          `UPDATE shop_products SET average_cost = $1, cost_price = $2, updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4`,
          [newAvgCost, item.unitCost, item.productId, tenantId]
        );

        await insertPurchaseBatch(
          client,
          tenantId,
          item.productId,
          warehouseId,
          billId,
          item.quantity,
          item.unitCost,
          expiryDate,
          batchNo
        );

        await client.query(
          `INSERT INTO shop_inventory_movements (tenant_id, product_id, warehouse_id, type, quantity, reference_id, user_id, unit_cost, total_cost)
           VALUES ($1, $2, $3, 'Purchase', $4, $5, $6, $7, $8)`,
          [tenantId, item.productId, warehouseId, item.quantity, billId, null, item.unitCost, totalCost]
        );
      }

      // 5) Post new journal (main purchase only; initial payment lines stay as-is from original)
      const ref = `PB-${data.billNumber}`;
      const journalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, $2, $3, $4, 'Purchases', $5, 'Posted') RETURNING id`,
        [tenantId, data.billDate, ref, `Purchase ${data.billNumber} (edit)`, billId]
      );
      const journalId = journalRes[0].id;
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, invAccId, newTotal]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, apAccId, newTotal]
      );

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
  }

  /**
   * Delete purchase bill. Fails if any supplier payments are allocated to this bill.
   * Reverses accounting (journal reversal), bank balance (if initial payment), and inventory.
   */
  async deletePurchaseBill(tenantId: string, billId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      const linked = await client.query(
        `SELECT 1 FROM purchase_bill_payments WHERE tenant_id = $1 AND purchase_bill_id = $2 LIMIT 1`,
        [tenantId, billId]
      );
      if (linked.length > 0) {
        throw new Error('Cannot delete bill: it has supplier payments applied. Remove or edit those payments first.');
      }

      const billRows = await client.query(
        `SELECT id, bill_number, total_amount, paid_amount, initial_payment_bank_account_id
         FROM purchase_bills WHERE tenant_id = $1 AND id = $2`,
        [tenantId, billId]
      );
      if (billRows.length === 0) throw new Error('Purchase bill not found');
      const bill = billRows[0];
      const totalAmount = parseFloat(bill.total_amount) || 0;
      const paidNow = parseFloat(bill.paid_amount) || 0;
      const bankId = bill.initial_payment_bank_account_id;

      // 1) Reverse journal: find journal for this bill and post reversing entry
      const jeRows = await client.query(
        `SELECT id, date, reference FROM journal_entries
         WHERE tenant_id = $1 AND source_module = 'Purchases' AND source_id = $2`,
        [tenantId, billId]
      );
      if (jeRows.length > 0) {
        const journalId = jeRows[0].id;
        const ledgers = await client.query(
          `SELECT account_id, debit, credit FROM ledger_entries WHERE tenant_id = $1 AND journal_entry_id = $2`,
          [tenantId, journalId]
        );
        const revRef = `Reversal-${bill.bill_number || billId}`;
        const revJournalRes = await client.query(
          `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
           VALUES ($1, NOW(), $2, $3, 'Purchases', $4, 'Posted') RETURNING id`,
          [tenantId, revRef, `Reversal of purchase ${bill.bill_number}`, billId]
        );
        const revJournalId = revJournalRes[0].id;
        for (const row of ledgers) {
          const debit = parseFloat(row.debit) || 0;
          const credit = parseFloat(row.credit) || 0;
          await client.query(
            `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
             VALUES ($1, $2, $3, $4, $5)`,
            [tenantId, revJournalId, row.account_id, credit, debit]
          );
        }
      }

      // 2) Reverse bank balance if there was initial payment
      if (paidNow > 0 && bankId) {
        await client.query(
          `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) + $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [paidNow, bankId, tenantId]
        );
      }

      // 3) Reverse inventory: batch remaining or legacy line quantities
      const items = await client.query(
        `SELECT product_id, quantity, unit_cost FROM purchase_bill_items WHERE tenant_id = $1 AND purchase_bill_id = $2`,
        [tenantId, billId]
      );
      const whRows = await client.query('SELECT id FROM shop_warehouses WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      const warehouseId = whRows.length > 0 ? whRows[0].id : null;
      if (warehouseId) {
        const batchRows = await client.query(
          `SELECT 1 FROM inventory_batches WHERE tenant_id = $1 AND purchase_bill_id = $2 LIMIT 1`,
          [tenantId, billId]
        );
        if (batchRows.length > 0) {
          await reverseBatchesForPurchaseBill(client, tenantId, billId, warehouseId);
        } else {
          for (const item of items) {
            const qty = parseFloat(item.quantity) || 0;
            await client.query(
              `UPDATE shop_inventory SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
               WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
              [qty, tenantId, item.product_id, warehouseId]
            );
          }
        }
      }

      await client.query('DELETE FROM purchase_bill_items WHERE tenant_id = $1 AND purchase_bill_id = $2', [tenantId, billId]);
      await client.query('DELETE FROM purchase_bills WHERE tenant_id = $1 AND id = $2', [tenantId, billId]);
      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    });
    const { notifyDailyReportUpdated } = await import('./dailyReportNotify.js');
    notifyDailyReportUpdated(tenantId).catch(() => {});
  }

  /**
   * Record supplier payment: allocations to bills + journal (Debit AP, Credit Cash/Bank).
   */
  async recordSupplierPayment(tenantId: string, data: SupplierPaymentInput): Promise<string> {
    return this.db.transaction(async (client) => {
      const payRes = await client.query(
        `INSERT INTO supplier_payments (tenant_id, supplier_id, amount, payment_method, bank_account_id, payment_date, reference, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          tenantId,
          data.supplierId,
          data.amount,
          data.paymentMethod,
          data.bankAccountId || null,
          data.paymentDate,
          data.reference || null,
          data.notes || null,
        ]
      );
      const paymentId = payRes[0].id;

      for (const alloc of data.allocations) {
        if (alloc.amount <= 0) continue;
        await client.query(
          `INSERT INTO purchase_bill_payments (tenant_id, purchase_bill_id, supplier_payment_id, amount)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, alloc.purchaseBillId, paymentId, alloc.amount]
        );
        await client.query(
          `UPDATE purchase_bills
           SET paid_amount = paid_amount + $1, balance_due = balance_due - $1,
               status = CASE WHEN (balance_due - $1) <= 0 THEN 'Paid' ELSE 'Partial' END,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [alloc.amount, alloc.purchaseBillId, tenantId]
        );
      }

      const apAccId = await this.getOrCreateAccount(
        client,
        tenantId,
        'Trade Payables (Suppliers)',
        'Liability',
        COA.TRADE_PAYABLES
      );

      let cashBankAccId: string;
      if (data.bankAccountId) {
        const bankRows = await client.query(
          'SELECT chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
          [data.bankAccountId, tenantId]
        );
        cashBankAccId =
          bankRows.length > 0 && bankRows[0].chart_account_id
            ? bankRows[0].chart_account_id
            : await this.getOrCreateAccount(client, tenantId, 'Main Bank Account', 'Asset', COA.MAIN_BANK);
      } else {
        const cashRows = await client.query(
          `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE LIMIT 1`,
          [tenantId]
        );
        cashBankAccId =
          cashRows.length > 0 && cashRows[0].chart_account_id
            ? cashRows[0].chart_account_id
            : await this.getOrCreateAccount(client, tenantId, 'Cash on Hand', 'Asset', COA.CASH_ON_HAND);
      }

      const ref = data.reference || `SP-${paymentId.slice(0, 8)}`;
      const journalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, $2, $3, $4, 'Purchases', $5, 'Posted') RETURNING id`,
        [tenantId, data.paymentDate, ref, `Supplier payment ${ref}`, paymentId]
      );
      const journalId = journalRes[0].id;

      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, apAccId, data.amount]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, cashBankAccId, data.amount]
      );

      if (data.bankAccountId) {
        await client.query(
          `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [data.amount, data.bankAccountId, tenantId]
        );
      }

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
      return paymentId;
    });
  }

  /**
   * Reverse a supplier payment in accounting and on bills (for update/delete).
   */
  private async reverseSupplierPaymentAccounting(
    client: any,
    tenantId: string,
    paymentId: string,
    amount: number,
    bankAccountId: string | null
  ): Promise<void> {
    const jeRows = await client.query(
      `SELECT id FROM journal_entries WHERE tenant_id = $1 AND source_module = 'Purchases' AND source_id = $2`,
      [tenantId, paymentId]
    );
    if (jeRows.length > 0) {
      const journalId = jeRows[0].id;
      const ledgers = await client.query(
        `SELECT account_id, debit, credit FROM ledger_entries WHERE tenant_id = $1 AND journal_entry_id = $2`,
        [tenantId, journalId]
      );
      const revJournalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, NOW(), $2, $3, 'Purchases', $4, 'Posted') RETURNING id`,
        [tenantId, `Reversal-SP-${paymentId.slice(0, 8)}`, `Reversal of supplier payment`, paymentId]
      );
      const revJournalId = revJournalRes[0].id;
      for (const row of ledgers) {
        const debit = parseFloat(row.debit) || 0;
        const credit = parseFloat(row.credit) || 0;
        await client.query(
          `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, revJournalId, row.account_id, credit, debit]
        );
      }
    }
    if (amount > 0 && bankAccountId) {
      await client.query(
        `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) + $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [amount, bankAccountId, tenantId]
      );
    }
  }

  /**
   * Update supplier payment: reverse existing allocations and accounting, then apply new data.
   * Bills linked to this payment get their status updated from new allocations.
   */
  async updateSupplierPayment(
    tenantId: string,
    paymentId: string,
    data: SupplierPaymentInput
  ): Promise<void> {
    return this.db.transaction(async (client) => {
      const payRows = await client.query(
        `SELECT id, amount, bank_account_id FROM supplier_payments WHERE tenant_id = $1 AND id = $2`,
        [tenantId, paymentId]
      );
      if (payRows.length === 0) throw new Error('Supplier payment not found');
      const oldAmount = parseFloat(payRows[0].amount) || 0;
      const oldBankId = payRows[0].bank_account_id || null;

      const allocs = await client.query(
        `SELECT purchase_bill_id, amount FROM purchase_bill_payments WHERE tenant_id = $1 AND supplier_payment_id = $2`,
        [tenantId, paymentId]
      );

      // Reverse: un-apply from bills (add back balance, update status)
      for (const a of allocs) {
        const amt = parseFloat(a.amount) || 0;
        if (amt <= 0) continue;
        await client.query(
          `UPDATE purchase_bills
           SET paid_amount = paid_amount - $1, balance_due = balance_due + $1,
               status = CASE WHEN (balance_due + $1) >= total_amount THEN 'Posted' WHEN (paid_amount - $1) > 0 THEN 'Partial' ELSE 'Posted' END,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [amt, a.purchase_bill_id, tenantId]
        );
      }

      await client.query('DELETE FROM purchase_bill_payments WHERE tenant_id = $1 AND supplier_payment_id = $2', [tenantId, paymentId]);
      await this.reverseSupplierPaymentAccounting(client, tenantId, paymentId, oldAmount, oldBankId);

      // Update payment row
      await client.query(
        `UPDATE supplier_payments SET amount = $1, payment_method = $2, bank_account_id = $3, payment_date = $4, reference = $5, notes = $6
         WHERE id = $7 AND tenant_id = $8`,
        [
          data.amount,
          data.paymentMethod,
          data.bankAccountId || null,
          data.paymentDate,
          data.reference || null,
          data.notes || null,
          paymentId,
          tenantId,
        ]
      );

      // Re-apply new allocations (same as record)
      for (const alloc of data.allocations) {
        if (alloc.amount <= 0) continue;
        await client.query(
          `INSERT INTO purchase_bill_payments (tenant_id, purchase_bill_id, supplier_payment_id, amount)
           VALUES ($1, $2, $3, $4)`,
          [tenantId, alloc.purchaseBillId, paymentId, alloc.amount]
        );
        await client.query(
          `UPDATE purchase_bills
           SET paid_amount = paid_amount + $1, balance_due = balance_due - $1,
               status = CASE WHEN (balance_due - $1) <= 0 THEN 'Paid' ELSE 'Partial' END,
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [alloc.amount, alloc.purchaseBillId, tenantId]
        );
      }

      const apAccId = await this.getOrCreateAccount(
        client,
        tenantId,
        'Trade Payables (Suppliers)',
        'Liability',
        COA.TRADE_PAYABLES
      );
      let cashBankAccId: string;
      if (data.bankAccountId) {
        const bankRows = await client.query(
          'SELECT chart_account_id FROM shop_bank_accounts WHERE id = $1 AND tenant_id = $2',
          [data.bankAccountId, tenantId]
        );
        cashBankAccId =
          bankRows.length > 0 && bankRows[0].chart_account_id
            ? bankRows[0].chart_account_id
            : await this.getOrCreateAccount(client, tenantId, 'Main Bank Account', 'Asset', COA.MAIN_BANK);
      } else {
        const cashRows = await client.query(
          `SELECT chart_account_id FROM shop_bank_accounts WHERE tenant_id = $1 AND account_type = 'Cash' AND is_active = TRUE LIMIT 1`,
          [tenantId]
        );
        cashBankAccId =
          cashRows.length > 0 && cashRows[0].chart_account_id
            ? cashRows[0].chart_account_id
            : await this.getOrCreateAccount(client, tenantId, 'Cash on Hand', 'Asset', COA.CASH_ON_HAND);
      }

      const ref = data.reference || `SP-${paymentId.slice(0, 8)}`;
      const journalRes = await client.query(
        `INSERT INTO journal_entries (tenant_id, date, reference, description, source_module, source_id, status)
         VALUES ($1, $2, $3, $4, 'Purchases', $5, 'Posted') RETURNING id`,
        [tenantId, data.paymentDate, ref, `Supplier payment ${ref}`, paymentId]
      );
      const journalId = journalRes[0].id;
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0)`,
        [tenantId, journalId, apAccId, data.amount]
      );
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, 0, $4)`,
        [tenantId, journalId, cashBankAccId, data.amount]
      );
      if (data.bankAccountId) {
        await client.query(
          `UPDATE shop_bank_accounts SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [data.amount, data.bankAccountId, tenantId]
        );
      }

      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    });
  }

  /**
   * Delete supplier payment. Reverses accounting and un-applies all allocations from bills.
   */
  async deleteSupplierPayment(tenantId: string, paymentId: string): Promise<void> {
    return this.db.transaction(async (client) => {
      const payRows = await client.query(
        `SELECT id, amount, bank_account_id FROM supplier_payments WHERE tenant_id = $1 AND id = $2`,
        [tenantId, paymentId]
      );
      if (payRows.length === 0) throw new Error('Supplier payment not found');
      const amount = parseFloat(payRows[0].amount) || 0;
      const bankId = payRows[0].bank_account_id || null;

      const allocs = await client.query(
        `SELECT purchase_bill_id, amount FROM purchase_bill_payments WHERE tenant_id = $1 AND supplier_payment_id = $2`,
        [tenantId, paymentId]
      );
      for (const a of allocs) {
        const amt = parseFloat(a.amount) || 0;
        if (amt <= 0) continue;
        await client.query(
          `UPDATE purchase_bills
           SET paid_amount = paid_amount - $1, balance_due = balance_due + $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3`,
          [amt, a.purchase_bill_id, tenantId]
        );
      }
      await client.query(
        `UPDATE purchase_bills SET status = CASE WHEN balance_due <= 0 THEN 'Paid' WHEN paid_amount > 0 THEN 'Partial' ELSE 'Posted' END, updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, allocs.map((a: any) => a.purchase_bill_id)]
      );

      await client.query('DELETE FROM purchase_bill_payments WHERE tenant_id = $1 AND supplier_payment_id = $2', [tenantId, paymentId]);
      await this.reverseSupplierPaymentAccounting(client, tenantId, paymentId, amount, bankId);
      await client.query('DELETE FROM supplier_payments WHERE tenant_id = $1 AND id = $2', [tenantId, paymentId]);
      await client.query('DELETE FROM report_aggregates WHERE tenant_id = $1', [tenantId]);
    });
  }

  async getPurchaseBills(tenantId: string, supplierId?: string) {
    let sql = `
      SELECT pb.*, v.name as supplier_name
      FROM purchase_bills pb
      JOIN shop_vendors v ON pb.supplier_id = v.id AND v.tenant_id = $1
      WHERE pb.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (supplierId) {
      sql += ` AND pb.supplier_id = $2`;
      params.push(supplierId);
    }
    sql += ` ORDER BY pb.bill_date DESC, pb.created_at DESC`;
    return this.db.query(sql, params);
  }

  async getPurchaseBillById(tenantId: string, billId: string) {
    const bills = await this.db.query(
      `SELECT pb.*, v.name as supplier_name, v.contact_no as supplier_phone
       FROM purchase_bills pb
       JOIN shop_vendors v ON pb.supplier_id = v.id AND v.tenant_id = $1
       WHERE pb.tenant_id = $1 AND pb.id = $2`,
      [tenantId, billId]
    );
    if (bills.length === 0) return null;
    const items = await this.db.query(
      `SELECT pbi.*, p.name as product_name, p.sku
       FROM purchase_bill_items pbi
       JOIN shop_products p ON pbi.product_id = p.id AND p.tenant_id = $1
       WHERE pbi.tenant_id = $1 AND pbi.purchase_bill_id = $2`,
      [tenantId, billId]
    );
    return { ...bills[0], items };
  }

  async getSupplierLedger(tenantId: string, supplierId?: string) {
    const purchases = await this.db.query(
      `SELECT pb.id, pb.supplier_id, pb.bill_number, pb.bill_date, pb.total_amount, pb.paid_amount, pb.balance_due, pb.status,
              v.name as supplier_name
       FROM purchase_bills pb
       JOIN shop_vendors v ON pb.supplier_id = v.id AND v.tenant_id = $1
       WHERE pb.tenant_id = $1 ${supplierId ? 'AND pb.supplier_id = $2' : ''}
       ORDER BY pb.bill_date DESC`,
      supplierId ? [tenantId, supplierId] : [tenantId]
    );

    const paymentRows = await this.db.query(
      `SELECT sp.id, sp.supplier_id, sp.amount, sp.payment_method, sp.payment_date, sp.reference,
              v.name as supplier_name
       FROM supplier_payments sp
       JOIN shop_vendors v ON sp.supplier_id = v.id AND v.tenant_id = $1
       WHERE sp.tenant_id = $1 ${supplierId ? 'AND sp.supplier_id = $2' : ''}
       ORDER BY sp.payment_date DESC`,
      supplierId ? [tenantId, supplierId] : [tenantId]
    );

    const outstandingBySupplier: Record<string, number> = {};
    for (const p of purchases) {
      const sid = p.supplier_id || (p as any).supplier_id;
      if (!sid) continue;
      outstandingBySupplier[sid] = (outstandingBySupplier[sid] || 0) + parseFloat(p.balance_due || 0);
    }

    return {
      purchases,
      payments: paymentRows,
      outstandingBySupplier,
    };
  }

  async getAPAgingReport(tenantId: string) {
    const rows = await this.db.query(
      `SELECT pb.supplier_id, v.name as supplier_name,
              pb.id as bill_id, pb.bill_number, pb.bill_date, pb.total_amount, pb.paid_amount, pb.balance_due,
              pb.due_date
       FROM purchase_bills pb
       JOIN shop_vendors v ON pb.supplier_id = v.id AND v.tenant_id = $1
       WHERE pb.tenant_id = $1 AND pb.balance_due > 0 AND pb.status != 'Cancelled'
       ORDER BY pb.due_date ASC NULLS LAST, pb.bill_date ASC`,
      [tenantId]
    );

    const now = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90Plus: 0 };
    const byBucket: Record<string, any[]> = {
      current: [],
      days30: [],
      days60: [],
      days90Plus: [],
    };

    for (const r of rows) {
      const due = r.due_date ? new Date(r.due_date) : new Date(r.bill_date);
      const balance = parseFloat(r.balance_due) || 0;
      if (balance <= 0) continue;
      const days = Math.floor((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));

      if (days <= 0) {
        buckets.current += balance;
        byBucket.current.push(r);
      } else if (days <= 30) {
        buckets.days30 += balance;
        byBucket.days30.push(r);
      } else if (days <= 60) {
        buckets.days60 += balance;
        byBucket.days60.push(r);
      } else {
        buckets.days90Plus += balance;
        byBucket.days90Plus.push(r);
      }
    }

    return {
      summary: buckets,
      totalOutstanding: buckets.current + buckets.days30 + buckets.days60 + buckets.days90Plus,
      byBucket,
      rows,
    };
  }

  async getInventoryValuationReport(tenantId: string) {
    const rows = await this.db.query(
      `SELECT p.id, p.name, p.sku, p.unit,
              COALESCE(SUM(i.quantity_on_hand), 0) as quantity_on_hand,
              COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0) as unit_cost,
              (COALESCE(SUM(i.quantity_on_hand), 0) * COALESCE(NULLIF(p.average_cost, 0), p.cost_price, 0)) as total_value
       FROM shop_products p
       LEFT JOIN shop_inventory i ON i.product_id = p.id AND i.tenant_id = $1
       WHERE p.tenant_id = $1 AND p.is_active = TRUE
       GROUP BY p.id, p.name, p.sku, p.unit, p.average_cost, p.cost_price
       ORDER BY total_value DESC NULLS LAST`,
      [tenantId]
    );

    let totalValue = 0;
    const list = rows.map((r: any) => {
      const qty = parseFloat(r.quantity_on_hand) || 0;
      const cost = parseFloat(r.unit_cost) || 0;
      const value = qty * cost;
      totalValue += value;
      return {
        ...r,
        quantity_on_hand: qty,
        unit_cost: cost,
        total_value: value,
      };
    });

    return { items: list, totalValue };
  }

  async getSupplierPayments(tenantId: string, supplierId?: string) {
    let sql = `
      SELECT sp.*, v.name as supplier_name
      FROM supplier_payments sp
      JOIN shop_vendors v ON sp.supplier_id = v.id AND v.tenant_id = $1
      WHERE sp.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (supplierId) {
      sql += ` AND sp.supplier_id = $2`;
      params.push(supplierId);
    }
    sql += ` ORDER BY sp.payment_date DESC`;
    return this.db.query(sql, params);
  }

  async getSupplierPaymentById(tenantId: string, paymentId: string) {
    const payments = await this.db.query(
      `SELECT sp.*, v.name as supplier_name
       FROM supplier_payments sp
       JOIN shop_vendors v ON sp.supplier_id = v.id AND v.tenant_id = $1
       WHERE sp.tenant_id = $1 AND sp.id = $2`,
      [tenantId, paymentId]
    );
    if (payments.length === 0) return null;
    const allocations = await this.db.query(
      `SELECT pbp.purchase_bill_id, pbp.amount, pb.bill_number
       FROM purchase_bill_payments pbp
       JOIN purchase_bills pb ON pb.id = pbp.purchase_bill_id AND pb.tenant_id = pbp.tenant_id
       WHERE pbp.tenant_id = $1 AND pbp.supplier_payment_id = $2`,
      [tenantId, paymentId]
    );
    return {
      ...payments[0],
      allocations: allocations.map((a: any) => ({
        purchaseBillId: a.purchase_bill_id,
        amount: parseFloat(a.amount) || 0,
        bill_number: a.bill_number,
      })),
    };
  }

  async getBillsWithBalance(tenantId: string, supplierId: string) {
    return this.db.query(
      `SELECT id, bill_number, bill_date, total_amount, paid_amount, balance_due, status
       FROM purchase_bills
       WHERE tenant_id = $1 AND supplier_id = $2 AND balance_due > 0 AND status != 'Cancelled'
       ORDER BY bill_date ASC`,
      [tenantId, supplierId]
    );
  }
}

let procurementServiceInstance: ProcurementService | null = null;
export function getProcurementService(): ProcurementService {
  if (!procurementServiceInstance) {
    procurementServiceInstance = new ProcurementService();
  }
  return procurementServiceInstance;
}
