import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Supplier Ledger',
  'Supplier Purchases',
  'Outstanding Payables',
  'Purchase Trends',
  'Price Variance',
  'Vendor Performance',
];

const SuppliersReportsPanel: React.FC = () => (
  <GenericCategoryPanel title="Supplier intelligence" categoryId="suppliers" reports={ITEMS} />
);

export default SuppliersReportsPanel;
