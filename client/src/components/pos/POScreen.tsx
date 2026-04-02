import React, { useReducer, useMemo, useDeferredValue, useEffect, useCallback, useRef, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useShifts } from '../../context/ShiftsContext';
import { useBranch } from '../../context/BranchContext';
import { shopApi, ShopBankAccount } from '../../services/shopApi';
import { createBarcodeScanner } from '../../services/barcode/barcodeScanner';
import type { InventoryItem } from '../../types/inventory';
import { posReducer, initialPosState } from './posReducer';
import POSLayout from './POSLayout';
import ProductPanel from './ProductPanel';
import CartPanel from './CartPanel';
import PaymentPanel from './PaymentPanel';

const DEFAULT_TAX = 10;

function playBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close().catch(() => {});
    }, 70);
  } catch {
    /* ignore */
  }
}

function pickBank(accounts: ShopBankAccount[], method: 'cash' | 'bank' | 'wallet'): ShopBankAccount | undefined {
  const cash = accounts.find((a) => a.account_type === 'Cash' || a.name.toLowerCase().includes('cash'));
  const nonCash = accounts.filter((a) => a !== cash);
  if (method === 'cash') return cash ?? accounts[0];
  if (method === 'bank') return nonCash[0] ?? accounts[0];
  return nonCash[1] ?? nonCash[0] ?? accounts[0];
}

export default function POScreen() {
  const [state, dispatch] = useReducer(posReducer, initialPosState);
  const { items, refreshItems } = useInventory();
  const { user } = useAuth();
  const { currentShift } = useShifts();
  const { selectedBranchId } = useBranch();
  const searchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const [touchMode, setTouchMode] = useState(() => {
    try {
      return localStorage.getItem('pos-touch-mode') === '1';
    } catch {
      return false;
    }
  });
  const [flashLineId, setFlashLineId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const prevCartLen = useRef(0);

  const deferredSearch = useDeferredValue(state.searchQuery);

  useEffect(() => {
    shopApi
      .getTerminals()
      .then((list: { id: string }[]) => {
        if (Array.isArray(list) && list[0]?.id) setTerminalId(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('pos-touch-mode', touchMode ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [touchMode]);

  const branchStock = useCallback(
    (item: InventoryItem) => {
      if (selectedBranchId && item.warehouseStock && item.warehouseStock[selectedBranchId] != null) {
        return Number(item.warehouseStock[selectedBranchId]) || 0;
      }
      return Number(item.onHand) || 0;
    },
    [selectedBranchId]
  );

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items || []) {
      if (i.category) s.add(i.category);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredProducts = useMemo(() => {
    let list = items || [];
    if (state.categoryId !== 'all') {
      list = list.filter((i) => i.category === state.categoryId);
    }
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.barcode && i.barcode.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, state.categoryId, deferredSearch]);

  const totals = useMemo(() => {
    const subtotal = state.cartItems.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const discountTotal = state.cartItems.reduce((s, l) => s + l.discountAmount, 0);
    const taxTotal = state.cartItems.reduce((s, l) => s + l.taxAmount, 0);
    const grandTotal = state.cartItems.reduce((s, l) => s + (l.unitPrice * l.quantity - l.discountAmount + l.taxAmount), 0);
    return { subtotal, discountTotal, taxTotal, grandTotal };
  }, [state.cartItems]);

  useEffect(() => {
    dispatch({ type: 'SET_RECEIVED', amount: totals.grandTotal.toFixed(2) });
  }, [totals.grandTotal]);

  const onAddProduct = useCallback(
    (item: InventoryItem) => {
      const stock = branchStock(item);
      dispatch({ type: 'ADD_ITEM', item, branchStock: stock, defaultTaxPercent: DEFAULT_TAX });
      playBeep();
      requestAnimationFrame(() => searchRef.current?.focus());
    },
    [branchStock]
  );

  useEffect(() => {
    const len = state.cartItems.length;
    const last = state.cartItems[len - 1];
    if (len > prevCartLen.current && last) {
      setFlashLineId(last.id);
      const t = window.setTimeout(() => setFlashLineId(null), 450);
      prevCartLen.current = len;
      return () => clearTimeout(t);
    }
    prevCartLen.current = len;
  }, [state.cartItems]);

  useEffect(() => {
    const scanner = createBarcodeScanner((code) => {
      if (typeof code === 'string' && code.trim()) {
        dispatch({ type: 'SET_SEARCH', q: code.trim() });
      }
    });
    scanner.start();
    return () => scanner.stop();
  }, []);

  useEffect(() => {
    const q = state.searchQuery.trim();
    if (q.length < 4 || !/^\d+$/.test(q)) return;
    const match = (items || []).find((i) => i.barcode === q);
    if (!match) return;
    const t = window.setTimeout(() => {
      onAddProduct(match);
      dispatch({ type: 'SET_SEARCH', q: '' });
    }, 200);
    return () => clearTimeout(t);
  }, [state.searchQuery, items, onAddProduct]);

  const completeSale = useCallback(async () => {
    if (state.cartItems.length === 0) return;
    const grandTotal = totals.grandTotal;
    const paid = parseFloat(state.receivedAmount) || 0;
    if (paid < grandTotal) {
      alert('Amount received is less than total.');
      return;
    }
    setSubmitError(null);
    setCompleting(true);
    try {
      const banks = await shopApi.getBankAccounts(true);
      const list = Array.isArray(banks) ? banks : [];
      const bank = pickBank(list, state.paymentMethod);
      const saleNumber = `SALE-${Date.now()}`;
      const changeDue = Math.max(0, paid - grandTotal);
      const paymentDetails = [
        {
          id: crypto.randomUUID(),
          method: state.paymentMethod === 'cash' ? 'Cash' : 'Online',
          amount: paid,
          bankAccountId: bank?.id,
          bankAccountName: bank?.name,
        },
      ];
      const saleData = {
        branchId: selectedBranchId ?? undefined,
        terminalId: terminalId ?? undefined,
        userId: user?.id ?? undefined,
        shiftId: currentShift?.id ?? undefined,
        customerId: state.customer?.id,
        loyaltyMemberId: null,
        saleNumber,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        discountTotal: totals.discountTotal,
        grandTotal,
        totalPaid: paid,
        changeDue,
        paymentMethod: paymentDetails[0]?.method || 'Cash',
        paymentDetails,
        items: state.cartItems.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxAmount: item.taxAmount,
          discountAmount: item.discountAmount,
          subtotal: item.unitPrice * item.quantity - item.discountAmount + item.taxAmount,
        })),
        createdAt: new Date().toISOString(),
      };
      const saleResponse = (await shopApi.createSale(saleData)) as { id?: string };
      const saleId = saleResponse?.id;
      dispatch({ type: 'CLEAR_CART' });
      await refreshItems().catch(() => {});
      window.dispatchEvent(new CustomEvent('shop:realtime', { detail: { type: 'sale_created', saleId } }));
      const toast = document.createElement('div');
      toast.className =
        'fixed bottom-4 right-4 z-[10000] rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-xl';
      toast.textContent = 'Sale completed.';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sale failed';
      setSubmitError(msg);
    } finally {
      setCompleting(false);
    }
  }, [
    state.cartItems,
    state.receivedAmount,
    state.paymentMethod,
    state.customer,
    totals,
    selectedBranchId,
    terminalId,
    user?.id,
    currentShift?.id,
    refreshItems,
  ]);

  const changeDue = Math.max(0, (parseFloat(state.receivedAmount) || 0) - totals.grandTotal);

  const canComplete = state.cartItems.length > 0 && (parseFloat(state.receivedAmount) || 0) >= totals.grandTotal && !completing;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const tag = t?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const id = t?.id;

      if (e.key === 'F1') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        discountRef.current?.focus();
        return;
      }
      if (e.key === 'Escape' && !editable) {
        e.preventDefault();
        dispatch({ type: 'CLEAR_CART' });
        return;
      }
      if (e.key === 'Enter') {
        if (id === 'pos-search-input') return;
        if (editable && id !== 'pos-payment-received') return;
        e.preventDefault();
        if (canComplete) void completeSale();
        return;
      }
      if ((e.key === '+' || e.key === '=') && !editable) {
        e.preventDefault();
        dispatch({ type: 'ADJUST_SELECTED_QTY', delta: 1 });
        return;
      }
      if (e.key === '-' && !editable) {
        e.preventDefault();
        dispatch({ type: 'ADJUST_SELECTED_QTY', delta: -1 });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [canComplete, completeSale]);

  const holdSale = useCallback(() => {
    if (state.cartItems.length === 0) return;
    try {
      sessionStorage.setItem(`pos-hold-${Date.now()}`, JSON.stringify({ cart: state.cartItems, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
    dispatch({ type: 'CLEAR_CART' });
  }, [state.cartItems]);

  return (
    <POSLayout
      topSearch={
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={searchRef}
            id="pos-search-input"
            type="text"
            className="min-w-[200px] flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-600 dark:bg-gray-800"
            placeholder="Search name, SKU, barcode… (F1)"
            value={state.searchQuery}
            onChange={(e) => dispatch({ type: 'SET_SEARCH', q: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setTouchMode((v) => !v)}
            className="rounded-lg border border-gray-200 px-3 py-3 text-xs font-semibold dark:border-gray-600 touch-manipulation"
          >
            {touchMode ? 'Touch mode' : 'Compact'}
          </button>
        </div>
      }
      left={
        <ProductPanel
          items={filteredProducts}
          categories={categories}
          categoryId={state.categoryId}
          onCategory={(id) => dispatch({ type: 'SET_CATEGORY', id })}
          touchMode={touchMode}
          onAdd={onAddProduct}
        />
      }
      center={
        <CartPanel
          lines={state.cartItems}
          flashLineId={flashLineId}
          selectedLineId={state.selectedLineId}
          subtotal={totals.subtotal}
          taxTotal={totals.taxTotal}
          grandTotal={totals.grandTotal}
          discountPercent={state.discountPercent}
          onQty={(lineId, q) => dispatch({ type: 'UPDATE_QTY', lineId, quantity: q })}
          onRemove={(lineId) => dispatch({ type: 'REMOVE_ITEM', lineId })}
          onSelectLine={(lineId) => dispatch({ type: 'SELECT_LINE', lineId })}
          onDiscountChange={(pct) => dispatch({ type: 'APPLY_DISCOUNT', percent: pct })}
          discountInputRef={discountRef}
        />
      }
      right={
        <PaymentPanel
          customer={state.customer}
          onCustomer={(c) => dispatch({ type: 'SET_CUSTOMER', customer: c })}
          paymentMethod={state.paymentMethod}
          onPaymentMethod={(m) => dispatch({ type: 'SET_PAYMENT_METHOD', method: m })}
          receivedAmount={state.receivedAmount}
          onReceivedChange={(v) => dispatch({ type: 'SET_RECEIVED', amount: v })}
          grandTotal={totals.grandTotal}
          changeDue={changeDue}
          onComplete={() => void completeSale()}
          onHold={holdSale}
          onClear={() => dispatch({ type: 'CLEAR_CART' })}
          completing={completing}
          error={submitError}
          onRetry={() => setSubmitError(null)}
          canComplete={canComplete}
        />
      }
    />
  );
}
