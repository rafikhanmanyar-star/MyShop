import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Profit & Loss',
  'Balance Sheet',
  'Cash Flow',
  'Trial Balance',
  'Expense Analysis',
  'Income Summary',
  'Tax Report',
  'Accounts Receivable Aging',
  'Accounts Payable Aging',
  'Cost of Goods Sold',
  'Ledger Reports',
  'Journal Reports',
];

const FinancialReportsPanel: React.FC = () => (
  <GenericCategoryPanel
    title="Financial statements"
    subtitle="Hierarchical chart of accounts with expand/collapse, period compare, and variance commentary."
    categoryId="financial"
    reports={ITEMS}
  />
);

export default FinancialReportsPanel;
