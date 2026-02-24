import { getDatabaseService } from './databaseService.js';
import { COA } from '../constants/accountCodes.js';

/** Single account in the default CoA template (code, name, type, normal_balance, level, parent_code) */
interface CoATemplateRow {
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  normal_balance: 'debit' | 'credit';
  level: number;
  parent_code: string | null;
}

/** Enterprise default Chart of Accounts – 5-digit hierarchical (IFRS-style). Only leaf accounts (level 4) are postable. */
const DEFAULT_COA_TEMPLATE: CoATemplateRow[] = [
  // Level 1 – Roots
  { code: '10000', name: 'Assets', type: 'Asset', normal_balance: 'debit', level: 1, parent_code: null },
  { code: '20000', name: 'Liabilities', type: 'Liability', normal_balance: 'credit', level: 1, parent_code: null },
  { code: '30000', name: 'Equity', type: 'Equity', normal_balance: 'credit', level: 1, parent_code: null },
  { code: '40000', name: 'Revenue', type: 'Income', normal_balance: 'credit', level: 1, parent_code: null },
  { code: '50000', name: 'Cost of Goods Sold', type: 'Expense', normal_balance: 'debit', level: 1, parent_code: null },
  { code: '60000', name: 'Operating Expenses', type: 'Expense', normal_balance: 'debit', level: 1, parent_code: null },
  { code: '70000', name: 'Other Income', type: 'Income', normal_balance: 'credit', level: 1, parent_code: null },
  { code: '80000', name: 'Other Expenses', type: 'Expense', normal_balance: 'debit', level: 1, parent_code: null },

  // Level 2 – 11000 Current Assets, 11100 Cash, etc.
  { code: '11000', name: 'Current Assets', type: 'Asset', normal_balance: 'debit', level: 2, parent_code: '10000' },
  { code: '12000', name: 'Non-Current Assets', type: 'Asset', normal_balance: 'debit', level: 2, parent_code: '10000' },
  { code: '11100', name: 'Cash & Cash Equivalents', type: 'Asset', normal_balance: 'debit', level: 3, parent_code: '11000' },
  { code: '11200', name: 'Accounts Receivable', type: 'Asset', normal_balance: 'debit', level: 3, parent_code: '11000' },
  { code: '11300', name: 'Inventory', type: 'Asset', normal_balance: 'debit', level: 3, parent_code: '11000' },
  { code: '11400', name: 'Prepaid Expenses', type: 'Asset', normal_balance: 'debit', level: 3, parent_code: '11000' },
  { code: '12100', name: 'Fixed Assets', type: 'Asset', normal_balance: 'debit', level: 3, parent_code: '12000' },
  { code: '12200', name: 'Accumulated Depreciation', type: 'Asset', normal_balance: 'credit', level: 3, parent_code: '12000' },

  { code: '21000', name: 'Current Liabilities', type: 'Liability', normal_balance: 'credit', level: 2, parent_code: '20000' },
  { code: '22000', name: 'Long-Term Liabilities', type: 'Liability', normal_balance: 'credit', level: 2, parent_code: '20000' },
  { code: '21100', name: 'Accounts Payable', type: 'Liability', normal_balance: 'credit', level: 3, parent_code: '21000' },
  { code: '21200', name: 'Short-Term Loans', type: 'Liability', normal_balance: 'credit', level: 3, parent_code: '21000' },
  { code: '21300', name: 'Accrued Expenses', type: 'Liability', normal_balance: 'credit', level: 3, parent_code: '21000' },
  { code: '22100', name: 'Long-Term Debt', type: 'Liability', normal_balance: 'credit', level: 3, parent_code: '22000' },

  { code: '31000', name: 'Owner Equity', type: 'Equity', normal_balance: 'credit', level: 2, parent_code: '30000' },

  { code: '41000', name: 'Sales Revenue', type: 'Income', normal_balance: 'credit', level: 2, parent_code: '40000' },
  { code: '42000', name: 'Sales Adjustments', type: 'Income', normal_balance: 'debit', level: 2, parent_code: '40000' },

  { code: '51000', name: 'Cost of Goods Sold', type: 'Expense', normal_balance: 'debit', level: 2, parent_code: '50000' },

  { code: '61000', name: 'Administrative Expenses', type: 'Expense', normal_balance: 'debit', level: 2, parent_code: '60000' },
  { code: '62000', name: 'Selling & Marketing', type: 'Expense', normal_balance: 'debit', level: 2, parent_code: '60000' },
  { code: '63000', name: 'Maintenance & Repairs', type: 'Expense', normal_balance: 'debit', level: 2, parent_code: '60000' },

  { code: '71000', name: 'Other Income', type: 'Income', normal_balance: 'credit', level: 2, parent_code: '70000' },
  { code: '81000', name: 'Other Expenses', type: 'Expense', normal_balance: 'debit', level: 2, parent_code: '80000' },

  // Level 4 – Leaf (postable) accounts
  { code: COA.CASH_ON_HAND, name: 'Cash on Hand', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11100' },
  { code: COA.MAIN_BANK, name: 'Main Bank Account', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11100' },
  { code: COA.SECONDARY_BANK, name: 'Secondary Bank Account', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11100' },
  { code: COA.MOBILE_WALLET, name: 'Mobile Wallet', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11100' },
  { code: COA.PETTY_CASH, name: 'Petty Cash', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11100' },
  { code: COA.TRADE_RECEIVABLES, name: 'Trade Receivables', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11200' },
  { code: COA.CUSTOMER_ADVANCES, name: 'Customer Advances', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11200' },
  { code: COA.RENTAL_RECEIVABLES, name: 'Rental Receivables', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11200' },
  { code: COA.LOAN_RECEIVABLE, name: 'Loan Receivable', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11200' },
  { code: COA.MERCHANDISE_INVENTORY, name: 'Merchandise Inventory', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11300' },
  { code: COA.RAW_MATERIALS, name: 'Raw Materials', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11300' },
  { code: COA.WORK_IN_PROGRESS, name: 'Work in Progress', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11300' },
  { code: COA.FINISHED_GOODS, name: 'Finished Goods', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11300' },
  { code: COA.INVENTORY_ADJUSTMENTS, name: 'Inventory Adjustments', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11300' },
  { code: COA.PREPAID_RENT, name: 'Prepaid Rent', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11400' },
  { code: COA.PREPAID_INSURANCE, name: 'Prepaid Insurance', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11400' },
  { code: COA.PREPAID_UTILITIES, name: 'Prepaid Utilities', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '11400' },
  { code: COA.FURNITURE, name: 'Furniture', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '12100' },
  { code: COA.COMPUTERS, name: 'Computers', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '12100' },
  { code: COA.POS_MACHINES, name: 'POS Machines', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '12100' },
  { code: COA.VEHICLES, name: 'Vehicles', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '12100' },
  { code: COA.EQUIPMENT, name: 'Equipment', type: 'Asset', normal_balance: 'debit', level: 4, parent_code: '12100' },
  { code: COA.ACCUM_DEPREC_FURNITURE, name: 'Furniture Depreciation', type: 'Asset', normal_balance: 'credit', level: 4, parent_code: '12200' },
  { code: COA.ACCUM_DEPREC_EQUIPMENT, name: 'Equipment Depreciation', type: 'Asset', normal_balance: 'credit', level: 4, parent_code: '12200' },

  { code: COA.TRADE_PAYABLES, name: 'Trade Payables (Suppliers)', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21100' },
  { code: COA.UTILITY_PAYABLES, name: 'Utility Payables', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21100' },
  { code: COA.SALARY_PAYABLE, name: 'Salary Payable', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21100' },
  { code: COA.TAX_PAYABLE, name: 'Tax Payable', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21100' },
  { code: COA.SHORT_TERM_BANK_LOAN, name: 'Bank Loan', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21200' },
  { code: COA.PRIVATE_LOAN, name: 'Private Loan', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21200' },
  { code: COA.LOAN_FROM_DIRECTOR, name: 'Loan from Director', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21200' },
  { code: COA.ACCRUED_SALARIES, name: 'Accrued Salaries', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21300' },
  { code: COA.ACCRUED_RENT, name: 'Accrued Rent', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21300' },
  { code: COA.ACCRUED_UTILITIES, name: 'Accrued Utilities', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '21300' },
  { code: COA.LONG_TERM_BANK_LOAN, name: 'Long-Term Bank Loan', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '22100' },
  { code: COA.LEASE_LIABILITY, name: 'Lease Liability', type: 'Liability', normal_balance: 'credit', level: 4, parent_code: '22100' },

  { code: COA.CAPITAL_INVESTED, name: 'Capital Invested', type: 'Equity', normal_balance: 'credit', level: 4, parent_code: '31000' },
  { code: COA.ADDITIONAL_CAPITAL, name: 'Additional Capital', type: 'Equity', normal_balance: 'credit', level: 4, parent_code: '31000' },
  { code: COA.RETAINED_EARNINGS, name: 'Retained Earnings', type: 'Equity', normal_balance: 'credit', level: 4, parent_code: '31000' },
  { code: COA.DRAWINGS, name: 'Drawings', type: 'Equity', normal_balance: 'debit', level: 4, parent_code: '31000' },

  { code: COA.RETAIL_SALES, name: 'Retail Sales', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.WHOLESALE_SALES, name: 'Wholesale Sales', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.ONLINE_SALES, name: 'Online Sales', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.RENTAL_INCOME, name: 'Rental Income', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.SERVICE_CHARGES, name: 'Service Charges', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.LOAN_INTEREST_INCOME, name: 'Loan Interest Income', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '41000' },
  { code: COA.SALES_RETURNS, name: 'Sales Returns', type: 'Income', normal_balance: 'debit', level: 4, parent_code: '42000' },
  { code: COA.SALES_DISCOUNTS, name: 'Sales Discounts', type: 'Income', normal_balance: 'debit', level: 4, parent_code: '42000' },

  { code: COA.COST_OF_GOODS_SOLD, name: 'Cost of Goods Sold', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '51000' },
  { code: COA.INVENTORY_SHRINKAGE, name: 'Inventory Shrinkage', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '51000' },
  { code: COA.PURCHASE_DISCOUNTS, name: 'Purchase Discounts', type: 'Expense', normal_balance: 'credit', level: 4, parent_code: '51000' },
  { code: COA.FREIGHT_INWARD, name: 'Freight Inward', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '51000' },

  { code: COA.SALARIES_EXPENSE, name: 'Salaries Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.RENT_EXPENSE, name: 'Rent Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.ELECTRICITY_EXPENSE, name: 'Electricity Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.GAS_EXPENSE, name: 'Gas Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.INTERNET_EXPENSE, name: 'Internet Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.OFFICE_SUPPLIES, name: 'Office Supplies', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.SOFTWARE_SUBSCRIPTION, name: 'Software Subscription', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '61000' },
  { code: COA.ADVERTISING_EXPENSE, name: 'Advertising Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '62000' },
  { code: COA.DELIVERY_EXPENSE, name: 'Delivery Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '62000' },
  { code: COA.COMMISSION_EXPENSE, name: 'Commission Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '62000' },
  { code: COA.EQUIPMENT_MAINTENANCE, name: 'Equipment Maintenance', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '63000' },
  { code: COA.SHOP_MAINTENANCE, name: 'Shop Maintenance', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '63000' },

  { code: COA.OTHER_INCOME, name: 'Other Income', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '71000' },
  { code: COA.GAIN_ON_ASSET_SALE, name: 'Gain on Asset Sale', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '71000' },
  { code: COA.DISCOUNT_RECEIVED, name: 'Discount Received', type: 'Income', normal_balance: 'credit', level: 4, parent_code: '71000' },

  { code: COA.BANK_CHARGES, name: 'Bank Charges', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '81000' },
  { code: COA.INTEREST_EXPENSE, name: 'Interest Expense', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '81000' },
  { code: COA.PENALTIES_FINES, name: 'Penalties & Fines', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '81000' },
  { code: COA.LOSS_ON_ASSET_DISPOSAL, name: 'Loss on Asset Disposal', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '81000' },
  { code: COA.OTHER_EXPENSES, name: 'Other Expenses', type: 'Expense', normal_balance: 'debit', level: 4, parent_code: '81000' },
];

export class CoaSeedService {
  private db = getDatabaseService();

  /**
   * Seed the default enterprise Chart of Accounts for a tenant.
   * Inserts only accounts that do not already exist (by code) for this tenant.
   * Safe to call on registration and for existing tenants (idempotent).
   */
  async seedDefaultChartOfAccounts(tenantId: string): Promise<{ inserted: number; skipped: number }> {
    const existing = await this.db.query<{ code: string }>(
      'SELECT code FROM accounts WHERE tenant_id = $1 AND code IS NOT NULL AND code <> \'\'',
      [tenantId]
    );
    const existingSet = new Set(existing.map((r) => r.code));

    const idByCode = new Map<string, string>(); // code -> account id (for parent resolution)
    let inserted = 0;

    await this.db.transaction(async (client: any) => {
      for (const row of DEFAULT_COA_TEMPLATE) {
        if (existingSet.has(row.code)) {
          continue;
        }
        const parentId = row.parent_code ? idByCode.get(row.parent_code) ?? null : null;
        const res = await client.query(
          `INSERT INTO accounts (tenant_id, name, code, type, normal_balance, level, parent_account_id, is_active, balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 0)
           RETURNING id`,
          [
            tenantId,
            row.name,
            row.code,
            row.type,
            row.normal_balance,
            row.level,
            parentId,
          ]
        );
        if (res.length > 0) {
          idByCode.set(row.code, res[0].id);
          inserted++;
        }
      }
    });

    return { inserted, skipped: DEFAULT_COA_TEMPLATE.length - inserted };
  }

  /**
   * Returns true if this tenant has at least one account (so CoA may already be seeded or legacy).
   */
  async hasAnyAccounts(tenantId: string): Promise<boolean> {
    const rows = await this.db.query('SELECT 1 FROM accounts WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    return rows.length > 0;
  }
}

let coaSeedServiceInstance: CoaSeedService | null = null;
export function getCoaSeedService(): CoaSeedService {
  if (!coaSeedServiceInstance) {
    coaSeedServiceInstance = new CoaSeedService();
  }
  return coaSeedServiceInstance;
}
