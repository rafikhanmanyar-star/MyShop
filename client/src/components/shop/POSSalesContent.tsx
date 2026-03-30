import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import POSHeader from './pos/POSHeader';
import ProductSearch from './pos/ProductSearch';
import CartGrid from './pos/CartGrid';
import CheckoutPanel from './pos/CheckoutPanel';
import ShortcutBar from './pos/ShortcutBar';
import HeldSalesModal from './pos/HeldSalesModal';
import CustomerSelectionModal from './pos/CustomerSelectionModal';
import SalesHistoryModal from './pos/SalesHistoryModal';
import { useAppContext } from '../../context/AppContext';
import { POSColumnResizeHandle } from './pos/POSColumnResizeHandle';
import './pos/POSStyles.css';

const STORAGE_POS_LEFT_W = 'pos-layout-left-w-px';
const STORAGE_POS_RIGHT_W = 'pos-layout-right-w-px';

const MIN_LEFT_W = 220;
const MAX_LEFT_W = 520;
const MIN_RIGHT_W = 180;
const MAX_RIGHT_W = 400;
/** Default: slightly narrower than before so the bill / product grid column gains space. */
const DEFAULT_LEFT_W = 280;
/** Default: narrower checkout / cart sidebar (was ~320px fixed). */
const DEFAULT_RIGHT_W = 260;

function loadStoredWidth(key: string, fallback: number, min: number, max: number): number {
    try {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    } catch {
        return fallback;
    }
}

const POSSalesContent: React.FC = () => {
    const { state } = useAppContext();
    const {
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        holdSale,
        clearCart,
        completeSale,
        balanceDue,
        cart,
        isDenseMode,
        setIsDenseMode
    } = usePOS();
    const mainRef = useRef<HTMLDivElement>(null);

    const [leftColWidthPx, setLeftColWidthPx] = useState(() =>
        loadStoredWidth(STORAGE_POS_LEFT_W, DEFAULT_LEFT_W, MIN_LEFT_W, MAX_LEFT_W)
    );
    const [rightColWidthPx, setRightColWidthPx] = useState(() =>
        loadStoredWidth(STORAGE_POS_RIGHT_W, DEFAULT_RIGHT_W, MIN_RIGHT_W, MAX_RIGHT_W)
    );

    const persistLeft = useCallback((w: number) => {
        const clamped = Math.min(MAX_LEFT_W, Math.max(MIN_LEFT_W, Math.round(w)));
        setLeftColWidthPx(clamped);
        try {
            localStorage.setItem(STORAGE_POS_LEFT_W, String(clamped));
        } catch {
            /* ignore */
        }
    }, []);

    const persistRight = useCallback((w: number) => {
        const clamped = Math.min(MAX_RIGHT_W, Math.max(MIN_RIGHT_W, Math.round(w)));
        setRightColWidthPx(clamped);
        try {
            localStorage.setItem(STORAGE_POS_RIGHT_W, String(clamped));
        } catch {
            /* ignore */
        }
    }, []);

    const startResizeLeft = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = leftColWidthPx;
            const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                persistLeft(startW + dx);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [leftColWidthPx, persistLeft]
    );

    const startResizeRight = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = rightColWidthPx;
            const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX;
                persistRight(startW + dx);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [rightColWidthPx, persistRight]
    );

    const isActive = (state as any).currentPage === 'posSales' || true; // Fallback to true if not managed by AppContext

    const [isFullScreen, setIsFullScreen] = useState(false);

    const setFullScreenEnabled = useCallback((enabled: boolean) => {
        setIsFullScreen(enabled);
        window.dispatchEvent(new CustomEvent('pos:fullscreen', { detail: { enabled } }));
    }, []);

    const toggleFullScreen = useCallback(() => {
        setFullScreenEnabled(!isFullScreen);
    }, [isFullScreen, setFullScreenEnabled]);

    // If we leave the POS page while full screen is enabled, always restore normal layout
    useEffect(() => {
        if (!isActive && isFullScreen) {
            setFullScreenEnabled(false);
        }
    }, [isActive, isFullScreen, setFullScreenEnabled]);

    // Global keyboard shortcuts (capture). F-keys are handled for POS; do not blanket-preventDefault
    // on every key so we do not interfere with normal typing or IME.
    useEffect(() => {
        const isEditableTarget = (t: EventTarget | null) => {
            if (!t || !(t instanceof HTMLElement)) return false;
            const tag = t.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            return t.isContentEditable;
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;

            const inEditable = isEditableTarget(e.target);

            const blockFnKey = () => {
                if (/^F([1-9]|1[0-2])$/.test(e.key)) e.preventDefault();
            };

            switch (e.key) {
                case 'F1':
                    blockFnKey();
                    clearCart();
                    break;
                case 'F2':
                    blockFnKey();
                    holdSale(`Hold-${new Date().toLocaleTimeString()}`);
                    break;
                case 'F3':
                    blockFnKey();
                    setIsHeldSalesModalOpen(!isHeldSalesModalOpen);
                    break;
                case 'F4': {
                    blockFnKey();
                    const searchInput = document.getElementById('pos-product-search');
                    if (searchInput) searchInput.focus();
                    break;
                }
                case 'F6':
                    blockFnKey();
                    setIsCustomerModalOpen(!isCustomerModalOpen);
                    break;
                case 'F9':
                    blockFnKey();
                    setIsSalesHistoryModalOpen(!isSalesHistoryModalOpen);
                    break;
                case 'F7':
                    blockFnKey();
                    toggleFullScreen();
                    break;
                case 'F12':
                    blockFnKey();
                    if (cart.length > 0) {
                        const tenderInput = document.getElementById('tender-amount-input');
                        if (tenderInput) tenderInput.focus();
                    }
                    break;
                case 'd':
                    if (e.altKey) {
                        e.preventDefault();
                        setIsDenseMode(!isDenseMode);
                    }
                    break;
                case 'f':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        const searchInput = document.getElementById('pos-product-search');
                        if (searchInput) searchInput.focus();
                    }
                    break;
                case 'Escape':
                    setIsCustomerModalOpen(false);
                    setIsHeldSalesModalOpen(false);
                    setIsSalesHistoryModalOpen(false);
                    break;
                default:
                    if (!inEditable) blockFnKey();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [
        isActive,
        clearCart,
        holdSale,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        balanceDue,
        completeSale,
        toggleFullScreen,
        isDenseMode,
        setIsDenseMode
    ]);

    return (
        <div
            className={`flex flex-col bg-[#f7f9fc] dark:bg-[#020617] overflow-hidden pos-font select-none animate-fade-in relative ${isFullScreen ? 'fixed inset-0 z-[9999] h-screen w-screen' : 'h-full min-h-0 w-full'}`}
            ref={mainRef}
            style={isFullScreen ? { height: '100vh', width: '100vw' } : { minHeight: 0, flex: 1 } as React.CSSProperties}
        >
            {/* Background Decorative Elements - Subtle */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-white dark:from-slate-900 to-transparent opacity-50"></div>
            </div>

            {/* Top Status Bar */}
            <POSHeader />

            <div className="flex flex-1 min-h-0 w-full min-w-0 relative p-4 md:p-6 gap-0 z-10 overflow-hidden">
                {/* Left: category tree + product grid */}
                <div
                    className="flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-[#e2e8f0] dark:border-slate-700 shadow-sm overflow-hidden z-20 min-w-0 flex-shrink-0"
                    style={{ width: leftColWidthPx, minWidth: MIN_LEFT_W, maxWidth: MAX_LEFT_W }}
                >
                    <ProductSearch />
                </div>

                <POSColumnResizeHandle
                    aria-label="Resize catalog and bill columns"
                    onMouseDown={startResizeLeft}
                />

                {/* Center: line items (bill grid) — grows with remaining space */}
                <div className="flex-1 flex flex-col min-w-[200px] bg-white dark:bg-slate-900 rounded-3xl border border-[#e2e8f0] dark:border-slate-700 shadow-sm overflow-hidden min-h-0">
                    <CartGrid />
                </div>

                <POSColumnResizeHandle
                    aria-label="Resize bill and checkout columns"
                    onMouseDown={startResizeRight}
                />

                {/* Right: customer, totals, payment */}
                <div
                    className="flex flex-col flex-shrink-0 bg-white dark:bg-slate-900 rounded-3xl border border-[#e2e8f0] dark:border-slate-700 shadow-sm overflow-hidden z-20 min-h-0"
                    style={{ width: rightColWidthPx, minWidth: MIN_RIGHT_W, maxWidth: MAX_RIGHT_W }}
                >
                    <CheckoutPanel />
                </div>
            </div>

            {/* Bottom Bar: Action Shortcuts */}
            <div className="z-30 relative flex-shrink-0">
                <ShortcutBar isFullScreen={isFullScreen} onToggleFullScreen={toggleFullScreen} />
            </div>

            {/* Modals */}
            <HeldSalesModal />
            <CustomerSelectionModal
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
            />
            <SalesHistoryModal />
        </div>
    );
};

export default POSSalesContent;
