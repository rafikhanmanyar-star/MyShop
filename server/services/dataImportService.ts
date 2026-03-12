/**
 * Data import service: validate and import SKUs, inventory, bills, bill payments.
 * Returns row-level errors (row = 1-based Excel row, e.g. 2 = first data row).
 */
import { getDatabaseService } from './databaseService.js';
import { getShopService } from './shopService.js';
import { getProcurementService } from './procurementService.js';

export interface RowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  errors: RowError[];
  imported?: number;
}

export class DataImportService {
  private db = getDatabaseService();

  /** Validate and import SKU rows. Columns: Name, SKU, Barcode, Category, Unit, Cost Price, Retail Price, Tax Rate (%), Reorder Point */
  async validateAndImportSkus(tenantId: string, rows: any[]): Promise<ImportResult> {
    const errors: RowError[] = [];
    const toCreate: any[] = [];
    const seenSkus = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2; // Row 1 = header, first data = row 2
      const r = rows[i];
      const name = trim(r?.Name ?? r?.name);
      const sku = trim(r?.SKU ?? r?.sku);
      if (!name && !sku) continue; // skip empty rows
      if (!name) {
        errors.push({ row: excelRow, field: 'Name', message: 'Name is required.' });
      }
      if (!sku) {
        errors.push({ row: excelRow, field: 'SKU', message: 'SKU is required.' });
      }
      if (sku && seenSkus.has(sku)) {
        errors.push({ row: excelRow, field: 'SKU', message: `Duplicate SKU in file: ${sku}` });
      }
      if (sku) seenSkus.add(sku);
      const cost = parseNum(r?.CostPrice ?? r?.['Cost Price'] ?? r?.cost_price);
      const retail = parseNum(r?.RetailPrice ?? r?.['Retail Price'] ?? r?.retail_price);
      const taxRate = parseNum(r?.['Tax Rate (%)'] ?? r?.tax_rate ?? r?.taxRate);
      const reorder = parseNum(r?.['Reorder Point'] ?? r?.reorder_point);
      if (cost < 0 || retail < 0) {
        errors.push({ row: excelRow, field: 'Cost/Retail', message: 'Cost and retail price must be >= 0.' });
      }
      if (errors.some(e => e.row === excelRow)) continue;
      toCreate.push({
        name,
        sku,
        barcode: trim(r?.Barcode ?? r?.barcode) || null,
        category_id: trim(r?.Category ?? r?.category) || null,
        unit: trim(r?.Unit ?? r?.unit) || 'pcs',
        cost_price: isNaN(cost) ? 0 : cost,
        retail_price: isNaN(retail) ? 0 : retail,
        tax_rate: isNaN(taxRate) ? 0 : taxRate,
        reorder_point: isNaN(reorder) || reorder < 0 ? 10 : Math.floor(reorder),
      });
    }

    const existingSkus = await this.db.query(
      'SELECT sku FROM shop_products WHERE tenant_id = $1',
      [tenantId]
    );
    const existingSet = new Set(existingSkus.map((x: any) => (x.sku || '').toLowerCase()));
    for (let i = 0; i < toCreate.length; i++) {
      const excelRow = i + 2;
      if (existingSet.has(toCreate[i].sku.toLowerCase())) {
        errors.push({ row: excelRow, field: 'SKU', message: `SKU "${toCreate[i].sku}" already exists in the system.` });
      }
    }
    if (errors.length > 0) {
      return { success: false, errors };
    }

    const shop = getShopService();
    let imported = 0;
    for (const row of toCreate) {
      try {
        await shop.createProduct(tenantId, row);
        imported++;
      } catch (e: any) {
        errors.push({ row: 2 + toCreate.indexOf(row), message: e.message || 'Failed to create product.' });
        return { success: false, errors };
      }
    }
    return { success: true, errors: [], imported };
  }

  /** Validate and import inventory rows. Columns: SKU, Warehouse Code, Quantity */
  async validateAndImportInventory(tenantId: string, rows: any[]): Promise<ImportResult> {
    const errors: RowError[] = [];
    const products = await this.db.query('SELECT id, sku FROM shop_products WHERE tenant_id = $1', [tenantId]);
    const skuToId = new Map(products.map((p: any) => [(p.sku || '').toLowerCase().trim(), p.id]));
    const warehouses = await this.db.query('SELECT id, code FROM shop_warehouses WHERE tenant_id = $1', [tenantId]);
    const codeToWh = new Map(warehouses.map((w: any) => [(w.code || '').toUpperCase().trim(), w.id]));
    const mainWh = warehouses[0]?.id;

    const adjustments: { productId: string; warehouseId: string; quantity: number; excelRow: number }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2;
      const r = rows[i];
      const sku = trim(r?.SKU ?? r?.sku);
      const whCode = trim(r?.['Warehouse Code'] ?? r?.warehouse_code ?? r?.warehouseCode) || 'MAIN';
      const qty = parseNum(r?.Quantity ?? r?.quantity);
      if (!sku && (qty === 0 || isNaN(qty))) continue;
      if (!sku) {
        errors.push({ row: excelRow, field: 'SKU', message: 'SKU is required.' });
        continue;
      }
      const productId = skuToId.get(sku.toLowerCase());
      if (!productId) {
        errors.push({ row: excelRow, field: 'SKU', message: `SKU "${sku}" not found. Add the product first or use the correct SKU.` });
        continue;
      }
      const warehouseId = codeToWh.get(whCode.toUpperCase()) || mainWh;
      if (!warehouseId) {
        errors.push({ row: excelRow, field: 'Warehouse Code', message: 'No warehouse found. Create a warehouse first.' });
        continue;
      }
      if (isNaN(qty)) {
        errors.push({ row: excelRow, field: 'Quantity', message: 'Quantity must be a number.' });
        continue;
      }
      adjustments.push({ productId, warehouseId, quantity: qty, excelRow });
    }

    if (errors.length > 0) return { success: false, errors };

    const shop = getShopService();
    const userId = 'import';
    let imported = 0;
    for (const adj of adjustments) {
      try {
        await shop.adjustInventory(tenantId, {
          productId: adj.productId,
          warehouseId: adj.warehouseId,
          quantity: adj.quantity,
          type: 'Adjustment',
          reason: 'Bulk import',
          userId,
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: adj.excelRow, message: e.message || 'Failed to adjust inventory.' });
        return { success: false, errors };
      }
    }
    return { success: true, errors: [], imported };
  }

  /**
   * Validate and import purchase bills.
   * Rows: Bill Number, Bill Date, Due Date, Supplier Name, SKU, Quantity, Unit Cost, Tax Amount, Subtotal
   * Multiple rows with same Bill Number form one bill with multiple line items.
   */
  async validateAndImportBills(tenantId: string, rows: any[]): Promise<ImportResult> {
    const errors: RowError[] = [];
    const products = await this.db.query('SELECT id, sku FROM shop_products WHERE tenant_id = $1', [tenantId]);
    const skuToId = new Map(products.map((p: any) => [(p.sku || '').toLowerCase().trim(), p.id]));
    const vendors = await this.db.query('SELECT id, name FROM shop_vendors WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]);
    const vendorByName = new Map(vendors.map((v: any) => [(v.name || '').toLowerCase().trim(), v.id]));

    const byBill: Record<string, { billNumber: string; billDate: string; dueDate: string; supplierName: string; items: any[]; firstRow: number }> = {};

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2;
      const r = rows[i];
      const billNumber = trim(r?.['Bill Number'] ?? r?.bill_number ?? r?.billNumber);
      const billDate = trim(r?.['Bill Date'] ?? r?.bill_date ?? r?.billDate);
      const dueDate = trim(r?.['Due Date'] ?? r?.due_date ?? r?.dueDate);
      const supplierName = trim(r?.['Supplier Name'] ?? r?.supplier_name ?? r?.supplierName);
      const sku = trim(r?.SKU ?? r?.sku);
      const quantity = parseNum(r?.Quantity ?? r?.quantity);
      const unitCost = parseNum(r?.['Unit Cost'] ?? r?.unit_cost ?? r?.unitCost);
      const taxAmount = parseNum(r?.['Tax Amount'] ?? r?.tax_amount ?? r?.taxAmount);
      const subtotal = parseNum(r?.Subtotal ?? r?.subtotal);

      if (!billNumber && !supplierName && !sku) continue;

      if (!billNumber) {
        errors.push({ row: excelRow, field: 'Bill Number', message: 'Bill Number is required.' });
      }
      if (!billDate) {
        errors.push({ row: excelRow, field: 'Bill Date', message: 'Bill Date is required (e.g. YYYY-MM-DD).' });
      }
      if (!supplierName) {
        errors.push({ row: excelRow, field: 'Supplier Name', message: 'Supplier Name is required.' });
      }
      if (!sku) {
        errors.push({ row: excelRow, field: 'SKU', message: 'SKU is required.' });
      } else if (!skuToId.get(sku.toLowerCase())) {
        errors.push({ row: excelRow, field: 'SKU', message: `SKU "${sku}" not found.` });
      }
      if (quantity === undefined || isNaN(quantity) || quantity <= 0) {
        errors.push({ row: excelRow, field: 'Quantity', message: 'Quantity must be a positive number.' });
      }
      if (unitCost === undefined || isNaN(unitCost) || unitCost < 0) {
        errors.push({ row: excelRow, field: 'Unit Cost', message: 'Unit Cost must be >= 0.' });
      }
      if (errors.some(e => e.row === excelRow)) continue;

      const key = `${billNumber}|${billDate}|${supplierName}`.toLowerCase();
      if (!byBill[key]) {
        byBill[key] = {
          billNumber,
          billDate,
          dueDate: dueDate || billDate,
          supplierName,
          items: [],
          firstRow: excelRow,
        };
      }
      const productId = skuToId.get(sku.toLowerCase());
      const sub = !isNaN(subtotal) && subtotal >= 0 ? subtotal : quantity * unitCost;
      const tax = !isNaN(taxAmount) && taxAmount >= 0 ? taxAmount : 0;
      byBill[key].items.push({
        productId,
        quantity,
        unitCost,
        taxAmount: tax,
        subtotal: sub,
        excelRow,
      });
    }

    for (const key of Object.keys(byBill)) {
      const b = byBill[key];
      const supplierId = vendorByName.get(b.supplierName.toLowerCase());
      if (!supplierId) {
        errors.push({ row: b.firstRow, field: 'Supplier Name', message: `Supplier "${b.supplierName}" not found. Add the vendor first.` });
      }
    }
    if (errors.length > 0) return { success: false, errors };

    const proc = getProcurementService();
    let imported = 0;
    for (const key of Object.keys(byBill)) {
      const b = byBill[key];
      const supplierId = vendorByName.get(b.supplierName.toLowerCase())!;
      const items = b.items.map(it => ({
        productId: it.productId,
        quantity: it.quantity,
        unitCost: it.unitCost,
        taxAmount: it.taxAmount,
        subtotal: it.subtotal,
      }));
      const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const taxTotal = items.reduce((s, i) => s + (i.taxAmount || 0), 0);
      const totalAmount = subtotal + taxTotal;
      try {
        await proc.createPurchaseBill(tenantId, {
          supplierId,
          billNumber: b.billNumber,
          billDate: b.billDate,
          dueDate: b.dueDate || undefined,
          items,
          subtotal,
          taxTotal,
          totalAmount,
          paymentStatus: 'Credit',
          paidAmount: 0,
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: b.firstRow, message: e.message || 'Failed to create bill.' });
        return { success: false, errors };
      }
    }
    return { success: true, errors: [], imported };
  }

  /**
   * Validate and import bill payments (supplier payments).
   * Rows: Supplier Name, Payment Date, Amount, Payment Method (Cash/Bank/Card), Bank Account Name (optional), Reference, Notes, Bill Number (to allocate), Amount Allocated
   * Multiple rows with same Supplier Name + Payment Date + Amount can be one payment with multiple allocations; we group by (supplier, date, amount) and collect allocations.
   */
  async validateAndImportPayments(tenantId: string, rows: any[]): Promise<ImportResult> {
    const errors: RowError[] = [];
    const vendors = await this.db.query('SELECT id, name FROM shop_vendors WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]);
    const vendorByName = new Map(vendors.map((v: any) => [(v.name || '').toLowerCase().trim(), v.id]));
    const bills = await this.db.query(
      `SELECT pb.id, pb.bill_number, pb.balance_due FROM purchase_bills pb WHERE pb.tenant_id = $1`,
      [tenantId]
    );
    const billByNumber = new Map(bills.map((b: any) => [(b.bill_number || '').trim().toLowerCase(), b]));
    const bankAccounts = await this.db.query(
      'SELECT id, name FROM shop_bank_accounts WHERE tenant_id = $1 AND is_active = TRUE',
      [tenantId]
    );
    const bankByName = new Map(bankAccounts.map((ba: any) => [(ba.name || '').toLowerCase().trim(), ba.id]));

    const byPayment: Record<string, { supplierName: string; paymentDate: string; amount: number; method: string; bankName: string; reference: string; notes: string; allocations: { billNumber: string; amount: number }[]; firstRow: number }> = {};

    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2;
      const r = rows[i];
      const supplierName = trim(r?.['Supplier Name'] ?? r?.supplier_name ?? r?.supplierName);
      const paymentDate = trim(r?.['Payment Date'] ?? r?.payment_date ?? r?.paymentDate);
      const amount = parseNum(r?.Amount ?? r?.amount);
      const method = trim(r?.['Payment Method'] ?? r?.payment_method ?? r?.paymentMethod) || 'Cash';
      const bankName = trim(r?.['Bank Account Name'] ?? r?.bank_account_name ?? r?.bankAccountName);
      const reference = trim(r?.Reference ?? r?.reference);
      const notes = trim(r?.Notes ?? r?.notes);
      const billNumber = trim(r?.['Bill Number'] ?? r?.bill_number ?? r?.billNumber);
      const amountAllocated = parseNum(r?.['Amount Allocated'] ?? r?.amount_allocated ?? r?.amountAllocated);

      if (!supplierName && !paymentDate && (amount === undefined || isNaN(amount))) continue;

      if (!supplierName) {
        errors.push({ row: excelRow, field: 'Supplier Name', message: 'Supplier Name is required.' });
      }
      if (!paymentDate) {
        errors.push({ row: excelRow, field: 'Payment Date', message: 'Payment Date is required (e.g. YYYY-MM-DD).' });
      }
      if (amount === undefined || isNaN(amount) || amount <= 0) {
        errors.push({ row: excelRow, field: 'Amount', message: 'Amount must be a positive number.' });
      }
      const validMethod = ['Cash', 'Bank', 'Card'].includes(method) ? method : 'Cash';
      if (billNumber && (amountAllocated === undefined || isNaN(amountAllocated) || amountAllocated <= 0)) {
        errors.push({ row: excelRow, field: 'Amount Allocated', message: 'When Bill Number is set, Amount Allocated must be a positive number.' });
      }
      if (errors.some(e => e.row === excelRow)) continue;

      const key = `${supplierName}|${paymentDate}|${amount}`.toLowerCase();
      if (!byPayment[key]) {
        byPayment[key] = {
          supplierName,
          paymentDate,
          amount,
          method: validMethod,
          bankName: bankName || '',
          reference: reference || '',
          notes: notes || '',
          allocations: [],
          firstRow: excelRow,
        };
      }
      if (billNumber) {
        const bill = billByNumber.get(billNumber.toLowerCase());
        if (!bill) {
          errors.push({ row: excelRow, field: 'Bill Number', message: `Bill "${billNumber}" not found.` });
        } else {
          const allocAmount = !isNaN(amountAllocated) && amountAllocated > 0 ? amountAllocated : amount;
          const existing = byPayment[key].allocations.find((a: any) => a.billNumber === bill.id);
          if (existing) existing.amount += allocAmount;
          else byPayment[key].allocations.push({ billNumber: bill.id, amount: allocAmount });
        }
      }
    }

    for (const key of Object.keys(byPayment)) {
      const p = byPayment[key];
      if (!vendorByName.get(p.supplierName.toLowerCase())) {
        errors.push({ row: p.firstRow, field: 'Supplier Name', message: `Supplier "${p.supplierName}" not found.` });
      }
    }
    if (errors.length > 0) return { success: false, errors };

    const proc = getProcurementService();
    let imported = 0;
    for (const key of Object.keys(byPayment)) {
      const p = byPayment[key];
      const supplierId = vendorByName.get(p.supplierName.toLowerCase())!;
      let bankAccountId: string | undefined;
      if (p.bankName && p.method === 'Bank') {
        bankAccountId = bankByName.get(p.bankName.toLowerCase());
      }
      const allocations = p.allocations.length > 0
        ? p.allocations.map(a => ({ purchaseBillId: a.billNumber, amount: a.amount }))
        : [];
      try {
        await proc.recordSupplierPayment(tenantId, {
          supplierId,
          amount: p.amount,
          paymentMethod: p.method as 'Cash' | 'Bank' | 'Card',
          bankAccountId,
          paymentDate: p.paymentDate,
          reference: p.reference || undefined,
          notes: p.notes || undefined,
          allocations: allocations.length ? allocations : [],
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: p.firstRow, message: e.message || 'Failed to record payment.' });
        return { success: false, errors };
      }
    }
    return { success: true, errors: [], imported };
  }
}

function trim(v: any): string {
  if (v == null) return '';
  return String(v).trim();
}

function parseNum(v: any): number {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

let _instance: DataImportService | null = null;

export function getDataImportService(): DataImportService {
  if (!_instance) _instance = new DataImportService();
  return _instance;
}
