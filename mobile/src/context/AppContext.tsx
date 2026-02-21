import React, { createContext, useContext, useReducer, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────
export interface CartItem {
    productId: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    image_url?: string;
    available_stock: number;
    tax_rate: number;
}

export interface ShopInfo {
    name: string;
    company_name: string;
    logo_url: string | null;
    brand_color: string;
    slug: string;
}

export interface ShopSettings {
    minimum_order_amount: number;
    delivery_fee: number;
    free_delivery_above: number | null;
    estimated_delivery_minutes: number;
    order_acceptance_start: string;
    order_acceptance_end: string;
}

interface AppState {
    shopSlug: string | null;
    shop: ShopInfo | null;
    settings: ShopSettings | null;
    cart: CartItem[];
    isLoggedIn: boolean;
    customerId: string | null;
    customerPhone: string | null;
    toast: string | null;
}

type Action =
    | { type: 'SET_SHOP'; slug: string; shop: ShopInfo; settings: ShopSettings }
    | { type: 'ADD_TO_CART'; item: CartItem }
    | { type: 'UPDATE_QTY'; productId: string; quantity: number }
    | { type: 'REMOVE_FROM_CART'; productId: string }
    | { type: 'CLEAR_CART' }
    | { type: 'LOGIN'; customerId: string; phone: string; token: string }
    | { type: 'LOGOUT' }
    | { type: 'SHOW_TOAST'; message: string }
    | { type: 'HIDE_TOAST' };

const CART_KEY = 'myshop_cart';
const AUTH_KEY = 'mobile_token';
const CUSTOMER_KEY = 'mobile_customer';

function loadCart(): CartItem[] {
    try {
        const data = localStorage.getItem(CART_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveCart(cart: CartItem[]) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadAuth(): { isLoggedIn: boolean; customerId: string | null; phone: string | null } {
    const token = localStorage.getItem(AUTH_KEY);
    const customer = localStorage.getItem(CUSTOMER_KEY);
    if (token && customer) {
        try {
            const c = JSON.parse(customer);
            return { isLoggedIn: true, customerId: c.id, phone: c.phone };
        } catch { /* fall through */ }
    }
    return { isLoggedIn: false, customerId: null, phone: null };
}

const initialAuth = loadAuth();

const initialState: AppState = {
    shopSlug: null,
    shop: null,
    settings: null,
    cart: loadCart(),
    isLoggedIn: initialAuth.isLoggedIn,
    customerId: initialAuth.customerId,
    customerPhone: initialAuth.phone,
    toast: null,
};

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_SHOP':
            return { ...state, shopSlug: action.slug, shop: action.shop, settings: action.settings };

        case 'ADD_TO_CART': {
            const existing = state.cart.find(i => i.productId === action.item.productId);
            let newCart: CartItem[];
            if (existing) {
                newCart = state.cart.map(i =>
                    i.productId === action.item.productId
                        ? { ...i, quantity: i.quantity + action.item.quantity }
                        : i
                );
            } else {
                newCart = [...state.cart, action.item];
            }
            saveCart(newCart);
            return { ...state, cart: newCart };
        }

        case 'UPDATE_QTY': {
            const newCart = state.cart.map(i =>
                i.productId === action.productId ? { ...i, quantity: action.quantity } : i
            ).filter(i => i.quantity > 0);
            saveCart(newCart);
            return { ...state, cart: newCart };
        }

        case 'REMOVE_FROM_CART': {
            const newCart = state.cart.filter(i => i.productId !== action.productId);
            saveCart(newCart);
            return { ...state, cart: newCart };
        }

        case 'CLEAR_CART':
            saveCart([]);
            return { ...state, cart: [] };

        case 'LOGIN':
            localStorage.setItem(AUTH_KEY, action.token);
            localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ id: action.customerId, phone: action.phone }));
            return { ...state, isLoggedIn: true, customerId: action.customerId, customerPhone: action.phone };

        case 'LOGOUT':
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(CUSTOMER_KEY);
            return { ...state, isLoggedIn: false, customerId: null, customerPhone: null };

        case 'SHOW_TOAST':
            return { ...state, toast: action.message };

        case 'HIDE_TOAST':
            return { ...state, toast: null };

        default:
            return state;
    }
}

// ─── Context ──────────────────────────────────────────────
interface AppContextType {
    state: AppState;
    dispatch: React.Dispatch<Action>;
    cartTotal: number;
    cartCount: number;
    showToast: (message: string) => void;
}

const AppContext = createContext<AppContextType>(null!);

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const cartTotal = state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const cartCount = state.cart.reduce((sum, i) => sum + i.quantity, 0);

    const showToast = useCallback((message: string) => {
        dispatch({ type: 'SHOW_TOAST', message });
        setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
    }, []);

    return (
        <AppContext.Provider value={{ state, dispatch, cartTotal, cartCount, showToast }}>
            {children}
            {state.toast && <div className="toast">{state.toast}</div>}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}
