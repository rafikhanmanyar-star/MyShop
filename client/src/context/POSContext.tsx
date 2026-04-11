import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    POSCartItem,
    POSProduct,
    POSCustomer,
    POSHeldSale,
    POSPayment,
    POSPaymentMethod,
    POSShift,
    POSProductVariant
} from '../types/pos';
import { shopApi } from '../services/shopApi';
import { ContactsApiRepository } from '../services/api/repositories/contactsApi';
import { CURRENCY } from '../constants';
import { BarcodeScanner, createBarcodeScanner } from '../services/barcode/barcodeScanner';
import { ThermalPrinter, createThermalPrinter, ReceiptData } from '../services/printer/thermalPrinter';
import { useAppContext } from './AppContext';
import { useAuth } from './AuthContext';
import { useShifts } from './ShiftsContext';
import { useInventory } from './InventoryContext';
import { getAppContext, setAppContext, clearAppContextBranch } from '../services/appContext';
import { apiClient } from '../services/apiClient';
import { isApiConnectivityFailure, userMessageForApiError } from '../utils/apiConnectivity';
import { showAppToast } from '../utils/appToast';



interface POSContextType {
    cart: POSCartItem[];
    addToCart: (product: POSProduct, variant?: POSProductVariant, quantity?: number) => void;
    removeFromCart: (cartItemId: string) => void;
    updateCartItem: (cartItemId: string, updates: Partial<POSCartItem>) => void;
    clearCart: () => void;
    applyGlobalDiscount: (percentage: number) => void;

    customer: POSCustomer | null;
    setCustomer: (customer: POSCustomer | null) => void;

    payments: POSPayment[];
    addPayment: (method: POSPaymentMethod, amount: number, reference?: string, bankAccount?: { id: string; name: string }) => void;
    removePayment: (paymentId: string) => void;

    heldSales: POSHeldSale[];
    holdSale: (reference: string) => void;
    recallSale: (heldSaleId: string) => void;

    subtotal: number;
    taxTotal: number;
    discountTotal: number;
    grandTotal: number;
    totalPaid: number;
    balanceDue: number;
    changeDue: number;

    isPaymentModalOpen: boolean;
    setIsPaymentModalOpen: (isOpen: boolean) => void;

    isHeldSalesModalOpen: boolean;
    setIsHeldSalesModalOpen: (isOpen: boolean) => void;

    isCustomerModalOpen: boolean;
    setIsCustomerModalOpen: (isOpen: boolean) => void;

    searchQuery: string;
    setSearchQuery: (query: string) => void;

    isSalesHistoryModalOpen: boolean;
    setIsSalesHistoryModalOpen: (isOpen: boolean) => void;

    completeSale: (directPayment?: any) => Promise<any>;
    printReceipt: (saleData?: any) => Promise<boolean>;
    lastCompletedSale: any | null;
    setLastCompletedSale: (sale: any | null) => void;

    // Branch & Terminal Configuration
    branches: any[];
    terminals: any[];
    selectedBranchId: string | null;
    selectedTerminalId: string | null;
    setSelectedBranchId: (id: string | null) => void;
    setSelectedTerminalId: (id: string | null) => void;

    isDenseMode: boolean;
    setIsDenseMode: React.Dispatch<React.SetStateAction<boolean>>;

    posSettings: any;
}

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { state } = useAppContext(); // Access app state for print settings
    const [cart, setCart] = useState<POSCartItem[]>([]);
    const [customer, setCustomer] = useState<POSCustomer | null>(null);
    const [payments, setPayments] = useState<POSPayment[]>([]);
    const [heldSales, setHeldSales] = useState<POSHeldSale[]>([]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [isSalesHistoryModalOpen, setIsSalesHistoryModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [lastCompletedSale, setLastCompletedSale] = useState<any | null>(null);

    // Branch & Terminal State
    const [branches, setBranches] = useState<any[]>([]);
    const [terminals, setTerminals] = useState<any[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
    const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
    const [isDenseMode, setIsDenseMode] = useState(true);
    const [posSettings, setPosSettings] = useState<any>(null);
    const [receiptSettings, setReceiptSettings] = useState<any>(null);

    // Barcode scanner and printer instances
    const barcodeScannerRef = useRef<BarcodeScanner | null>(null);
    const thermalPrinterRef = useRef<ThermalPrinter | null>(null);

    const { user: authUser } = useAuth();
    const { currentShift } = useShifts();
    const { refreshItems: refreshInventory } = useInventory();
    const currentUserId = authUser?.id ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('user_id') : null) ?? null;

    useEffect(() => {
        const onRealtime = () => {
            refreshInventory().catch(() => {});
        };
        window.addEventListener('shop:realtime', onRealtime as EventListener);
        return () => window.removeEventListener('shop:realtime', onRealtime as EventListener);
    }, [refreshInventory]);

    // Totals Calculation
    const totals = useMemo(() => {
        const subtotal = cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
        const discountTotal = cart.reduce((sum, item) => sum + item.discountAmount, 0);
        const taxTotal = cart.reduce((sum, item) => sum + item.taxAmount, 0);
        const grandTotal = subtotal - discountTotal + taxTotal;
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balanceDue = Math.max(0, grandTotal - totalPaid);
        const changeDue = Math.max(0, totalPaid - grandTotal); // Refund/change amount

        return { subtotal, taxTotal, discountTotal, grandTotal, totalPaid, balanceDue, changeDue };
    }, [cart, payments]);

    // Initialize barcode scanner and thermal printer
    useEffect(() => {
        // Re-create thermal printer with receipt + print settings (configurable template, optional silent print)
        thermalPrinterRef.current = createThermalPrinter({
            printSettings: posSettings ?? state.printSettings,
            receiptSettings: receiptSettings ?? undefined,
        });

        console.log('🖨️ Thermal printer initialized with settings:', {
            shopName: state.printSettings?.posShopName,
            showBarcode: state.printSettings?.posShowBarcode
        });

        // Initialize barcode scanner (only once). Detect SALE|tenant|invoice to open sale detail.
        if (!barcodeScannerRef.current) {
            barcodeScannerRef.current = createBarcodeScanner((barcode) => {
                const match = typeof barcode === 'string' && barcode.match(/^SALE\|[^|]+\|(.+)$/);
                if (match) {
                    const invoiceNumber = match[1].trim();
                    setSearchQuery(invoiceNumber);
                    setIsSalesHistoryModalOpen(true);
                } else {
                    setSearchQuery(barcode || '');
                }
            });
            barcodeScannerRef.current.start();
        }

        // Cleanup on unmount
        return () => {
            if (barcodeScannerRef.current) {
                barcodeScannerRef.current.stop();
            }
        };
    }, [state.printSettings, posSettings, receiptSettings]);

    // Fetch Branches and Terminals
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                console.log('🔄 [POSContext] Fetching branches and terminals...');
                const [branchesList, terminalsList, settings, receiptSettingsRes] = await Promise.all([
                    shopApi.getBranches(),
                    shopApi.getTerminals(),
                    shopApi.getPosSettings().catch(() => null),
                    shopApi.getReceiptSettings().catch(() => null)
                ]);

                setBranches(branchesList);
                setTerminals(terminalsList);
                if (settings) setPosSettings(settings);
                if (receiptSettingsRes) setReceiptSettings(receiptSettingsRes);

                // Apply persisted/QR branch if valid: do NOT override with default when QR branch exists and user has access
                const ctx = getAppContext();
                const branchIds = (branchesList || []).map((b: any) => b.id);
                if (ctx.branch_id && branchIds.includes(ctx.branch_id)) {
                    setSelectedBranchId(ctx.branch_id);
                    apiClient.setBranchId(ctx.branch_id);
                } else if (ctx.selected_by_qr && ctx.branch_id && !branchIds.includes(ctx.branch_id)) {
                    clearAppContextBranch();
                    setSelectedBranchId(branchesList?.[0]?.id ?? null);
                    apiClient.setBranchId(branchesList?.[0]?.id ?? null);
                } else if (!currentShift && branchesList?.length && !ctx.branch_id) {
                    setSelectedBranchId(branchesList[0]?.id ?? null);
                    apiClient.setBranchId(branchesList[0]?.id ?? null);
                }
            } catch (error) {
                console.error('Failed to fetch POS configuration:', error);
                if (isApiConnectivityFailure(error)) {
                    showAppToast(
                        userMessageForApiError(error, 'Cannot load POS configuration (branches, terminals, settings).'),
                        'error',
                        6500
                    );
                }
            }
        };

        if (authUser) {
            fetchConfig();
        }
    }, [authUser]);

    // When user has an active shift, lock branch/terminal to shift (location & station are static).
    // Do NOT dispatch 'branch-changed' here: that event clears the cart and is for explicit user branch switch only.
    // Syncing from shift would clear the cart right after cashier adds items (e.g. when terminals finish loading).
    useEffect(() => {
        if (!currentShift) return;
        const terminal = terminals.find((t: any) => t.id === currentShift.terminal_id);
        const branchId = terminal?.branch_id ?? terminal?.branchId ?? null;
        if (currentShift.terminal_id) setSelectedTerminalId(currentShift.terminal_id);
        if (branchId) {
            setSelectedBranchId(branchId);
            apiClient.setBranchId(branchId);
            setAppContext({ branch_id: branchId, selected_by_qr: false });
        }
    }, [currentShift?.id, currentShift?.terminal_id, terminals]);

    // Keep API client and persisted context in sync with selected branch (e.g. after branch switch)
    useEffect(() => {
        if (selectedBranchId && authUser) {
            apiClient.setBranchId(selectedBranchId);
        }
    }, [selectedBranchId, authUser]);

    // On branch switch (from user menu): clear cart/held, update branch, re-fetch config
    useEffect(() => {
        const handleBranchChanged = (e: CustomEvent<{ branchId: string }>) => {
            const branchId = e.detail?.branchId ?? getAppContext().branch_id;
            if (!branchId) return;
            setSelectedBranchId(branchId);
            apiClient.setBranchId(branchId);
            setCart([]);
            setPayments([]);
            setCustomer(null);
            setHeldSales([]);
            setLastCompletedSale(null);
            shopApi.getBranches().then(setBranches).catch((e) => {
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Cannot refresh branches.'), 'error');
                }
            });
            shopApi.getTerminals().then(setTerminals).catch((e) => {
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Cannot refresh terminals.'), 'error');
                }
            });
        };
        window.addEventListener('branch-changed', handleBranchChanged as EventListener);
        return () => window.removeEventListener('branch-changed', handleBranchChanged as EventListener);
    }, []);

    // Print receipt function; returns true if printed successfully, false otherwise (for toast feedback)
    const printReceipt = useCallback(async (saleData?: any): Promise<boolean> => {
        try {
            const dataToUse = saleData || lastCompletedSale;
            if (!dataToUse) {
                if (!saleData) alert('No sale data available to print');
                return false;
            }

            const receiptData: ReceiptData = {
                storeName: receiptSettings?.shop_name?.trim() || state.printSettings?.posShopName || 'My Shop',
                storeAddress: receiptSettings?.shop_address?.trim() || state.printSettings?.posShopAddress || '',
                storePhone: receiptSettings?.shop_phone?.trim() || state.printSettings?.posShopPhone || '',
                taxId: receiptSettings?.tax_id?.trim() || state.printSettings?.taxId || '',
                logoUrl: receiptSettings?.logo_url?.trim() || state.printSettings?.logoUrl || undefined,
                receiptNumber: dataToUse.saleNumber,
                date: new Date(dataToUse.createdAt || Date.now()).toLocaleDateString(),
                time: new Date(dataToUse.createdAt || Date.now()).toLocaleTimeString(),
                cashier: dataToUse.cashierName || (dataToUse.userId === authUser?.id ? authUser?.name : null) || authUser?.name || 'Cashier',
                shiftNumber: dataToUse.shiftId ? String(dataToUse.shiftId).split('-')[0].toUpperCase() : (currentShift?.id ? String(currentShift.id).split('-')[0].toUpperCase() : undefined),
                customer: customer?.name ?? dataToUse.customerName,
                items: (dataToUse.items || []).map((item: any) => ({
                    name: item.name || 'Unknown Item',
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discount: item.discountAmount || 0,
                    total: item.subtotal
                })),
                subtotal: dataToUse.subtotal,
                discount: dataToUse.discountTotal ?? 0,
                tax: dataToUse.taxTotal ?? 0,
                total: dataToUse.grandTotal,
                payments: (dataToUse.paymentDetails || []).map((p: any) => ({
                    method: p.method,
                    amount: p.amount,
                    reference: p.reference
                })),
                change: dataToUse.changeDue > 0 ? dataToUse.changeDue : undefined,
                footer: receiptSettings?.footer_message || state.printSettings?.posReceiptFooter || 'Thank you for shopping with us!',
                reprint_count: dataToUse.reprintCount ?? dataToUse.reprint_count ?? 0,
                barcode_value: dataToUse.barcodeValue ?? dataToUse.barcode_value ?? null,
                printerName: posSettings?.default_printer_name
            };

            if (!thermalPrinterRef.current) {
                console.warn('Receipt printer not initialized');
                return false;
            }
            const copies = posSettings?.receipt_copies || 1;
            let ok = true;
            for (let i = 0; i < copies; i++) {
                const result = await thermalPrinterRef.current.printReceipt({
                    ...receiptData,
                    printerName: posSettings?.default_printer_name
                } as any);
                if (!result) ok = false;
            }
            if (ok) console.log('Receipt printed successfully');
            return ok;
        } catch (error: any) {
            console.error('Failed to print receipt:', error);
            return false;
        }
    }, [lastCompletedSale, customer, state.printSettings, posSettings, receiptSettings, authUser, currentShift]);


    const addToCart = useCallback((product: POSProduct, variant?: POSProductVariant, quantity: number = 1) => {
        const availableStock = variant != null
            ? (variant.stockLevel ?? 0)
            : (product.stockLevel ?? 0);

        if (availableStock <= 0) {
            alert('This product is out of stock. You cannot add it to the cart.');
            return;
        }

        const unitPrice = product.price + (variant?.priceAdjustment || 0);
        const cost = product.cost ?? 0;
        const margin = unitPrice - cost;

        if (unitPrice <= 0) {
            const msg = `This product has zero or negative price (SKU: ${variant?.sku || product.sku}). Add anyway or cancel to update the SKU.`;
            if (!window.confirm(msg)) return;
        } else if (margin <= 0) {
            const msg = `This product has zero or negative margin — sales price (${CURRENCY} ${unitPrice.toFixed(2)}) minus cost (${CURRENCY} ${cost.toFixed(2)}). Add anyway or cancel to update the SKU.`;
            if (!window.confirm(msg)) return;
        }

        const requestedQty = Math.max(1, Math.floor(quantity));
        const safeQty = Math.min(requestedQty, availableStock);

        setCart(prev => {
            const existingItemIndex = prev.findIndex(item =>
                item.productId === product.id && item.variantId === variant?.id
            );

            if (existingItemIndex > -1) {
                const newCart = [...prev];
                const item = newCart[existingItemIndex];
                const currentInCart = item.quantity;
                const newQty = Math.min(currentInCart + safeQty, availableStock);

                if (currentInCart + requestedQty > availableStock) {
                    setTimeout(() => alert(`Only ${availableStock} available in stock. Cart quantity capped at ${availableStock}.`), 0);
                }

                const basePrice = item.unitPrice * newQty;
                const tax = basePrice * (item.taxRate / 100);

                newCart[existingItemIndex] = {
                    ...item,
                    quantity: newQty,
                    stockLevel: availableStock,
                    taxAmount: tax
                };
                return newCart;
            }

            const tax = (unitPrice * safeQty) * (product.taxRate / 100);

            const newItem: POSCartItem = {
                id: crypto.randomUUID(),
                productId: product.id,
                variantId: variant?.id,
                name: variant ? `${product.name} (${variant.name})` : product.name,
                sku: variant?.sku || product.sku,
                quantity: safeQty,
                unitPrice: unitPrice,
                discountAmount: 0,
                discountPercentage: 0,
                taxAmount: tax,
                taxRate: product.taxRate,
                categoryId: product.categoryId,
                imageUrl: product.imageUrl,
                stockLevel: availableStock
            };
            return [...prev, newItem];
        });
        setSearchQuery(''); // Reset search after adding
    }, []);

    const removeFromCart = useCallback((cartItemId: string) => {
        setCart(prev => prev.filter(item => item.id !== cartItemId));
    }, []);

    const updateCartItem = useCallback((cartItemId: string, updates: Partial<POSCartItem>) => {
        setCart(prev => prev.map(item => {
            if (item.id !== cartItemId) return item;

            let effectiveUpdates = { ...updates };

            // Enforce stock cap when quantity is increased (manual + or input)
            if ('quantity' in effectiveUpdates && typeof effectiveUpdates.quantity === 'number') {
                const requestedQty = Math.max(1, Math.floor(effectiveUpdates.quantity));
                const maxAllowed = item.stockLevel;
                if (maxAllowed != null && requestedQty > maxAllowed) {
                    effectiveUpdates = { ...effectiveUpdates, quantity: maxAllowed };
                    setTimeout(() => alert(`Only ${maxAllowed} available in stock. Quantity cannot exceed ${maxAllowed}.`), 0);
                } else if (requestedQty < 1) {
                    effectiveUpdates = { ...effectiveUpdates, quantity: 1 };
                } else {
                    effectiveUpdates = { ...effectiveUpdates, quantity: requestedQty };
                }
            }

            const updatedItem = { ...item, ...effectiveUpdates };
            // Never allow negative or zero quantity from any source (keyboard, etc.)
            if ('quantity' in updatedItem && (typeof updatedItem.quantity !== 'number' || updatedItem.quantity < 1)) {
                updatedItem.quantity = 1;
            }
            // Recalculate tax/discount if quantity or price changed
            if ('quantity' in effectiveUpdates || 'unitPrice' in updates || 'discountPercentage' in updates) {
                const price = updatedItem.unitPrice;
                const qty = updatedItem.quantity;
                const disc = updatedItem.isFree ? price * qty : (price * qty * (updatedItem.discountPercentage / 100));
                const taxableAmount = (price * qty) - disc;
                updatedItem.discountAmount = disc;
                updatedItem.taxAmount = taxableAmount * (updatedItem.taxRate / 100);
            }
            return updatedItem;
        }));
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
        setPayments([]);
        setCustomer(null);
    }, []);

    const addPayment = useCallback((method: POSPaymentMethod, amount: number, reference?: string, bankAccount?: { id: string; name: string }) => {
        setPayments(prev => [...prev, {
            id: crypto.randomUUID(),
            method,
            amount,
            reference,
            bankAccountId: bankAccount?.id,
            bankAccountName: bankAccount?.name
        }]);
    }, []);

    const removePayment = useCallback((paymentId: string) => {
        setPayments(prev => prev.filter(p => p.id !== paymentId));
    }, []);

    const holdSale = useCallback((reference: string) => {
        if (cart.length === 0) return;

        const newHeldSale: POSHeldSale = {
            id: crypto.randomUUID(),
            reference,
            cart: [...cart],
            customerId: customer?.id,
            loyaltyMemberId: customer?.loyaltyMemberId ?? null,
            total: totals.grandTotal,
            heldAt: new Date().toISOString(),
            cashierId: currentUserId ?? 'Cashier'
        };

        setHeldSales(prev => [...prev, newHeldSale]);
        clearCart();
    }, [cart, customer, totals.grandTotal, clearCart, currentUserId]);

    const recallSale = useCallback(async (heldSaleId: string) => {
        const heldSale = heldSales.find(s => s.id === heldSaleId);
        if (heldSale) {
            setCart(heldSale.cart);
            setPayments([]); // Clear any previous payments so summary reflects recalled sale only

            if (heldSale.customerId) {
                try {
                    const contactsApi = new ContactsApiRepository();
                    const contact = await contactsApi.findById(heldSale.customerId);
                    if (contact) {
                        const { shopApi } = await import('../services/shopApi');
                        let loyaltyMemberId: string | null = null;
                        let points = 0;
                        let tier: POSCustomer['tier'] = 'Standard';
                        try {
                            const members = await shopApi.getLoyaltyMembers();
                            if (Array.isArray(members)) {
                                const m = members.find(
                                    (row: any) =>
                                        row.customer_id === contact.id ||
                                        (row.contact_no && contact.contactNo &&
                                            String(row.contact_no).replace(/\D/g, '') === String(contact.contactNo).replace(/\D/g, ''))
                                );
                                if (m) {
                                    loyaltyMemberId = m.id;
                                    points = parseInt(String(m.points_balance), 10) || 0;
                                    tier = (m.tier as POSCustomer['tier']) || 'Standard';
                                }
                            }
                        } catch {
                            /* optional */
                        }
                        const posCustomer: POSCustomer = {
                            id: contact.id,
                            name: contact.name,
                            phone: contact.contactNo || 'N/A',
                            loyaltyMemberId,
                            points,
                            creditLimit: 0,
                            balance: 0,
                            tier
                        };
                        setCustomer(posCustomer);
                    }
                } catch (error) {
                    console.error('Failed to restore customer:', error);
                    if (isApiConnectivityFailure(error)) {
                        showAppToast(
                            userMessageForApiError(error, 'Could not load customer from the server.'),
                            'error'
                        );
                    }
                }
            }

            setHeldSales(prev => prev.filter(s => s.id !== heldSaleId));
        }
    }, [heldSales]);

    const completeSale = useCallback(async (directPayment?: any) => {
        try {
            if (cart.length === 0) {
                alert('Please add at least one item to the cart.');
                return;
            }

            const currentPayments = directPayment ? [directPayment] : payments;
            const currentTotalPaid = directPayment ? directPayment.amount : totals.totalPaid;
            const currentChangeDue = directPayment ? Math.max(0, directPayment.amount - totals.grandTotal) : totals.changeDue;

            if (currentPayments.length === 0 || currentTotalPaid < totals.grandTotal) {
                alert('Please add payment covering the sale total.');
                return;
            }

            const saleNumber = `SALE-${Date.now()}`;
            const saleData = {
                branchId: selectedBranchId ?? undefined,
                terminalId: selectedTerminalId ?? undefined,
                userId: currentUserId ?? undefined,
                shiftId: currentShift?.id ?? undefined,
                customerId: customer?.id,
                loyaltyMemberId: customer?.loyaltyMemberId ?? null,
                saleNumber,
                subtotal: totals.subtotal,
                taxTotal: totals.taxTotal,
                discountTotal: totals.discountTotal,
                grandTotal: totals.grandTotal,
                totalPaid: currentTotalPaid,
                changeDue: currentChangeDue,
                paymentMethod: currentPayments.length > 1 ? 'Multiple' : currentPayments[0]?.method || 'Cash',
                paymentDetails: currentPayments,
                items: cart.map(item => ({
                    productId: item.productId,
                    name: item.name, // Include name for receipt printing
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxAmount: item.taxAmount,
                    discountAmount: item.discountAmount,
                    subtotal: (item.unitPrice * item.quantity) - item.discountAmount + item.taxAmount
                })),
                createdAt: new Date().toISOString()
            };

            const saleResponse = await shopApi.createSale(saleData) as any;
            const saleId = saleResponse?.id ?? saleResponse;
            const barcode_value = saleResponse?.barcode_value ?? `SALE|${saleNumber}`;

            const completedSale = {
                ...saleData,
                saleNumber,
                id: saleId,
                barcode_value,
                barcodeValue: barcode_value,
                reprintCount: 0,
                reprint_count: 0,
            };
            setLastCompletedSale(completedSale);

            clearCart();
            // Clear payment data for the next sale (auto-clears if not recalled, but helps to clear now)
            setPayments([]);

            // Refresh inventory so POS product grid shows updated stock
            refreshInventory().catch(() => { });
            window.dispatchEvent(new CustomEvent('shop:realtime', { detail: { type: 'sale_created', saleId: saleId } }));

            // Auto-print: await and show toast so user knows if receipt printed
            const shouldAutoPrint = posSettings?.auto_print_receipt ?? true;
            let printSucceeded = false;
            if (shouldAutoPrint) {
                printSucceeded = await printReceipt(completedSale).catch(() => false);
            }
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-xl z-[10000] text-sm font-medium animate-slide-up';
            if (printSucceeded) {
                toast.classList.add('bg-emerald-600', 'text-white');
                toast.innerText = 'Sale completed. Receipt printed.';
            } else {
                toast.classList.add('bg-slate-800', 'text-white');
                toast.innerText = shouldAutoPrint
                    ? 'Sale completed. Receipt could not be printed—use Reprint if needed.'
                    : 'Sale completed.';
            }
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.remove();
                setLastCompletedSale(null);
            }, 3500);

            return completedSale;
        } catch (error: any) {
            console.error('Failed to complete sale:', error);
            let message = userMessageForApiError(error, 'Unknown error');
            if (typeof message === 'string' && (message.includes('<!DOCTYPE') || message.includes('<html'))) {
                message =
                    'Server returned an unexpected response. The API may be restarting—check your connection and try again.';
            }
            alert('Error completing sale: ' + message);
            throw error;
        }
    }, [cart, customer, payments, totals, clearCart, currentUserId, selectedBranchId, selectedTerminalId, currentShift?.id, posSettings, printReceipt]);

    const applyGlobalDiscount = useCallback((percentage: number) => {
        setCart(prev => prev.map(item => {
            const price = item.unitPrice;
            const qty = item.quantity;
            const disc = item.isFree ? price * qty : (price * qty * (percentage / 100));
            // Ensure tax is calculated on the discounted amount
            const taxableAmount = Math.max(0, (price * qty) - disc);

            return {
                ...item,
                discountPercentage: percentage,
                discountAmount: disc,
                taxAmount: taxableAmount * (item.taxRate / 100)
            };
        }));
    }, []);

    const value = {
        cart,
        addToCart,
        removeFromCart,
        updateCartItem,
        clearCart,
        applyGlobalDiscount,
        customer,
        setCustomer,
        payments,
        addPayment,
        removePayment,
        heldSales,
        holdSale,
        recallSale,
        ...totals,
        isPaymentModalOpen,
        setIsPaymentModalOpen,
        isHeldSalesModalOpen,
        setIsHeldSalesModalOpen,
        isCustomerModalOpen,
        setIsCustomerModalOpen,
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        searchQuery,
        setSearchQuery,
        completeSale,
        printReceipt,
        lastCompletedSale,
        setLastCompletedSale,
        branches,
        terminals,
        selectedBranchId,
        selectedTerminalId,
        setSelectedBranchId,
        setSelectedTerminalId,
        isDenseMode,
        setIsDenseMode,
        posSettings
    };

    return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
};

export const usePOS = () => {
    const context = useContext(POSContext);
    if (!context) throw new Error('usePOS must be used within a POSProvider');
    return context;
};
