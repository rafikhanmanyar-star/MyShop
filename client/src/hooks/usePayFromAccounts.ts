import { useCallback, useEffect, useState } from 'react';
import { accountingApi } from '../services/shopApi';
import { shopApi } from '../services/shopApi';
import {
  filterPayFromChartAccounts,
  pickDefaultPayFromAccountId,
  type PayFromAccountOption,
} from '../utils/payFromAccounts';

export function usePayFromAccounts() {
  const [payFromAccounts, setPayFromAccounts] = useState<PayFromAccountOption[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [coa, banks] = await Promise.all([
        accountingApi.getAccounts().catch(() => []),
        shopApi.getBankAccounts(true).catch(() => []),
      ]);
      const linkedChartIds = (Array.isArray(banks) ? banks : [])
        .map((b) => b.chart_account_id ?? b.chartAccountId)
        .filter((id): id is string => Boolean(id));
      const list = filterPayFromChartAccounts(Array.isArray(coa) ? coa : [], linkedChartIds);
      setPayFromAccounts(list);
      return list;
    } catch {
      setPayFromAccounts([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    payFromAccounts,
    loading,
    reload: load,
    pickDefaultId: () => pickDefaultPayFromAccountId(payFromAccounts),
  };
}
