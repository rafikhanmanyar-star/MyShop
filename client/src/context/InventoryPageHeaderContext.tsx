import React, { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type InventoryTabId = 'dashboard' | 'stock' | 'movements' | 'adjustments' | 'categories' | 'incomplete';

export type InventoryPageHeaderPayload = {
    activeTab: InventoryTabId;
    setActiveTab: (t: InventoryTabId) => void;
    onNewSku: () => void;
    tabs: { id: InventoryTabId; label: string; icon: React.ReactElement }[];
};

type Ctx = {
    payload: InventoryPageHeaderPayload | null;
    setPayload: (p: InventoryPageHeaderPayload | null) => void;
};

const InventoryPageHeaderContext = createContext<Ctx | null>(null);

export function InventoryPageHeaderProvider({ children }: { children: ReactNode }) {
    const [payload, setPayload] = useState<InventoryPageHeaderPayload | null>(null);
    const value = useMemo(() => ({ payload, setPayload }), [payload]);
    return (
        <InventoryPageHeaderContext.Provider value={value}>{children}</InventoryPageHeaderContext.Provider>
    );
}

export function useInventoryPageHeaderPayload(): InventoryPageHeaderPayload | null {
    return useContext(InventoryPageHeaderContext)?.payload ?? null;
}

/** Call from `InventoryContent` to mount the inventory chrome in `AppHeader`. */
export function useRegisterInventoryPageHeader(payload: InventoryPageHeaderPayload | null) {
    const ctx = useContext(InventoryPageHeaderContext);
    const setPayload = ctx?.setPayload;
    useLayoutEffect(() => {
        if (!setPayload) return;
        setPayload(payload);
        return () => setPayload(null);
    }, [setPayload, payload]);
}
