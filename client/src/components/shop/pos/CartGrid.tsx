import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef, memo } from 'react';
import { usePOS } from '../../../context/POSContext';
import { ICONS, CURRENCY } from '../../../constants';
import type { CartGridHandle } from './usePosKeyboard';
import CachedImage from '../../ui/CachedImage';

const gridCols = 'minmax(0,1fr) minmax(70px,100px) minmax(100px,140px) minmax(80px,100px) 48px';

const CartRow = memo(
  ({
    item,
    idx,
    selected,
    onRemove,
    onUpdateQty,
  }: {
    item: {
      id: string;
      name: string;
      sku: string;
      imageUrl?: string;
      categoryId?: string;
      unitPrice: number;
      quantity: number;
      discountAmount: number;
      taxAmount: number;
    };
    idx: number;
    selected: boolean;
    onRemove: (id: string) => void;
    onUpdateQty: (id: string, q: number) => void;
  }) => (
    <div
      className={`group grid min-w-0 items-center gap-2 border-b border-gray-100 px-3 py-3 transition-colors dark:border-gray-800 md:gap-4 md:px-4 md:py-3.5 ${
        idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/80 dark:bg-gray-800/40'
      } ${selected ? 'ring-2 ring-inset ring-primary-500/50 dark:ring-primary-400/40' : ''}`}
      style={{ gridTemplateColumns: gridCols }}
      data-cart-line
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          <CachedImage
            path={item.imageUrl}
            alt={item.name}
            fallbackLabel={item.name}
            fallbackClassName="!p-0.5 !text-[8px] leading-tight"
            className="h-full w-full min-h-0 min-w-0 object-cover"
          />
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{item.name}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              #{item.sku.slice(-6)}
            </span>
          </div>
        </div>
      </div>

      <div className="text-center font-mono text-sm font-semibold tabular-nums text-primary-600 dark:text-primary-400">
        {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => onUpdateQty(item.id, Math.max(1, item.quantity - 1))}
            className="flex h-9 w-9 items-center justify-center bg-gray-100 text-gray-600 transition-colors active:scale-95 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 touch-manipulation"
            aria-label="Decrease quantity"
          >
            {React.cloneElement(ICONS.minus as React.ReactElement, { size: 14 })}
          </button>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Quantity for ${item.name}`}
            className="w-10 border-none bg-transparent p-0 text-center text-sm font-bold text-gray-900 focus:ring-0 dark:text-gray-100"
            value={item.quantity}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') return;
              const val = parseInt(raw, 10);
              if (!isNaN(val) && val >= 1) {
                onUpdateQty(item.id, Math.floor(val));
              }
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (isNaN(val) || val < 1) {
                onUpdateQty(item.id, 1);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                e.preventDefault();
              }
            }}
          />
          <button
            type="button"
            onClick={() => onUpdateQty(item.id, item.quantity + 1)}
            className="flex h-9 w-9 items-center justify-center bg-emerald-100 text-emerald-900 transition-colors active:scale-95 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-800/50 touch-manipulation"
            aria-label="Increase quantity"
          >
            {React.cloneElement(ICONS.plus as React.ReactElement, { size: 14 })}
          </button>
        </div>
      </div>

      <div className="text-right">
        <div className="font-mono text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {((item.unitPrice * item.quantity) - item.discountAmount + item.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="flex justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 touch-manipulation"
          aria-label="Remove line"
        >
          {React.cloneElement(ICONS.trash as React.ReactElement, { size: 16 })}
        </button>
      </div>
    </div>
  )
);

const CartGrid = forwardRef<CartGridHandle>(function CartGrid(_, ref) {
  const { cart, removeFromCart, updateCartItem, clearCart, grandTotal } = usePOS();
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (cart.length === 0) {
      setSelectedIdx(0);
    } else {
      setSelectedIdx((i) => Math.min(i, cart.length - 1));
    }
  }, [cart.length]);

  const focusCart = useCallback(() => {
    panelRef.current?.focus();
  }, []);

  const moveSelection = useCallback(
    (delta: 1 | -1) => {
      if (cart.length === 0) return;
      setSelectedIdx((i) => Math.max(0, Math.min(cart.length - 1, i + delta)));
    },
    [cart.length]
  );

  const adjustQty = useCallback(
    (delta: 1 | -1) => {
      if (cart.length === 0) return;
      const item = cart[selectedIdx];
      if (!item) return;
      const next = Math.max(1, item.quantity + delta);
      updateCartItem(item.id, { quantity: next });
    },
    [cart, selectedIdx, updateCartItem]
  );

  const removeSelected = useCallback(() => {
    if (cart.length === 0) return;
    const item = cart[selectedIdx];
    if (item) removeFromCart(item.id);
  }, [cart, selectedIdx, removeFromCart]);

  useImperativeHandle(
    ref,
    () => ({
      focusCart,
      moveSelection,
      adjustQty,
      removeSelected,
    }),
    [focusCart, moveSelection, adjustQty, removeSelected]
  );

  const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (cart.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [cart.length, moveSelection]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="z-20 flex shrink-0 items-center justify-between gap-3 bg-primary-600 px-4 py-3 text-white dark:bg-primary-700">
        <span className="text-xs font-bold uppercase tracking-wider md:text-sm">Current cart</span>
        <button
          type="button"
          onClick={() => clearCart()}
          disabled={cart.length === 0}
          className="rounded-lg border border-white/40 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
        >
          Clear all
        </button>
      </div>
      <div
        className="grid flex-shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400 md:gap-4 md:px-4"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="min-w-0">Item</div>
        <div className="text-center">Price</div>
        <div className="text-center">Qty</div>
        <div className="text-right">Total</div>
        <div />
      </div>

      <div
        ref={panelRef}
        id="pos-cart-panel"
        tabIndex={-1}
        className="pos-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
      >
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-20 text-gray-300 dark:text-gray-600">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 dark:bg-gray-800">
              {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 32 })}
            </div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cart is empty</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Scan or search to add items</p>
          </div>
        ) : (
          <div>
            {cart.map((item, idx) => (
              <CartRow
                key={item.id}
                item={item}
                idx={idx}
                selected={idx === selectedIdx}
                onRemove={removeFromCart}
                onUpdateQty={(id, q) => updateCartItem(id, { quantity: q })}
              />
            ))}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-primary-50/50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80">
          <div>
            <span className="mb-0.5 block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Summary</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {cart.length} lines · {totalQty} qty
            </span>
          </div>
          <div className="text-right">
            <span className="mb-0.5 block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Total</span>
            <span className="text-lg font-semibold tabular-nums text-primary-600 dark:text-primary-400">
              {CURRENCY}
              {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

export default CartGrid;
