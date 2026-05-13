import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Stock Ledger',
  'Inventory Valuation',
  'Low Stock',
  'Negative Stock',
  'Dead Stock',
  'Expiry Report',
  'Batch Tracking',
  'Warehouse Stock',
  'Inventory Movement',
  'Reorder Suggestions',
  'Stock Transfer Report',
  'Inventory Turnover',
];

const InventoryReportsPanel: React.FC = () => (
  <GenericCategoryPanel
    title="Inventory reports"
    subtitle="FIFO / weighted-average valuation modes plug into procurement and accounting ledgers."
    categoryId="inventory"
    reports={ITEMS}
  />
);

export default InventoryReportsPanel;
