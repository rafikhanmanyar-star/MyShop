import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Download, Menu, Printer, Save } from 'lucide-react';
import { Routes, Route, useNavigate, useSearchParams, matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useReportFilters } from '../../hooks/useReportFilters';
import { roleHasReportPermission } from '../../lib/reportPermissions';
import { shopApi, shopUserApi } from '../../services/shopApi';
import { reportsApi } from '../../services/reportsApi';
import { exportReportTable } from '../../utils/reportExport';
import type { ReportFilterState } from '../../types/reports';
import { isReportCategoryId, sanitizeReportFilters } from '../../types/reports';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ReportFilters from './report-filters';
import { REPORT_NAV } from './reportRegistry';
import ExecutiveDashboardPanel from './executive-dashboard/ExecutiveDashboardPanel';
import SalesReportsPanel from './sales/SalesReportsPanel';
import InventoryReportsPanel from './inventory/InventoryReportsPanel';
import FinancialReportsPanel from './financial/FinancialReportsPanel';
import CustomersReportsPanel from './customers/CustomersReportsPanel';
import SuppliersReportsPanel from './suppliers/SuppliersReportsPanel';
import CashShiftReportsPanel from './cash-shift/CashShiftReportsPanel';
import AuditReportsPanel from './audit/AuditReportsPanel';
import MultiBranchReportsPanel from './multi-branch/MultiBranchReportsPanel';
import RestaurantReportsPanel from './restaurant/RestaurantReportsPanel';
import AIInsightsPanel from './ai-insights/AIInsightsPanel';
import CustomReportBuilder from './custom-builder/CustomReportBuilder';
import Card from '../ui/Card';
import ReportDetailPage from './ReportDetailPage';

const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { branches, selectedBranchId } = useBranch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { category, filters, setFilters, commitFiltersToUrl, setSearchDebounced, range } = useReportFilters();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const detailMatch = matchPath(
    { path: '/dashboard/reports/:reportCategory/:reportSlug', end: true },
    location.pathname
  );
  const activeCategoryId =
    detailMatch?.params.reportCategory && isReportCategoryId(detailMatch.params.reportCategory)
      ? detailMatch.params.reportCategory
      : category;

  const [savedItems, setSavedItems] = useState<{ id: string; name: string; categorySlug: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setSidebarCollapsed(!mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, cat, br, u] = await Promise.all([
          shopApi.getWarehouses(),
          shopApi.getShopCategories(),
          shopApi.getShopBrands(),
          shopUserApi.getUsers(),
        ]);
        if (cancelled) return;
        setWarehouses((w || []).map((x: { id: string; name?: string; code?: string }) => ({ id: x.id, name: x.name || x.code || x.id })));
        setCategories((cat || []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        setBrands(
          (br || [])
            .filter((x: { is_active?: boolean }) => x.is_active !== false)
            .map((x: { id: string; name: string }) => ({ id: x.id, name: x.name }))
        );
        setUsers((u || []).map((x: { id: string; name?: string; username?: string }) => ({ id: x.id, name: x.name || x.username || x.id })));
      } catch {
        if (!cancelled) {
          setWarehouses([]);
          setCategories([]);
          setBrands([]);
          setUsers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canExport = roleHasReportPermission(user?.role, 'reports.export');
  const canAudit = roleHasReportPermission(user?.role, 'reports.audit');
  const canAi = roleHasReportPermission(user?.role, 'reports.ai');
  const canCustom = roleHasReportPermission(user?.role, 'reports.custom');

  const reportNavItems = useMemo(() => REPORT_NAV.filter((item) => item.id !== 'audit' || canAudit), [canAudit]);

  const branchOptions = useMemo(() => branches.map((b) => ({ id: b.id, name: b.name })), [branches]);

  const refreshSaved = useCallback(async () => {
    try {
      const res = await reportsApi.listSaved();
      const items = (res.items as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        categorySlug: r.categorySlug,
      }));
      setSavedItems(items);
    } catch {
      setSavedItems([]);
    }
  }, []);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { name?: string; moduleKey?: string; fields?: string[] };
      if (!detail?.name?.trim()) return;
      try {
        await reportsApi.upsertTemplate({
          name: detail.name.trim(),
          moduleKey: detail.moduleKey || 'sales',
          definition: { fields: detail.fields || [] },
        });
        await refreshSaved();
        alert('Template saved to server.');
      } catch (e: any) {
        alert(e?.message || 'Failed to save template');
      }
    };
    window.addEventListener('reports:save-template', handler as EventListener);
    return () => window.removeEventListener('reports:save-template', handler as EventListener);
  }, [refreshSaved]);

  const onSaveFilterPreset = async (name: string) => {
    await reportsApi.createFilterPreset({ name, filters });
    alert('Filter preset saved.');
  };

  const onLoadPresets = async () => {
    const res = await reportsApi.listFilterPresets();
    return (res.items as any[]).map((r) => ({ id: r.id, name: r.name }));
  };

  const onApplyPreset = async (id: string) => {
    const res = await reportsApi.listFilterPresets();
    const row = (res.items as any[]).find((r) => r.id === id);
    if (!row?.filters) return null;
    const merged: ReportFilterState = {
      ...filters,
      ...sanitizeReportFilters(row.filters as Record<string, unknown>),
    };
    return merged;
  };

  const handleExportBundle = async (fmt: 'csv' | 'xlsx' | 'pdf') => {
    if (!canExport) return;
    exportReportTable(fmt, `report-${category}`, ['Metric', 'Value'], [
      ['Range', `${range.from} → ${range.to}`],
      ['Branch', filters.branchId || selectedBranchId || 'ALL'],
      ['Category', category],
    ]);
  };

  const main = () => {
    switch (category) {
      case 'executive':
        return <ExecutiveDashboardPanel filters={filters} range={range} />;
      case 'sales':
        return <SalesReportsPanel userRole={user?.role} />;
      case 'inventory':
        return <InventoryReportsPanel />;
      case 'financial':
        return <FinancialReportsPanel />;
      case 'customers':
        return <CustomersReportsPanel />;
      case 'suppliers':
        return <SuppliersReportsPanel />;
      case 'cash_shift':
        return <CashShiftReportsPanel />;
      case 'audit':
        return canAudit ? (
          <AuditReportsPanel />
        ) : (
          <Card className="border border-slate-200/80 bg-white/90 p-6 dark:border-slate-700 dark:bg-slate-950/70">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Restricted</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Audit reports require administrator access.</p>
          </Card>
        );
      case 'multi_branch':
        return <MultiBranchReportsPanel />;
      case 'restaurant':
        return <RestaurantReportsPanel />;
      case 'ai':
        return canAi ? (
          <AIInsightsPanel />
        ) : (
          <Card className="border border-slate-200/80 bg-white/90 p-6 dark:border-slate-700 dark:bg-slate-950/70">
            <p className="text-sm text-slate-600 dark:text-slate-400">AI insights are not enabled for this role.</p>
          </Card>
        );
      case 'custom':
        return canCustom ? (
          <CustomReportBuilder />
        ) : (
          <Card className="border border-slate-200/80 bg-white/90 p-6 dark:border-slate-700 dark:bg-slate-950/70">
            <p className="text-sm text-slate-600 dark:text-slate-400">Custom report builder requires elevated permissions.</p>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#ECEFF3] dark:bg-slate-950">
      <header className="z-20 shrink-0 border-b border-slate-200/90 bg-white/90 px-4 py-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200/80 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label="Toggle report navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-[#0B2A5B] dark:text-slate-50 sm:text-2xl">
                Enterprise reporting
              </h1>
              <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">
                SAP-grade analytics shell — modular datasets, RBAC, exports, and saved assets.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              hideIcon
              className="min-w-[180px] max-w-[240px] text-sm"
              aria-label="Saved reports"
              value=""
              onChange={async (e) => {
                const id = e.target.value;
                if (!id) return;
                const row = savedItems.find((s) => s.id === id);
                if (row?.categorySlug && isReportCategoryId(row.categorySlug)) {
                  const n = new URLSearchParams(searchParams);
                  n.set('cat', row.categorySlug);
                  navigate({ pathname: '/dashboard/reports', search: n.toString() });
                }
                await refreshSaved();
                e.target.value = '';
              }}
            >
              <option value="">Saved reports…</option>
              {savedItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {canExport && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => handleExportBundle('csv')}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => handleExportBundle('xlsx')}>
                  Excel
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => handleExportBundle('pdf')}>
                  PDF
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                const name = window.prompt('Save current view as…');
                if (!name?.trim()) return;
                try {
                  await reportsApi.createSaved({
                    name: name.trim(),
                    categorySlug: category,
                    definition: { filters, range },
                  });
                  await refreshSaved();
                } catch (e: any) {
                  alert(e?.message || 'Failed to save');
                }
              }}
            >
              <Save className="h-4 w-4" /> Save view
            </Button>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        {!sidebarCollapsed && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="Close report navigation"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950/90 lg:static lg:z-0 lg:shadow-none ${
            sidebarCollapsed ? '-translate-x-full lg:translate-x-0' : 'translate-x-0'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2 dark:border-slate-800">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Library
            </span>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Close sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <nav className="custom-scrollbar flex-1 overflow-y-auto p-2">
            {reportNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeCategoryId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const n = new URLSearchParams(searchParams);
                    n.set('cat', item.id);
                    navigate({ pathname: '/dashboard/reports', search: n.toString() }, { replace: true });
                    if (window.matchMedia('(max-width: 1023px)').matches) setSidebarCollapsed(true);
                  }}
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors lg:mb-1 ${
                    active
                      ? 'bg-[#0047AB] text-white shadow-md dark:bg-blue-600'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          <ReportFilters
            filters={filters}
            setFilters={setFilters}
            commitFiltersToUrl={commitFiltersToUrl}
            setSearchDebounced={setSearchDebounced}
            branches={branchOptions}
            warehouses={warehouses}
            categories={categories}
            brands={brands}
            users={users}
            onSavePreset={onSaveFilterPreset}
            onLoadPresets={onLoadPresets}
            onApplyPreset={onApplyPreset}
          />
          <Routes>
            <Route
              index
              element={
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="min-h-[320px] flex-1"
                >
                  {main()}
                </motion.div>
              }
            />
            <Route path=":reportCategory/:reportSlug" element={<ReportDetailPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
