import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Customer Ledger',
  'Customer Purchase History',
  'Top Customers',
  'Customer Retention',
  'Customer Lifetime Value',
  'Customer Aging',
  'Loyalty Reports',
  'Repeat Purchase Analysis',
];

const CustomersReportsPanel: React.FC = () => (
  <GenericCategoryPanel title="Customer analytics" categoryId="customers" reports={ITEMS} />
);

export default CustomersReportsPanel;
