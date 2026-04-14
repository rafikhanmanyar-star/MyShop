import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { customerApi } from '../api';

// ─── Types ─────────────────────────────────────────────────
// Shop and branch are the same entity in the mobile app: one shop (tenant) = one default branch for orders.
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

/** One promotional bundle line (server recalculates on checkout). */
export interface OfferCartItem {
    offerId: string;
    title: string;
    quantity: number;
    merchandisePerBundle: number;
    taxPerBundle: number;
    productIds: string[];
    discountBadge: string;
}

export interface ShopInfo {
    name: string;
    company_name: string;
    logo_url: string | null;
    brand_color: string;
    slug: string;
    address?: string | null;
    phone?: string | null;
    branchId?: string | null;
    branchName?: string | null;
}

export interface TenantBranding {
    logo_url: string | null;
    logo_dark_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    font_family: string;
    theme_mode: string;
    address?: string | null;
}

export interface ShopSettings {
    minimum_order_amount: number;
    delivery_fee: number;
    free_delivery_above: number | null;
    estimated_delivery_minutes: number;
    order_acceptance_start: string;
    order_acceptance_end: string;
    offer_stacking_mode?: 'best' | 'stack';
}

interface AppState {
    shopSlug: string | null;
    shop: ShopInfo | null;
    branchId: string | null;
    settings: ShopSettings | null;
    branding: TenantBranding | null;
    cart: CartItem[];
    offerBundles: OfferCartItem[];
    isLoggedIn: boolean;
    customerId: string | null;
    customerPhone: string | null;
    customerName: string | null;
    toast: string | null;
    loyalty: LoyaltyState;
}

type Action =
    | { type: 'SET_SHOP'; slug: string; shop: ShopInfo; settings: ShopSettings; branding: TenantBranding }
    | { type: 'ADD_TO_CART'; item: CartItem }
    | { type: 'UPDATE_QTY'; productId: string; quantity: number }
    | { type: 'REMOVE_FROM_CART'; productId: string }
    | { type: 'CLEAR_CART' }
    | { type: 'ADD_OFFER_BUNDLE'; item: OfferCartItem }
    | { type: 'UPDATE_OFFER_QTY'; offerId: string; quantity: number }
    | { type: 'REMOVE_OFFER_BUNDLE'; offerId: string }
    | { type: 'LOGIN'; customerId: string; phone: string; name: string | null; token: string }
    | { type: 'LOGOUT' }
    | { type: 'UPDATE_CUSTOMER_PROFILE'; name: string | null }
    | { type: 'SHOW_TOAST'; message: string }
    | { type: 'HIDE_TOAST' }
    | {
          type: 'SET_LOYALTY';
          totalPoints: number;
          pointsValue: number;
          lastUpdated: string | null;
          redemptionRatio: number;
      }
    | { type: 'LOYALTY_FETCH_FAILED' }
    | { type: 'CLEAR_LOYALTY' };

const CART_KEY = 'myshop_cart';
const OFFER_CART_KEY = 'myshop_offer_bundles';
const AUTH_KEY = 'mobile_token';
const CUSTOMER_KEY = 'mobile_customer';
const LAST_SHOP_SLUG_KEY = 'myshop_last_shop_slug';
const LOYALTY_SESSION_KEY = 'myshop_loyalty_session';

export interface LoyaltyState {
    totalPoints: number | null;
    pointsValue: number | null;
    lastUpdated: string | null;
    redemptionRatio: number | null;
    /** Last request failed; UI may still show cached totals */
    fetchFailed: boolean;
}

const emptyLoyalty: LoyaltyState = {
    totalPoints: null,
    pointsValue: null,
    lastUpdated: null,
    redemptionRatio: null,
    fetchFailed: false,
};

function readLoyaltySession(customerId: string | null): LoyaltyState | null {
    if (!customerId || typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(LOYALTY_SESSION_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw) as Record<string, unknown>;
        if (o.customerId !== customerId) return null;
        return {
            totalPoints: typeof o.totalPoints === 'number' ? o.totalPoints : null,
            pointsValue: typeof o.pointsValue === 'number' ? o.pointsValue : null,
            lastUpdated: typeof o.lastUpdated === 'string' ? o.lastUpdated : null,
            redemptionRatio: typeof o.redemptionRatio === 'number' ? o.redemptionRatio : null,
            fetchFailed: false,
        };
    } catch {
        return null;
    }
}

function writeLoyaltySession(customerId: string, loyalty: LoyaltyState) {
    try {
        sessionStorage.setItem(
            LOYALTY_SESSION_KEY,
            JSON.stringify({
                customerId,
                totalPoints: loyalty.totalPoints,
                pointsValue: loyalty.pointsValue,
                lastUpdated: loyalty.lastUpdated,
                redemptionRatio: loyalty.redemptionRatio,
            })
        );
    } catch {
        /* ignore */
    }
}

/** Coerce API/pg values (DECIMAL often arrives as string) so totals use numeric + not string concat. */
function toFiniteNumber(value: unknown, fallback = 0): number {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const n = parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : fallback;
}

function normalizeShopSettings(raw: ShopSettings): ShopSettings {
    const free = raw.free_delivery_above;
    return {
        ...raw,
        minimum_order_amount: toFiniteNumber(raw.minimum_order_amount),
        delivery_fee: toFiniteNumber(raw.delivery_fee),
        free_delivery_above:
            free === null || free === undefined ? null : toFiniteNumber(free),
        estimated_delivery_minutes: Math.round(toFiniteNumber(raw.estimated_delivery_minutes, 60)),
    };
}

function loadCart(): CartItem[] {
    try {
        const data = localStorage.getItem(CART_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveCart(cart: CartItem[]) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function loadOfferCart(): OfferCartItem[] {
    try {
        const data = localStorage.getItem(OFFER_CART_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
}

function saveOfferCart(items: OfferCartItem[]) {
    localStorage.setItem(OFFER_CART_KEY, JSON.stringify(items));
}

function loadAuth(): { isLoggedIn: boolean; customerId: string | null; phone: string | null; name: string | null } {
    const token = localStorage.getItem(AUTH_KEY);
    const customer = localStorage.getItem(CUSTOMER_KEY);
    if (token && customer) {
        try {
            const c = JSON.parse(customer);
            return { isLoggedIn: true, customerId: c.id, phone: c.phone, name: c.name || null };
        } catch { /* fall through */ }
    }
    return { isLoggedIn: false, customerId: null, phone: null, name: null };
}

const initialAuth = loadAuth();
const initialLoyalty = readLoyaltySession(initialAuth.customerId) ?? emptyLoyalty;

const initialState: AppState = {
    shopSlug: null,
    shop: null,
    branchId: null,
    settings: null,
    branding: null,
    cart: loadCart(),
    offerBundles: loadOfferCart(),
    isLoggedIn: initialAuth.isLoggedIn,
    customerId: initialAuth.customerId,
    customerPhone: initialAuth.phone,
    customerName: initialAuth.name,
    toast: null,
    loyalty: initialLoyalty,
};

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_SHOP': {
            try {
                localStorage.setItem(LAST_SHOP_SLUG_KEY, action.slug);
            } catch { /* ignore */ }
            const prevSlug = state.shopSlug;
            const shopChanged = prevSlug != null && prevSlug !== action.slug;
            if (shopChanged) {
                saveCart([]);
                saveOfferCart([]);
            }
            return {
                ...state,
                shopSlug: action.slug,
                shop: action.shop,
                branchId: action.shop?.branchId ?? null,
                settings: action.settings ? normalizeShopSettings(action.settings) : null,
                branding: action.branding,
                cart: shopChanged ? [] : state.cart,
                offerBundles: shopChanged ? [] : state.offerBundles,
            };
        }

        case 'ADD_TO_CART': {
            const pid = action.item.productId;
            const newOffers = state.offerBundles.filter(o => !o.productIds.includes(pid));
            const existing = state.cart.find(i => i.productId === pid);
            let newCart: CartItem[];
            if (existing) {
                newCart = state.cart.map(i =>
                    i.productId === pid
                        ? { ...i, quantity: i.quantity + action.item.quantity }
                        : i
                );
            } else {
                newCart = [...state.cart, action.item];
            }
            saveCart(newCart);
            saveOfferCart(newOffers);
            return { ...state, cart: newCart, offerBundles: newOffers };
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
            saveOfferCart([]);
            return { ...state, cart: [], offerBundles: [] };

        case 'ADD_OFFER_BUNDLE': {
            const pids = new Set(action.item.productIds);
            const newCart = state.cart.filter(i => !pids.has(i.productId));
            const mode = state.settings?.offer_stacking_mode ?? 'best';
            let newOffers: OfferCartItem[];
            if (mode === 'best') {
                const same = state.offerBundles.find(o => o.offerId === action.item.offerId);
                if (same) {
                    newOffers = [{ ...same, quantity: same.quantity + action.item.quantity }];
                } else {
                    newOffers = [action.item];
                }
            } else {
                const existing = state.offerBundles.find(o => o.offerId === action.item.offerId);
                if (existing) {
                    newOffers = state.offerBundles.map(o =>
                        o.offerId === action.item.offerId
                            ? { ...o, quantity: o.quantity + action.item.quantity }
                            : o
                    );
                } else {
                    newOffers = [...state.offerBundles, action.item];
                }
            }
            saveCart(newCart);
            saveOfferCart(newOffers);
            return { ...state, cart: newCart, offerBundles: newOffers };
        }

        case 'UPDATE_OFFER_QTY': {
            const newOffers = state.offerBundles
                .map(o => (o.offerId === action.offerId ? { ...o, quantity: action.quantity } : o))
                .filter(o => o.quantity > 0);
            saveOfferCart(newOffers);
            return { ...state, offerBundles: newOffers };
        }

        case 'REMOVE_OFFER_BUNDLE': {
            const newOffers = state.offerBundles.filter(o => o.offerId !== action.offerId);
            saveOfferCart(newOffers);
            return { ...state, offerBundles: newOffers };
        }

        case 'LOGIN':
            localStorage.setItem(AUTH_KEY, action.token);
            localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ id: action.customerId, phone: action.phone, name: action.name }));
            {
                const cached = readLoyaltySession(action.customerId);
                return {
                    ...state,
                    isLoggedIn: true,
                    customerId: action.customerId,
                    customerPhone: action.phone,
                    customerName: action.name,
                    loyalty: cached ?? emptyLoyalty,
                };
            }

        case 'LOGOUT':
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(CUSTOMER_KEY);
            try {
                sessionStorage.removeItem(LOYALTY_SESSION_KEY);
            } catch {
                /* ignore */
            }
            return {
                ...state,
                isLoggedIn: false,
                customerId: null,
                customerPhone: null,
                customerName: null,
                loyalty: emptyLoyalty,
            };

        case 'UPDATE_CUSTOMER_PROFILE': {
            const customer = localStorage.getItem(CUSTOMER_KEY);
            if (customer) {
                try {
                    const c = JSON.parse(customer);
                    const updated = { ...c, name: action.name };
                    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(updated));
                } catch { /* ignore */ }
            }
            return { ...state, customerName: action.name };
        }

        case 'SHOW_TOAST':
            return { ...state, toast: action.message };

        case 'HIDE_TOAST':
            return { ...state, toast: null };

        case 'SET_LOYALTY':
            return {
                ...state,
                loyalty: {
                    totalPoints: action.totalPoints,
                    pointsValue: action.pointsValue,
                    lastUpdated: action.lastUpdated,
                    redemptionRatio: action.redemptionRatio,
                    fetchFailed: false,
                },
            };

        case 'LOYALTY_FETCH_FAILED':
            return {
                ...state,
                loyalty: { ...state.loyalty, fetchFailed: true },
            };

        case 'CLEAR_LOYALTY':
            try {
                sessionStorage.removeItem(LOYALTY_SESSION_KEY);
            } catch {
                /* ignore */
            }
            return { ...state, loyalty: emptyLoyalty };

        default:
            return state;
    }
}

// ─── Context ──────────────────────────────────────────────
interface AppContextType {
    state: AppState;
    dispatch: React.Dispatch<Action>;
    cartTotal: number;
    cartTax: number;
    cartCount: number;
    showToast: (message: string) => void;
    /** Fetches loyalty from API; throttled unless force */
    refreshLoyalty: (opts?: { force?: boolean }) => Promise<void>;
}

const AppContext = createContext<AppContextType>(null!);

const LOYALTY_MIN_FETCH_GAP_MS = 10_000;

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const lastLoyaltyFetchAt = useRef(0);
    const loyaltyFetchInFlight = useRef(false);

    const refreshLoyalty = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!state.isLoggedIn || !state.customerId) return;
            if (loyaltyFetchInFlight.current) return;
            const now = Date.now();
            if (!opts?.force && now - lastLoyaltyFetchAt.current < LOYALTY_MIN_FETCH_GAP_MS) {
                return;
            }
            const customerId = state.customerId;
            loyaltyFetchInFlight.current = true;
            try {
                const data = (await customerApi.getLoyaltyPoints()) as {
                    total_points: number;
                    points_value?: number;
                    last_updated?: string | null;
                    redemption_ratio?: number;
                };
                const total = Math.max(0, Math.floor(Number(data.total_points) || 0));
                const ratio = typeof data.redemption_ratio === 'number' && Number.isFinite(data.redemption_ratio)
                    ? data.redemption_ratio
                    : 0.01;
                const pVal =
                    data.points_value != null && Number.isFinite(Number(data.points_value))
                        ? Math.round(Number(data.points_value) * 100) / 100
                        : Math.round(total * ratio * 100) / 100;
                const loyaltySlice: LoyaltyState = {
                    totalPoints: total,
                    pointsValue: pVal,
                    lastUpdated: data.last_updated ?? null,
                    redemptionRatio: ratio,
                    fetchFailed: false,
                };
                dispatch({
                    type: 'SET_LOYALTY',
                    totalPoints: total,
                    pointsValue: pVal,
                    lastUpdated: data.last_updated ?? null,
                    redemptionRatio: ratio,
                });
                writeLoyaltySession(customerId, loyaltySlice);
                lastLoyaltyFetchAt.current = Date.now();
            } catch {
                dispatch({ type: 'LOYALTY_FETCH_FAILED' });
            } finally {
                loyaltyFetchInFlight.current = false;
            }
        },
        [state.isLoggedIn, state.customerId]
    );

    const cartMerch =
        state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0) +
        state.offerBundles.reduce((sum, o) => sum + o.merchandisePerBundle * o.quantity, 0);

    const cartTax =
        state.cart.reduce((sum, i) => sum + i.price * i.quantity * (i.tax_rate / 100), 0) +
        state.offerBundles.reduce((sum, o) => sum + o.taxPerBundle * o.quantity, 0);

    const cartTotal = Math.round(cartMerch * 100) / 100;
    const cartTaxRounded = Math.round(cartTax * 100) / 100;

    const cartCount =
        state.cart.reduce((sum, i) => sum + i.quantity, 0) +
        state.offerBundles.reduce((sum, o) => sum + o.quantity, 0);

    const showToast = useCallback((message: string) => {
        dispatch({ type: 'SHOW_TOAST', message });
        setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
    }, []);

    return (
        <AppContext.Provider
            value={{ state, dispatch, cartTotal, cartTax: cartTaxRounded, cartCount, showToast, refreshLoyalty }}
        >
            {children}
            {state.toast && <div className="toast">{state.toast}</div>}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}
