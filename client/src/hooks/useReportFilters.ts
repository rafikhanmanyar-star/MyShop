import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DatePreset, ReportCategoryId, ReportFilterState } from '../types/reports';
import { defaultReportFilters, isReportCategoryId } from '../types/reports';
import { computePresetRange } from '../utils/reportDateRange';

export { formatYmd, startOfWeekMonday, computePresetRange } from '../utils/reportDateRange';

function isCategory(s: string | null): s is ReportCategoryId {
  return s !== null && isReportCategoryId(s);
}

export function useReportFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<ReportFilterState>(() => defaultReportFilters());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const category = useMemo<ReportCategoryId>(() => {
    const c = searchParams.get('cat');
    return isCategory(c) ? c : 'executive';
  }, [searchParams]);

  const syncFromUrl = useCallback(() => {
    const next = defaultReportFilters();
    const preset = searchParams.get('preset') as DatePreset | null;
    if (preset && ['today', 'yesterday', 'this_week', 'this_month', 'custom'].includes(preset)) {
      next.datePreset = preset;
    }
    next.dateFrom = searchParams.get('from') || '';
    next.dateTo = searchParams.get('to') || '';
    next.branchId = searchParams.get('branch') || '';
    next.warehouseId = searchParams.get('wh') || '';
    next.customerId = searchParams.get('cust') || '';
    next.supplierId = searchParams.get('supp') || '';
    next.categoryId = searchParams.get('pcat') || '';
    next.brandId = searchParams.get('brand') || '';
    next.productId = searchParams.get('prod') || '';
    next.userId = searchParams.get('usr') || '';
    next.paymentMethod = searchParams.get('pay') || '';
    next.status = searchParams.get('st') || '';
    next.projectId = searchParams.get('proj') || '';
    next.unitId = searchParams.get('unit') || '';
    next.brokerId = searchParams.get('brk') || '';
    next.ownerId = searchParams.get('own') || '';
    next.search = searchParams.get('q') || '';
    setFilters(next);
  }, [searchParams]);

  useEffect(() => {
    syncFromUrl();
  }, [syncFromUrl]);

  const setCategory = useCallback(
    (cat: ReportCategoryId) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set('cat', cat);
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const commitFiltersToUrl = useCallback(
    (full: ReportFilterState) => {
      setFilters(full);
      setSearchParams(
        () => {
          const n = new URLSearchParams();
          n.set('cat', category);
          n.set('preset', full.datePreset);
          if (full.datePreset === 'custom') {
            if (full.dateFrom) n.set('from', full.dateFrom);
            if (full.dateTo) n.set('to', full.dateTo);
          }
          const setIf = (key: string, val: string) => {
            if (val) n.set(key, val);
          };
          setIf('branch', full.branchId);
          setIf('wh', full.warehouseId);
          setIf('cust', full.customerId);
          setIf('supp', full.supplierId);
          setIf('pcat', full.categoryId);
          setIf('brand', full.brandId);
          setIf('prod', full.productId);
          setIf('usr', full.userId);
          setIf('pay', full.paymentMethod);
          setIf('st', full.status);
          setIf('proj', full.projectId);
          setIf('unit', full.unitId);
          setIf('brk', full.brokerId);
          setIf('own', full.ownerId);
          setIf('q', full.search);
          return n;
        },
        { replace: true }
      );
    },
    [category, setSearchParams]
  );

  const setSearchDebounced = useCallback(
    (q: string) => {
      setFilters((prev) => ({ ...prev, search: q }));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearchParams(
          (prev) => {
            const n = new URLSearchParams(prev);
            if (!q) n.delete('q');
            else n.set('q', q);
            return n;
          },
          { replace: true }
        );
      }, 350);
    },
    [setSearchParams]
  );

  const range = useMemo(
    () => computePresetRange(filters.datePreset, filters.dateFrom, filters.dateTo),
    [filters.datePreset, filters.dateFrom, filters.dateTo]
  );

  return {
    category,
    setCategory,
    filters,
    setFilters,
    commitFiltersToUrl,
    setSearchDebounced,
    range,
  };
}
