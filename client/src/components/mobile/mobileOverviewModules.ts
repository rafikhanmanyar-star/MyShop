import {
  LayoutDashboard,
  Receipt,
  Truck,
  LayoutGrid,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type MobileModuleId = 'dashboard' | 'khata' | 'procurement' | 'orders' | 'loyalty';

export type MobileModuleDef = {
  id: MobileModuleId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  roles: string[];
  subtitle: string;
};

export const MOBILE_MODULES: MobileModuleDef[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: LayoutDashboard,
    roles: ['admin', 'accountant'],
    subtitle: "Today's sales, profit, and operational alerts",
  },
  {
    id: 'khata',
    label: 'Khata',
    shortLabel: 'Khata',
    icon: Receipt,
    roles: ['admin', 'accountant', 'pos_cashier'],
    subtitle: 'Customer credit ledger and receivables',
  },
  {
    id: 'procurement',
    label: 'Procurement',
    shortLabel: 'Procure',
    icon: Truck,
    roles: ['admin', 'accountant'],
    subtitle: 'Supplier payables and open purchase bills',
  },
  {
    id: 'orders',
    label: 'Order Center',
    shortLabel: 'Orders',
    icon: LayoutGrid,
    roles: ['admin', 'pos_cashier'],
    subtitle: 'Mobile, voice, and delivery queue',
  },
  {
    id: 'loyalty',
    label: 'Loyalty',
    shortLabel: 'Loyalty',
    icon: Users,
    roles: ['admin'],
    subtitle: 'Members and points program',
  },
];

export function mobileModulesForRole(role: string): MobileModuleDef[] {
  return MOBILE_MODULES.filter((m) => m.roles.includes(role));
}

export function isMobileModuleId(value: string | null, role: string): value is MobileModuleId {
  if (!value) return false;
  return mobileModulesForRole(role).some((m) => m.id === value);
}

export function defaultMobileModuleId(role: string): MobileModuleId {
  const modules = mobileModulesForRole(role);
  return modules[0]?.id ?? 'dashboard';
}

export const MOBILE_MODULE_ICON_CLASS: Record<MobileModuleId, string> = {
  dashboard: 'bg-[#4A90E2]/15 text-[#4A90E2] dark:bg-[#4A90E2]/20',
  khata: 'bg-violet-500/15 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400',
  procurement: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400',
  orders: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400',
  loyalty: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400',
};

export const MOBILE_MODULE_HERO_CLASS: Record<MobileModuleId, string> = {
  dashboard: 'from-[#4A90E2]/12 via-[#4A90E2]/5 to-transparent border-[#4A90E2]/20',
  khata: 'from-violet-500/12 via-violet-500/5 to-transparent border-violet-500/20',
  procurement: 'from-amber-500/12 via-amber-500/5 to-transparent border-amber-500/20',
  orders: 'from-emerald-500/12 via-emerald-500/5 to-transparent border-emerald-500/20',
  loyalty: 'from-indigo-500/12 via-indigo-500/5 to-transparent border-indigo-500/20',
};
