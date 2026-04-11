import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePOS } from '../../context/POSContext';
import POSHeader from './pos/POSHeader';
import ProductSearch, {
    POS_CATEGORY_TREE_VISIBLE_KEY,
    POS_CATEGORY_TREE_W_KEY,
    POS_CATEGORY_TREE_MIN_W,
    POS_CATEGORY_TREE_MAX_W,
    POS_CATEGORY_TREE_DEFAULT_W
} from './pos/ProductSearch';
import CartGrid from './pos/CartGrid';
import CheckoutPanel from './pos/CheckoutPanel';
import ShortcutBar from './pos/ShortcutBar';
import { usePosKeyboard } from './pos/usePosKeyboard';
import type { CartGridHandle, CheckoutPanelHandle } from './pos/usePosKeyboard';
import HeldSalesModal from './pos/HeldSalesModal';
import CustomerSelectionModal from './pos/CustomerSelectionModal';
import SalesHistoryModal from './pos/SalesHistoryModal';
import { useAppContext } from '../../context/AppContext';
import { POSColumnResizeHandle } from './pos/POSColumnResizeHandle';
import './pos/POSStyles.css';

const STORAGE_POS_LEFT_W = 'pos-layout-left-w-px';
const STORAGE_POS_RIGHT_W = 'pos-layout-right-w-px';

const MIN_LEFT_W = 220;
/** Wide enough for catalog + category tree + product grid without capping typical tree widths. */
const MAX_LEFT_W = 680;
const MIN_RIGHT_W = 180;
const MAX_RIGHT_W = 400;
/** Default: slightly narrower than before so the bill / product grid column gains space. */
const DEFAULT_LEFT_W = 280;
/** Default: narrower checkout / cart sidebar (was ~320px fixed). */
const DEFAULT_RIGHT_W = 260;

/** Two vertical resize handles between the three columns (see POSColumnResizeHandle). */
const HANDLES_TOTAL_PX = 12;
/** Minimum width reserved for the center (line items) column before we stack or clamp sides. */
const CENTER_MIN_PX = 100;
/**
 * When the POS content row is narrower than this (e.g. sidebar open + small window),
 * stack catalog / cart / checkout vertically so nothing is clipped off-screen.
 */
const STACK_LAYOUT_BELOW_PX = 960;

/** Matches `POSColumnResizeHandle` (`w-1.5`) between category list and product grid. */
const CATEGORY_INNER_HANDLE_PX = 6;
/** Narrow strip (`w-9`) shown when categories are collapsed; disappears when the tree opens. */
const CATEGORY_COLLAPSED_STRIP_PX = 36;

function loadCategoryTreeOpenFromStorage(): boolean {
    try {
        const v = localStorage.getItem(POS_CATEGORY_TREE_VISIBLE_KEY);
        if (v === null) return false;
        return v === 'true';
    } catch {
        return false;
    }
}

function clampSideWidths(rowWidth: number, left: number, right: number): { left: number; right: number } {
    const budget = rowWidth - HANDLES_TOTAL_PX - CENTER_MIN_PX;
    if (budget <= MIN_LEFT_W + MIN_RIGHT_W) {
        return { left: MIN_LEFT_W, right: MIN_RIGHT_W };
    }
    if (left + right <= budget) return { left, right };
    const excess = left + right - budget;
    const canL = Math.max(0, left - MIN_LEFT_W);
    const canR = Math.max(0, right - MIN_RIGHT_W);
    const canTotal = canL + canR;
    if (canTotal <= 0) return { left: MIN_LEFT_W, right: MIN_RIGHT_W };
    const fromL = Math.min(canL, excess * (canL / canTotal));
    const fromR = excess - fromL;
    return {
        left: Math.round(Math.max(MIN_LEFT_W, left - fromL)),
        right: Math.round(Math.max(MIN_RIGHT_W, right - fromR))
    };
}

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
    const location = useLocation();
    const navigate = useNavigate();
    const {
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        setSearchQuery,
        holdSale,
        clearCart,
        cart,
        isDenseMode,
        setIsDenseMode
    } = usePOS();
    const cartRef = useRef<CartGridHandle | null>(null);
    const checkoutRef = useRef<CheckoutPanelHandle | null>(null);
    const mainRef = useRef<HTMLDivElement>(null);
    const layoutRowRef = useRef<HTMLDivElement>(null);
    const [layoutRowWidth, setLayoutRowWidth] = useState(0);
    const [categoryTreeOpen, setCategoryTreeOpen] = useState(loadCategoryTreeOpenFromStorage);
    const [categoryTreeWidthPx, setCategoryTreeWidthPx] = useState(() =>
        loadStoredWidth(
            POS_CATEGORY_TREE_W_KEY,
            POS_CATEGORY_TREE_DEFAULT_W,
            POS_CATEGORY_TREE_MIN_W,
            POS_CATEGORY_TREE_MAX_W
        )
    );

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

    useEffect(() => {
        const row = layoutRowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width;
            if (typeof w === 'number' && Number.isFinite(w)) setLayoutRowWidth(w);
        });
        ro.observe(row);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const onCategoryTreeVisibility = (e: Event) => {
            const ce = e as CustomEvent<{ visible?: boolean; treeWidthPx?: number }>;
            if (typeof ce.detail?.visible === 'boolean') setCategoryTreeOpen(ce.detail.visible);
            if (typeof ce.detail?.treeWidthPx === 'number' && Number.isFinite(ce.detail.treeWidthPx)) {
                setCategoryTreeWidthPx(
                    Math.min(
                        POS_CATEGORY_TREE_MAX_W,
                        Math.max(POS_CATEGORY_TREE_MIN_W, Math.round(ce.detail.treeWidthPx))
                    )
                );
            }
        };
        window.addEventListener('pos:category-tree-visibility', onCategoryTreeVisibility);
        return () => window.removeEventListener('pos:category-tree-visibility', onCategoryTreeVisibility);
    }, []);

    /** Open Sales Archive on a specific receipt (e.g. from Khata ledger). */
    useEffect(() => {
        const st = location.state as { openSaleInvoice?: string } | null | undefined;
        const inv = st?.openSaleInvoice?.trim();
        if (!inv) return;
        setSearchQuery(inv);
        setIsSalesHistoryModalOpen(true);
        navigate(location.pathname, { replace: true, state: null });
    }, [location.state, location.pathname, navigate, setSearchQuery, setIsSalesHistoryModalOpen]);

    const useStackedLayout = layoutRowWidth > 0 && layoutRowWidth < STACK_LAYOUT_BELOW_PX;

    const { displayLeftW, displayRightW } = useMemo(() => {
        if (useStackedLayout || layoutRowWidth === 0) {
            return { displayLeftW: leftColWidthPx, displayRightW: rightColWidthPx };
        }
        // Category tree + inner handle replace the collapsed strip; add (tree + handle − strip) to the
        // catalog column so product grid width stays ~unchanged while the cart (flex center) narrows.
        const catalogExtraPx = categoryTreeOpen
            ? Math.max(
                  0,
                  categoryTreeWidthPx + CATEGORY_INNER_HANDLE_PX - CATEGORY_COLLAPSED_STRIP_PX
              )
            : 0;
        const boostedLeft = Math.min(MAX_LEFT_W, leftColWidthPx + catalogExtraPx);
        const { left, right } = clampSideWidths(layoutRowWidth, boostedLeft, rightColWidthPx);
        return { displayLeftW: left, displayRightW: right };
    }, [
        useStackedLayout,
        layoutRowWidth,
        leftColWidthPx,
        rightColWidthPx,
        categoryTreeOpen,
        categoryTreeWidthPx
    ]);

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

    usePosKeyboard({
        enabled: isActive,
        cartLength: cart.length,
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
    });

    return (
        <div
            className={`pos-page-root flex flex-col overflow-hidden pos-font select-none animate-fade-in relative bg-[var(--pos-bg)] dark:bg-[#020617] ${isFullScreen ? 'fixed inset-0 z-[9999] h-screen w-screen' : 'h-full min-h-0 w-full'}`}
            ref={mainRef}
            style={isFullScreen ? { height: '100vh', width: '100vw' } : { minHeight: 0, flex: 1 } as React.CSSProperties}
        >
            <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(255,255,255,0.9),transparent)] dark:opacity-30" aria-hidden />

            {/* Top Status Bar */}
            <POSHeader />

            <div
                ref={layoutRowRef}
                className={`relative z-10 flex min-h-0 w-full min-w-0 flex-1 gap-4 p-4 ${
                    useStackedLayout
                        ? 'flex-col overflow-y-auto overflow-x-hidden'
                        : 'flex-row overflow-x-auto overflow-y-hidden'
                }`}
            >
                {/* Left: category tree + product grid */}
                <div
                    className={`flex flex-col rounded-[var(--pos-radius)] border border-[var(--pos-border)] bg-[var(--pos-card-bg)] shadow-[var(--pos-shadow)] overflow-hidden z-20 min-w-0 ${
                        useStackedLayout ? 'w-full min-h-[min(40vh,420px)] flex-1 shrink-0' : 'flex-shrink-0'
                    }`}
                    style={
                        useStackedLayout
                            ? { minWidth: 0, maxWidth: 'none' }
                            : { width: displayLeftW, minWidth: MIN_LEFT_W, maxWidth: MAX_LEFT_W }
                    }
                >
                    <ProductSearch />
                </div>

                {!useStackedLayout && (
                    <POSColumnResizeHandle
                        aria-label="Resize catalog and bill columns"
                        onMouseDown={startResizeLeft}
                    />
                )}

                {/* Center: line items (bill grid) — grows with remaining space */}
                <div
                    className={`flex-1 flex flex-col rounded-[var(--pos-radius)] border border-[var(--pos-border)] bg-[var(--pos-card-bg)] shadow-[var(--pos-shadow)] overflow-hidden min-h-0 min-w-0 ${
                        useStackedLayout ? 'min-h-[min(32vh,360px)] shrink-0' : 'min-w-[120px]'
                    }`}
                >
                    <CartGrid ref={cartRef} />
                </div>

                {!useStackedLayout && (
                    <POSColumnResizeHandle
                        aria-label="Resize bill and checkout columns"
                        onMouseDown={startResizeRight}
                    />
                )}

                {/* Right: customer, totals, payment */}
                <div
                    className={`flex flex-col rounded-[var(--pos-radius)] border border-[var(--pos-border)] bg-[var(--pos-card-bg)] shadow-[var(--pos-shadow)] overflow-hidden z-20 min-h-0 min-w-0 ${
                        useStackedLayout ? 'w-full shrink-0 max-w-full' : 'flex-shrink-0'
                    }`}
                    style={
                        useStackedLayout
                            ? { minWidth: 0, maxWidth: 'none' }
                            : { width: displayRightW, minWidth: MIN_RIGHT_W, maxWidth: MAX_RIGHT_W }
                    }
                >
                    <CheckoutPanel ref={checkoutRef} />
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
