import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Shift Closing (Z Report)',
  'Interim Shift Report (X Report)',
  'Cash Drawer Summary',
  'Cashier Performance',
  'Cash Difference Report',
  'Register Activity',
];

const CashShiftReportsPanel: React.FC = () => (
  <GenericCategoryPanel title="Cash & shift control" categoryId="cash_shift" reports={ITEMS} />
);

export default CashShiftReportsPanel;
