import type { InventoryItem } from '../../types/inventory';

export type CartLine = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountAmount: number;
  taxAmount: number;
  imageUrl?: string;
  stockLevel: number;
};

export type PosCustomer = { id: string; name: string; phone?: string };

export type PaymentMethodUi = 'cash' | 'bank' | 'wallet';

export type PosState = {
  cartItems: CartLine[];
  discountPercent: number;
  customer: PosCustomer | null;
  paymentMethod: PaymentMethodUi;
  receivedAmount: string;
  searchQuery: string;
  categoryId: string | 'all';
  selectedLineId: string | null;
};

export type PosAction =
  | { type: 'ADD_ITEM'; item: InventoryItem; branchStock: number; defaultTaxPercent: number }
  | { type: 'REMOVE_ITEM'; lineId: string }
  | { type: 'UPDATE_QTY'; lineId: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'APPLY_DISCOUNT'; percent: number }
  | { type: 'SET_CUSTOMER'; customer: PosCustomer | null }
  | { type: 'SET_PAYMENT_METHOD'; method: PaymentMethodUi }
  | { type: 'SET_RECEIVED'; amount: string }
  | { type: 'SET_SEARCH'; q: string }
  | { type: 'SET_CATEGORY'; id: string | 'all' }
  | { type: 'SELECT_LINE'; lineId: string | null }
  | { type: 'ADJUST_SELECTED_QTY'; delta: number };

export function recalcCartLines(lines: CartLine[], globalDiscountPercent: number): CartLine[] {
  return lines.map((line) => {
    const base = line.unitPrice * line.quantity;
    const disc = globalDiscountPercent > 0 ? base * (globalDiscountPercent / 100) : 0;
    const taxable = Math.max(0, base - disc);
    const tax = taxable * (line.taxRate / 100);
    return { ...line, discountAmount: disc, taxAmount: tax };
  });
}

export const initialPosState: PosState = {
  cartItems: [],
  discountPercent: 0,
  customer: null,
  paymentMethod: 'cash',
  receivedAmount: '0',
  searchQuery: '',
  categoryId: 'all',
  selectedLineId: null,
};

export function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.q };
    case 'SET_CATEGORY':
      return { ...state, categoryId: action.id };
    case 'SET_CUSTOMER':
      return { ...state, customer: action.customer };
    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.method };
    case 'SET_RECEIVED':
      return { ...state, receivedAmount: action.amount };
    case 'APPLY_DISCOUNT': {
      const p = Math.min(100, Math.max(0, action.percent));
      return {
        ...state,
        discountPercent: p,
        cartItems: recalcCartLines(state.cartItems, p),
      };
    }
    case 'SELECT_LINE':
      return { ...state, selectedLineId: action.lineId };
    case 'CLEAR_CART':
      return {
        ...initialPosState,
        searchQuery: state.searchQuery,
        categoryId: state.categoryId,
      };
    case 'REMOVE_ITEM': {
      const cartItems = state.cartItems.filter((l) => l.id !== action.lineId);
      const selectedLineId =
        state.selectedLineId === action.lineId ? cartItems[cartItems.length - 1]?.id ?? null : state.selectedLineId;
      return {
        ...state,
        cartItems: recalcCartLines(cartItems, state.discountPercent),
        selectedLineId,
      };
    }
    case 'UPDATE_QTY': {
      const cartItems = state.cartItems.map((line) => {
        if (line.id !== action.lineId) return line;
        const maxQ = line.stockLevel ?? 999999;
        const want = Math.max(1, Math.floor(action.quantity));
        const safe = Math.min(want, maxQ);
        if (want > maxQ) {
          setTimeout(() => alert(`Only ${maxQ} available in stock.`), 0);
        }
        return { ...line, quantity: safe };
      });
      return {
        ...state,
        cartItems: recalcCartLines(cartItems, state.discountPercent),
      };
    }
    case 'ADJUST_SELECTED_QTY': {
      const id = state.selectedLineId ?? state.cartItems[state.cartItems.length - 1]?.id;
      if (!id) return state;
      const line = state.cartItems.find((l) => l.id === id);
      if (!line) return state;
      return posReducer(state, { type: 'UPDATE_QTY', lineId: id, quantity: line.quantity + action.delta });
    }
    case 'ADD_ITEM': {
      const { item, branchStock, defaultTaxPercent } = action;
      if (branchStock <= 0) {
        setTimeout(() => alert('This product is out of stock.'), 0);
        return state;
      }
      const taxRate = defaultTaxPercent;
      const unitPrice = Number(item.retailPrice) || 0;
      const existing = state.cartItems.find((l) => l.productId === item.id);
      if (existing) {
        const cartItems = state.cartItems.map((line) => {
          if (line.productId !== item.id) return line;
          const nextQty = Math.min(line.quantity + 1, branchStock);
          if (line.quantity + 1 > branchStock) {
            setTimeout(() => alert(`Only ${branchStock} available.`), 0);
          }
          return {
            ...line,
            quantity: nextQty,
            stockLevel: branchStock,
            unitPrice,
            taxRate,
          };
        });
        return {
          ...state,
          cartItems: recalcCartLines(cartItems, state.discountPercent),
          selectedLineId: existing.id,
        };
      }
      const id = crypto.randomUUID();
      const newLine: CartLine = {
        id,
        productId: item.id,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: 1,
        unitPrice,
        taxRate,
        discountAmount: 0,
        taxAmount: 0,
        imageUrl: item.imageUrl,
        stockLevel: branchStock,
      };
      return {
        ...state,
        cartItems: recalcCartLines([...state.cartItems, newLine], state.discountPercent),
        selectedLineId: id,
      };
    }
    default:
      return state;
  }
}
