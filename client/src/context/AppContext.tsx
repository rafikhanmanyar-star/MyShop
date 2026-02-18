import React, { createContext, useContext, type ReactNode } from 'react';

interface AppContextValue {
  contacts: any[];
  categories: any[];
  settings: Record<string, any>;
  state: Record<string, any>;
  dispatch: (action: any) => void;
  [key: string]: any;
}

const defaultValue: AppContextValue = {
  contacts: [], categories: [], settings: {},
  state: { contacts: [], categories: [], settings: {} },
  dispatch: () => {},
};

const AppContext = createContext<AppContextValue>(defaultValue);

export function AppProvider({ children }: { children: ReactNode }) {
  return <AppContext.Provider value={defaultValue}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
