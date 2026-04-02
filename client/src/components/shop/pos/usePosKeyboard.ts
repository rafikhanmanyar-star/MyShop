import React, { useEffect, useCallback, RefObject } from 'react';

function isEditableTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return t.isContentEditable;
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
}

export function usePosKeyboard(opts: {
  enabled: boolean;
  cartLength: number;
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

      const blockFnKey = () => {
        if (/^F([1-9]|1[0-2])$/.test(e.key)) e.preventDefault();
      };

      // Ctrl+D — global discount (5% step: open panel + apply 5, or cycle — keep simple: open discount UI)
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        checkoutRef.current?.openDiscount();
        return;
      }

      // Ctrl+H — hold sale
      if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        if (cartLength > 0) holdSale(`Hold-${new Date().toLocaleTimeString()}`);
        return;
      }

      // Alt+D — dense mode toggle (legacy)
      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        setIsDenseMode(!isDenseMode);
        return;
      }

      // Ctrl+F — search focus (legacy)
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        focusSearch();
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
        case 'F6':
          blockFnKey();
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
        case 'F12':
          blockFnKey();
          if (cartLength > 0) checkoutRef.current?.focusPayment();
          break;
        case 'Enter': {
          // Let product search handle Enter when typing / navigating grid
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
          if (isEditableTarget(target)) return;
          if (cartLength > 0) clearCart();
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
        default:
          if (!isEditableTarget(target)) blockFnKey();
          break;
      }
    },
    [
      enabled,
      cartLength,
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
