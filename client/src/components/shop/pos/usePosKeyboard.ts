import React, { useEffect, useCallback, RefObject } from 'react';
import { requestClearCart } from './posCartShortcuts';

function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable;
}

function isModalOpen(): boolean {
  return !!document.querySelector('[data-pos-modal="true"]');
}

export interface CartGridHandle {
  focusCart: () => void;
  moveSelection: (delta: 1 | -1) => void;
  adjustQty: (delta: 1 | -1) => void;
  removeSelected: () => void;
}

export interface CheckoutPanelHandle {
  tryComplete: () => void | Promise<void>;
  focusPayment: () => void;
  openDiscount: () => void;
  toggleDiscount: () => void;
  applyDiscountPercent: (pct: number) => void;
  selectPaymentMethod: (key: 'cash' | 'online' | 'khata') => void;
  setExactTender: () => void;
  openCustomer: () => void;
  focusCheckout: () => void;
}

export function usePosKeyboard(opts: {
  enabled: boolean;
  cartLength: number;
  modalsOpen?: boolean;
  cartRef: RefObject<CartGridHandle | null>;
  checkoutRef: RefObject<CheckoutPanelHandle | null>;
  clearCart: () => void;
  holdSale: (ref: string) => void;
  setIsHeldSalesModalOpen: (v: boolean) => void;
  setIsCustomerModalOpen: (v: boolean) => void;
  setIsSalesHistoryModalOpen: (v: boolean) => void;
  toggleFullScreen: () => void;
  setIsDenseMode: React.Dispatch<React.SetStateAction<boolean>>;
  isDenseMode: boolean;
}) {
  const {
    enabled,
    cartLength,
    modalsOpen = false,
    cartRef,
    checkoutRef,
    clearCart,
    holdSale,
    setIsHeldSalesModalOpen,
    setIsCustomerModalOpen,
    setIsSalesHistoryModalOpen,
    toggleFullScreen,
    setIsDenseMode,
    isDenseMode,
  } = opts;

  const focusSearch = useCallback(() => {
    document.getElementById('pos-product-search')?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement | null;
      const inSearch = target?.id === 'pos-product-search';
      const inTender = target?.id === 'tender-amount-input';
      const inCheckout =
        !!target?.closest('#pos-payment-panel') || !!target?.closest('#pos-checkout-panel');
      const modalBlocking = modalsOpen || isModalOpen();

      const blockFnKey = () => {
        if (/^F([1-9]|1[0-2])$/.test(e.key)) e.preventDefault();
      };

      if (modalBlocking) {
        if (e.key === 'Escape') return;
        if (/^F([1-9]|1[0-2])$/.test(e.key)) e.preventDefault();
        return;
      }

      // Ctrl+D — open discount panel
      if (e.ctrlKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        checkoutRef.current?.openDiscount();
        return;
      }

      // Ctrl+H — hold sale
      if (e.ctrlKey && !e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        if (cartLength > 0) holdSale(`Hold-${new Date().toLocaleTimeString()}`);
        return;
      }

      // Ctrl+Shift+C — clear cart (alternate)
      if (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        requestClearCart(clearCart, cartLength);
        return;
      }

      // Alt+D — dense mode toggle
      if (e.altKey && !e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setIsDenseMode(!isDenseMode);
        return;
      }

      // Ctrl+F — search focus
      if (e.ctrlKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        focusSearch();
        return;
      }

      const discountPanelOpen =
        document.getElementById('pos-checkout-panel')?.dataset.discountOpen === 'true';

      const paymentKeyMap: Record<string, 'cash' | 'online' | 'khata'> = {
        '1': 'cash',
        '2': 'online',
        '3': 'khata',
      };
      const paymentMethod = paymentKeyMap[e.key];

      // Payment method: Ctrl+1/2/3 anywhere (except search); 1/2/3 when checkout or tender is focused
      if (
        paymentMethod &&
        !inSearch &&
        cartLength > 0 &&
        !discountPanelOpen &&
        (!isEditableTarget(target) || inTender || inCheckout)
      ) {
        const useCtrl = e.ctrlKey && !e.altKey;
        const usePlain = !e.ctrlKey && !e.altKey && (inTender || inCheckout);
        if (useCtrl || usePlain) {
          e.preventDefault();
          checkoutRef.current?.selectPaymentMethod(paymentMethod);
          return;
        }
      }

      if ((inTender || inCheckout) && (e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        checkoutRef.current?.setExactTender();
        return;
      }

      switch (e.key) {
        case 'F1':
          blockFnKey();
          focusSearch();
          break;
        case 'F2':
          blockFnKey();
          cartRef.current?.focusCart();
          break;
        case 'F3':
          blockFnKey();
          checkoutRef.current?.focusPayment();
          break;
        case 'F4':
          blockFnKey();
          setIsHeldSalesModalOpen(true);
          break;
        case 'F5':
          blockFnKey();
          checkoutRef.current?.toggleDiscount();
          break;
        case 'F6':
        case 'F8':
          blockFnKey();
          checkoutRef.current?.openCustomer();
          setIsCustomerModalOpen(true);
          break;
        case 'F7':
          blockFnKey();
          toggleFullScreen();
          break;
        case 'F9':
          blockFnKey();
          setIsSalesHistoryModalOpen(true);
          break;
        case 'F10':
          blockFnKey();
          checkoutRef.current?.focusCheckout();
          break;
        case 'F11':
          blockFnKey();
          requestClearCart(clearCart, cartLength);
          break;
        case 'F12':
          blockFnKey();
          if (cartLength > 0) {
            void checkoutRef.current?.tryComplete();
          } else {
            checkoutRef.current?.focusPayment();
          }
          break;
        case 'Enter': {
          if (inSearch) return;
          if (isEditableTarget(target) && !inTender) return;
          e.preventDefault();
          if (cartLength === 0) return;
          void checkoutRef.current?.tryComplete();
          break;
        }
        case 'Escape':
          setIsCustomerModalOpen(false);
          setIsHeldSalesModalOpen(false);
          setIsSalesHistoryModalOpen(false);
          if (target?.id === 'pos-product-search') return;
          if (isEditableTarget(target)) {
            (target as HTMLElement).blur();
            return;
          }
          focusSearch();
          break;
        case '+':
        case '=': {
          if (inSearch || inTender) return;
          if (!cartRef.current || cartLength === 0) return;
          e.preventDefault();
          cartRef.current.adjustQty(1);
          break;
        }
        case '-':
        case '_': {
          if (inSearch || inTender) return;
          if (!cartRef.current || cartLength === 0) return;
          e.preventDefault();
          cartRef.current.adjustQty(-1);
          break;
        }
        case 'Delete': {
          if (inSearch || inTender) return;
          if (!cartRef.current || cartLength === 0) return;
          e.preventDefault();
          cartRef.current.removeSelected();
          break;
        }
        case 'ArrowDown':
        case 'ArrowUp': {
          if (inSearch || inTender || isEditableTarget(target)) return;
          const cartEl = document.getElementById('pos-cart-panel');
          if (cartEl && (document.activeElement === cartEl || cartEl.contains(document.activeElement))) {
            return;
          }
          if (cartLength === 0) return;
          e.preventDefault();
          cartRef.current?.focusCart();
          cartRef.current?.moveSelection(e.key === 'ArrowDown' ? 1 : -1);
          break;
        }
        default:
          if (!isEditableTarget(target)) blockFnKey();
          break;
      }
    },
    [
      enabled,
      cartLength,
      modalsOpen,
      cartRef,
      checkoutRef,
      clearCart,
      holdSale,
      setIsHeldSalesModalOpen,
      setIsCustomerModalOpen,
      setIsSalesHistoryModalOpen,
      toggleFullScreen,
      setIsDenseMode,
      isDenseMode,
      focusSearch,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}
