export type ReportCategoryKey =
  | 'executive'
  | 'sales'
  | 'inventory'
  | 'financial'
  | 'customers'
  | 'suppliers'
  | 'cash_shift'
  | 'audit'
  | 'multi_branch'
  | 'restaurant'
  | 'ai'
  | 'custom';

export type ReportCatalogEntry = {
  category: ReportCategoryKey;
  slug: string;
  title: string;
  description?: string;
};

export function slugifyReportTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function E(category: ReportCategoryKey, title: string, description?: string): ReportCatalogEntry {
  return { category, slug: slugifyReportTitle(title), title, description };
}

/** Single source of truth for report routes: `/dashboard/reports/:category/:slug` */
export const REPORT_CATALOG: ReportCatalogEntry[] = [
  E('sales', 'Daily Sales Report', 'Per-day POS totals and transaction counts.'),
  E('sales', 'Sales by Product', 'Revenue and quantity by SKU / product.'),
  E('sales', 'Sales by Category', 'Roll-up through product categories.'),
  E('sales', 'Sales by Brand', 'Roll-up by brand dimension on products.'),
  E('sales', 'Sales by Customer', 'Spend and orders by contact / customer.'),
  E('sales', 'Sales by Branch', 'Compare branches for the selected window.'),
  E('sales', 'Sales by Cashier', 'Productivity by POS user.'),
  E('sales', 'Sales by Hour', 'Intra-day curve for staffing.'),
  E('sales', 'Sales Trend', 'Time-series trend of net sales.'),
  E('sales', 'Top Selling Items', 'Ranked SKUs by revenue.'),
  E('sales', 'Slow Moving Items', 'SKUs with the lowest velocity in range.'),
  E('sales', 'Product Mix Analysis', 'Category share of net sales.'),
  E('sales', 'Discount Analysis', 'Discount dollars by day and tender.'),
  E('sales', 'Refund Analysis', 'Returns and refunds from sales return module.'),
  E('sales', 'Tax Summary', 'Collected tax by jurisdiction window.'),
  E('sales', 'Payment Method Summary', 'Tender mix totals.'),
  E('inventory', 'Stock Ledger', 'Inventory movements with references.'),
  E('inventory', 'Inventory Valuation', 'On-hand × cost snapshot by warehouse.'),
  E('inventory', 'Low Stock', 'SKUs under reorder point.'),
  E('inventory', 'Negative Stock', 'Rows where on-hand quantity is negative.'),
  E('inventory', 'Dead Stock', 'No movement in the selected window.'),
  E('inventory', 'Expiry Report', 'Batch / expiry tracking (when batches exist).'),
  E('inventory', 'Batch Tracking', 'Lot-level balances.'),
  E('inventory', 'Warehouse Stock', 'Pivot view by warehouse.'),
  E('inventory', 'Inventory Movement', 'Movement types and velocity.'),
  E('inventory', 'Reorder Suggestions', 'Heuristic reorder candidates.'),
  E('inventory', 'Stock Transfer Report', 'Inter-warehouse transfers (when enabled).'),
  E('inventory', 'Inventory Turnover', 'COGS / average inventory proxy.'),
  E('financial', 'Profit & Loss', 'Structured P&L by chart of accounts.'),
  E('financial', 'Balance Sheet', 'Assets, liabilities, and equity snapshot.'),
  E('financial', 'Cash Flow', 'Operating / investing / financing buckets.'),
  E('financial', 'Trial Balance', 'Debit / credit trial for the period.'),
  E('financial', 'Expense Analysis', 'Expense lines by category and branch.'),
  E('financial', 'Income Summary', 'Revenue recognition summary.'),
  E('financial', 'Tax Report', 'Output tax vs input tax.'),
  E('financial', 'Accounts Receivable Aging', 'Buckets for open receivables.'),
  E('financial', 'Accounts Payable Aging', 'Buckets for supplier payables.'),
  E('financial', 'Cost of Goods Sold', 'COGS derived from sale line snapshots.'),
  E('financial', 'Ledger Reports', 'General ledger activity.'),
  E('financial', 'Journal Reports', 'Journal entry listing with drill-down.'),
  E('customers', 'Customer Ledger', 'Running balance by customer.'),
  E('customers', 'Customer Purchase History', 'Invoice / ticket history.'),
  E('customers', 'Top Customers', 'Ranked by revenue or margin.'),
  E('customers', 'Customer Retention', 'Repeat purchase cohort view.'),
  E('customers', 'Customer Lifetime Value', 'LTV estimation window.'),
  E('customers', 'Customer Aging', 'Open balance aging.'),
  E('customers', 'Loyalty Reports', 'Points issued / redeemed.'),
  E('customers', 'Repeat Purchase Analysis', 'Inter-purchase latency distribution.'),
  E('suppliers', 'Supplier Ledger', 'Running balance by vendor.'),
  E('suppliers', 'Supplier Purchases', 'Bills and receipts in range.'),
  E('suppliers', 'Outstanding Payables', 'Open balances on posted bills.'),
  E('suppliers', 'Purchase Trends', 'Spend trend by week.'),
  E('suppliers', 'Price Variance', 'PO vs receipt price deltas.'),
  E('suppliers', 'Vendor Performance', 'Fill rate and lead-time KPIs.'),
  E('cash_shift', 'Shift Closing (Z Report)', 'End-of-shift reconciliation.'),
  E('cash_shift', 'Interim Shift Report (X Report)', 'Mid-shift snapshot.'),
  E('cash_shift', 'Cash Drawer Summary', 'Cash movements by tender.'),
  E('cash_shift', 'Cashier Performance', 'Sales and void rates by cashier.'),
  E('cash_shift', 'Cash Difference Report', 'Over / short by shift.'),
  E('cash_shift', 'Register Activity', 'Terminal-level event timeline.'),
  E('audit', 'Void Transactions', 'POS voided tickets.'),
  E('audit', 'Cancelled Invoices', 'Voided / cancelled sales.'),
  E('audit', 'Discount Audit', 'High-discount lines and outliers.'),
  E('audit', 'Price Override Audit', 'Lines where POS price deviates from retail.'),
  E('audit', 'Login Activity', 'Authentication events from system logs.'),
  E('audit', 'Role & Permission Audit', 'Security configuration changes.'),
  E('audit', 'Deleted Records', 'Soft-delete and purge audit trail.'),
  E('audit', 'Failed Transactions', 'Logged failures and POS errors.'),
  E('audit', 'Suspicious Activity Detection', 'Heuristic risk signals.'),
  E('multi_branch', 'Branch Comparison', 'Side-by-side KPIs.'),
  E('multi_branch', 'Consolidated Sales', 'Enterprise roll-up.'),
  E('multi_branch', 'Consolidated P&L', 'Consolidated profitability.'),
  E('multi_branch', 'Branch Ranking', 'Leaderboard across branches.'),
  E('multi_branch', 'Inter-Branch Transfers', 'Stock transfers between branches.'),
  E('multi_branch', 'Regional Sales Heatmap', 'Geo density (requires geo data).'),
  E('restaurant', 'Kitchen Performance', 'Prep and fulfilment times.'),
  E('restaurant', 'Table Turnover', 'Covers and duration.'),
  E('restaurant', 'Rider Performance', 'Delivery KPIs.'),
  E('restaurant', 'Delivery Time Analysis', 'SLA adherence curve.'),
  E('restaurant', 'Recipe Consumption', 'Ingredient depletion from recipes.'),
  E('restaurant', 'Food Cost Analysis', 'Theoretical vs actual usage.'),
];

export function findCatalogEntry(category: string, slug: string): ReportCatalogEntry | undefined {
  return REPORT_CATALOG.find((e) => e.category === category && e.slug === slug);
}

export function listCatalogForCategory(category: ReportCategoryKey): ReportCatalogEntry[] {
  return REPORT_CATALOG.filter((e) => e.category === category);
}
