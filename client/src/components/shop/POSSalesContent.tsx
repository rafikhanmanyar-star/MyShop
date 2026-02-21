import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import POSHeader from './pos/POSHeader';
import ProductSearch from './pos/ProductSearch';
import CartGrid from './pos/CartGrid';
import CheckoutPanel from './pos/CheckoutPanel';
import ShortcutBar from './pos/ShortcutBar';
import PaymentModal from './pos/PaymentModal';
import HeldSalesModal from './pos/HeldSalesModal';
import CustomerSelectionModal from './pos/CustomerSelectionModal';
import SalesHistoryModal from './pos/SalesHistoryModal';
import { useAppContext } from '../../context/AppContext';
import './pos/POSStyles.css';

const POSSalesContent: React.FC = () => {
    const { state } = useAppContext();
    const {
        isPaymentModalOpen,
        setIsPaymentModalOpen,
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
        cart
    } = usePOS();
    const mainRef = useRef<HTMLDivElement>(null);

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

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;

            // Prevent default for F-keys and others we use
            if (e.key.startsWith('F')) {
                e.preventDefault();
            }

            switch (e.key) {
                case 'F1': clearCart(); break;
                case 'F2': holdSale(`Hold-${new Date().toLocaleTimeString()}`); break;
                case 'F3': setIsHeldSalesModalOpen(!isHeldSalesModalOpen); break;
                case 'F4': { // Search focus is handled by ProductSearch autoFocus or ref
                    const searchInput = document.getElementById('pos-product-search');
                    if (searchInput) searchInput.focus();
                    break;
                }
                case 'F6': setIsCustomerModalOpen(!isCustomerModalOpen); break;
                case 'F9': setIsSalesHistoryModalOpen(!isSalesHistoryModalOpen); break;
                case 'F7': toggleFullScreen(); break;
                case 'F8': setIsPaymentModalOpen(!isPaymentModalOpen); break;
                case 'F12':
                    if (balanceDue <= 0 && cart.length > 0) {
                        completeSale();
                    } else if (cart.length > 0) {
                        setIsPaymentModalOpen(true);
                    }
                    break;
                case 'Escape':
                    setIsPaymentModalOpen(false);
                    setIsCustomerModalOpen(false);
                    setIsHeldSalesModalOpen(false);
                    setIsSalesHistoryModalOpen(false);
                    break;
                // Add more as needed
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        balanceDue,
        completeSale,
        toggleFullScreen
    ]);

    return (
        <div
            className="flex flex-col h-full bg-[#f7f9fc] -m-8 overflow-hidden pos-font select-none animate-fade-in relative"
            ref={mainRef}
            style={{
                maxHeight: 'calc(100vh - 4rem)'
            }}
        >
            {/* Background Decorative Elements - Subtle */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-white to-transparent opacity-50"></div>
            </div>

            {/* Top Status Bar */}
            <POSHeader />

            <div className="flex flex-1 min-h-0 relative p-6 gap-6 z-10">
                {/* Left Panel: Search & Products */}
                <div className="w-[32%] flex flex-col bg-white rounded-3xl border border-[#e2e8f0] shadow-sm overflow-hidden z-20">
                    <ProductSearch />
                </div>

                {/* Center & Right Panel Container */}
                <div className="flex-1 flex gap-6 min-w-0">
                    {/* Center Panel: Cart / Bill Grid */}
                    <div className="flex-1 flex flex-col bg-white rounded-3xl border border-[#e2e8f0] shadow-sm overflow-hidden">
                        <CartGrid />
                    </div>

                    {/* Right Panel: Totals & Payments */}
                    <div className="w-[380px] flex flex-col bg-white rounded-3xl border border-[#e2e8f0] shadow-sm overflow-hidden z-20">
                        <CheckoutPanel />
                    </div>
                </div>
            </div>

            {/* Bottom Bar: Action Shortcuts */}
            <div className="z-30 relative">
                <ShortcutBar isFullScreen={isFullScreen} onToggleFullScreen={toggleFullScreen} />
            </div>

            {/* Modals */}
            <PaymentModal />
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
