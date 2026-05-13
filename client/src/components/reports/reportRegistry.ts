import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Boxes,
  ChefHat,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  LineChart,
  Shield,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReportCategoryId } from '../../types/reports';

export type ReportNavItem = {
  id: ReportCategoryId;
  label: string;
  icon: LucideIcon;
};

export const REPORT_NAV: ReportNavItem[] = [
  { id: 'executive', label: 'Executive Dashboard', icon: LayoutDashboard },
  { id: 'sales', label: 'Sales Reports', icon: BarChart3 },
  { id: 'inventory', label: 'Inventory Reports', icon: Boxes },
  { id: 'financial', label: 'Financial Reports', icon: Wallet },
  { id: 'customers', label: 'Customer Reports', icon: Users },
  { id: 'suppliers', label: 'Supplier Reports', icon: Truck },
  { id: 'cash_shift', label: 'Cash & Shift Reports', icon: LineChart },
  { id: 'audit', label: 'Audit & Security', icon: Shield },
  { id: 'multi_branch', label: 'Multi-Branch Reports', icon: GitBranch },
  { id: 'restaurant', label: 'Restaurant Reports', icon: ChefHat },
  { id: 'ai', label: 'AI Insights', icon: Sparkles },
  { id: 'custom', label: 'Custom Reports', icon: FileSpreadsheet },
];
