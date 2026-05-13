import React from 'react';
import GenericCategoryPanel from '../GenericCategoryPanel';

const ITEMS = [
  'Branch Comparison',
  'Consolidated Sales',
  'Consolidated P&L',
  'Branch Ranking',
  'Inter-Branch Transfers',
  'Regional Sales Heatmap',
];

const MultiBranchReportsPanel: React.FC = () => (
  <GenericCategoryPanel title="Multi-branch consolidation" categoryId="multi_branch" reports={ITEMS} />
);

export default MultiBranchReportsPanel;
