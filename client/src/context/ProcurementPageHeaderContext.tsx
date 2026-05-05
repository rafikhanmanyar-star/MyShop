import React, { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type ProcurementTabId = 'bills' | 'vendors' | 'reports';

export type ProcurementPageHeaderPayload = {
  activeTab: ProcurementTabId;
  setActiveTab: (t: ProcurementTabId) => void;
  tabs: { id: ProcurementTabId; label: string; icon: React.ReactElement }[];
};

type Ctx = {
  payload: ProcurementPageHeaderPayload | null;
  setPayload: (p: ProcurementPageHeaderPayload | null) => void;
};

const ProcurementPageHeaderContext = createContext<Ctx | null>(null);

export function ProcurementPageHeaderProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<ProcurementPageHeaderPayload | null>(null);
  const value = useMemo(() => ({ payload, setPayload }), [payload]);
  return (
    <ProcurementPageHeaderContext.Provider value={value}>{children}</ProcurementPageHeaderContext.Provider>
  );
}

export function useProcurementPageHeaderPayload(): ProcurementPageHeaderPayload | null {
  return useContext(ProcurementPageHeaderContext)?.payload ?? null;
}

/** Call from `ProcurementPage` to mount procurement chrome in `AppHeader`. */
export function useRegisterProcurementPageHeader(payload: ProcurementPageHeaderPayload | null) {
  const ctx = useContext(ProcurementPageHeaderContext);
  const setPayload = ctx?.setPayload;
  useLayoutEffect(() => {
    if (!setPayload) return;
    setPayload(payload);
    return () => setPayload(null);
  }, [setPayload, payload]);
}
