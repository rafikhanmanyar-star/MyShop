import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Kitchen Performance',
  'Table Turnover',
  'Rider Performance',
  'Delivery Time Analysis',
  'Recipe Consumption',
  'Food Cost Analysis',
];

const RestaurantReportsPanel: React.FC = () => (
  <GenericCategoryPanel title="Restaurant operations" categoryId="restaurant" reports={ITEMS} />
);

export default RestaurantReportsPanel;
