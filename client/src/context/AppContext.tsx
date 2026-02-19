import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import { shopApi, ShopVendor } from '../services/shopApi';

function mapVendorToState(v: ShopVendor): Record<string, any> {
  return {
    id: v.id,
    name: v.name,
    companyName: v.company_name,
    contactNo: v.contact_no,
    email: v.email,
    address: v.address,
    description: v.description,
    is_active: v.is_active,
  };
}

interface AppState {
  contacts: any[];
  categories: any[];
  settings: Record<string, any>;
  vendors: any[];
}

type AppAction =
  | { type: 'SET_VENDORS'; payload: any[] }
  | { type: 'ADD_VENDOR'; payload: any }
  | { type: 'UPDATE_VENDOR'; payload: { id: string; [k: string]: any } }
  | { type: 'REMOVE_VENDOR'; payload: string };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VENDORS':
      return { ...state, vendors: action.payload };
    case 'ADD_VENDOR':
      return { ...state, vendors: [...state.vendors, action.payload] };
    case 'UPDATE_VENDOR': {
      const { id, ...updates } = action.payload;
      return {
        ...state,
        vendors: state.vendors.map((v: any) => (v.id === id ? { ...v, ...updates } : v)),
      };
    }
    case 'REMOVE_VENDOR':
      return { ...state, vendors: state.vendors.filter((v: any) => v.id !== action.payload) };
    default:
      return state;
  }
}

const initialState: AppState = {
  contacts: [],
  categories: [],
  settings: {},
  vendors: [],
};

interface AppContextValue {
  contacts: any[];
  categories: any[];
  settings: Record<string, any>;
  state: AppState;
  dispatch: (action: AppAction) => void;
  [key: string]: any;
}

const defaultValue: AppContextValue = {
  contacts: [],
  categories: [],
  settings: {},
  state: initialState,
  dispatch: () => {},
};

const AppContext = createContext<AppContextValue>(defaultValue);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await shopApi.getVendors();
        if (cancelled) return;
        const mapped = (Array.isArray(list) ? list : []).map((v: ShopVendor) => mapVendorToState(v));
        dispatch({ type: 'SET_VENDORS', payload: mapped });
      } catch {
        if (!cancelled) dispatch({ type: 'SET_VENDORS', payload: [] });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const value: AppContextValue = {
    ...defaultValue,
    state,
    dispatch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
