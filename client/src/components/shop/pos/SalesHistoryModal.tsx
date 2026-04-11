
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { shopApi } from '../../../services/shopApi';
import { POSSale } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../utils/apiConnectivity';
import { showAppToast } from '../../../utils/appToast';

/** Stable 5-char audit code from sale id (avoids random flicker on re-render). */
function authCodeFromSaleKey(saleNumber: string, id?: string): string {
    const seed = `${saleNumber}|${id ?? ''}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const n = Math.abs(h) % 2176782336; // base-36 up to 6 chars
    return n.toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

const scrollNoBar =
    'overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

const SalesHistoryModal: React.FC = () => {
    const {
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        printReceipt,
        searchQuery,
        setSearchQuery
    } = usePOS();

    const [sales, setSales] = useState<POSSale[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSale, setSelectedSale] = useState<POSSale | null>(null);
    const [isBarcodeScan, setIsBarcodeScan] = useState(false);

    useEffect(() => {
        if (isSalesHistoryModalOpen) {
            fetchSales();
        }
    }, [isSalesHistoryModalOpen]);

    // When opened with a receipt id in context (barcode SALE|tenant|invoice, or Khata / deep link with plain SALE-…), lookup sale and select
    useEffect(() => {
        if (!isSalesHistoryModalOpen || !searchQuery) return;
        const raw = String(searchQuery).trim();
        const pipeMatch = raw.match(/^SALE\|[^|]+\|(.+)$/);
        const invoiceNumber = pipeMatch ? pipeMatch[1].trim() : raw;
        if (!/^SALE-/i.test(invoiceNumber)) return;
        setSearchTerm(invoiceNumber);
        setIsBarcodeScan(!!pipeMatch);
        shopApi.getSaleByInvoiceNumber(invoiceNumber)
            .then((sale) => { if (sale) setSelectedSale(sale as POSSale); })
            .catch((e) => {
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Could not look up sale.'), 'error');
                }
            })
            .finally(() => setSearchQuery(''));
    }, [isSalesHistoryModalOpen, searchQuery, setSearchQuery]);

    const fetchSales = async () => {
        setIsLoading(true);
        try {
            const response = await shopApi.getSales();
            // ApiClient returns data directly as an array
            if (response && Array.isArray(response)) {
                // Sort by date descending
                const sortedSales = [...response].sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setSales(sortedSales);
            }
        } catch (error) {
            console.error('Failed to fetch sales history:', error);
            if (isApiConnectivityFailure(error)) {
                showAppToast(userMessageForApiError(error, 'Could not load sales history.'), 'error');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Handle search term changes with barcode detection (including SALE|tenant|invoice pattern)
    const handleSearchChange = async (value: string) => {
        setSearchTerm(value);

        const saleBarcodeMatch = value.match(/^SALE\|[^|]+\|(.+)$/);
        if (saleBarcodeMatch) {
            const invoiceNumber = saleBarcodeMatch[1].trim();
            setIsBarcodeScan(true);
            try {
                const saleByInvoice = await shopApi.getSaleByInvoiceNumber(invoiceNumber);
                if (saleByInvoice) {
                    setSelectedSale(saleByInvoice as POSSale);
                    setSearchTerm(invoiceNumber);
                }
            } catch (e) {
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Could not look up sale by invoice.'), 'error');
                }
                const matchedSale = sales.find(s => s.saleNumber === invoiceNumber);
                if (matchedSale) setSelectedSale(matchedSale);
            }
            return;
        }

        const looksLikeBarcode = value.length > 8 && /^[A-Z0-9-]+$/i.test(value);
        setIsBarcodeScan(looksLikeBarcode);

        const matchedSale = sales.find(sale =>
            sale.saleNumber?.toLowerCase() === value.toLowerCase()
        );
        if (matchedSale) setSelectedSale(matchedSale);
    };

    const filteredSales = sales.filter(sale => {
        const searchLower = searchTerm.toLowerCase();
        const saleNumberMatch = sale.saleNumber?.toLowerCase().includes(searchLower);
        const customerNameMatch = sale.customerName?.toLowerCase().includes(searchLower);
        return saleNumberMatch || customerNameMatch;
    });

    const handlePrint = async (sale: POSSale) => {
        const reprintCount = sale.reprintCount ?? sale.reprint_count ?? 0;
        const isPosSale = sale.source === 'POS' && sale.id;
        if (isPosSale && sale.id) {
            try {
                await shopApi.incrementReprintCount(sale.id);
                printReceipt({ ...sale, reprintCount: reprintCount + 1 });
            } catch (e) {
                console.error('Reprint count increment failed', e);
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Could not update reprint count on the server.'), 'error');
                }
                printReceipt(sale);
            }
        } else {
            printReceipt(sale);
        }
    };

    if (!isSalesHistoryModalOpen) return null;

    return (
        <Modal
            isOpen={isSalesHistoryModalOpen}
            onClose={() => setIsSalesHistoryModalOpen(false)}
            title={<div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
                    {ICONS.clock}
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg sm:text-xl font-semibold text-foreground leading-tight tracking-tight truncate">Sales Archive</h2>
                    <p className="text-[10px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.2em] mt-0.5">Reprint &amp; audit</p>
                </div>
            </div>}
            size="full"
            disableScroll
            className="sm:max-w-[min(1120px,96vw)]"
        >
            <div className="flex flex-col h-[min(640px,calc(100vh-5.5rem))] -mx-1 -mt-1 sm:-m-2 gap-3 min-h-0">
                <div className="relative shrink-0 group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 18 })}
                    </div>
                    <input
                        type="text"
                        placeholder="Receipt #, customer, or scan barcode…"
                        className={`w-full pl-10 pr-28 py-2.5 text-sm rounded-lg bg-background border transition-all font-medium text-foreground placeholder:text-muted-foreground outline-none ${isBarcodeScan
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-input focus:border-primary focus:ring-2 focus:ring-primary/20'
                            }`}
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value).catch(() => {})}
                        autoFocus
                    />
                    {isBarcodeScan && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-primary text-primary-foreground rounded-md text-[10px] font-semibold tracking-wide">
                            Scan
                        </div>
                    )}
                </div>

                <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
                    {/* Sales list — compact table-style */}
                    <div className="w-[34%] min-w-[200px] max-w-[320px] flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2 bg-muted/60 dark:bg-muted/40">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent sales</span>
                            <span className="text-[10px] font-bold tabular-nums text-primary bg-primary/10 dark:bg-primary/20 px-1.5 py-0.5 rounded">{filteredSales.length}</span>
                        </div>
                        <div className={`flex-1 min-h-0 ${scrollNoBar} p-1.5`}>
                            {isLoading ? (
                                <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
                                    <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
                                    <span className="text-[11px] font-medium uppercase tracking-wide">Loading…</span>
                                </div>
                            ) : filteredSales.length === 0 ? (
                                <div className="py-10 px-2 text-center text-muted-foreground">
                                    <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-muted flex items-center justify-center">
                                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 20, className: 'opacity-40' })}
                                    </div>
                                    <p className="text-xs font-semibold">No matches</p>
                                    <p className="text-[10px] mt-1 opacity-80">Try another receipt or name.</p>
                                </div>
                            ) : (
                                <ul className="flex flex-col gap-0.5">
                                    {filteredSales.map((sale, i) => {
                                        const sel = selectedSale?.saleNumber === sale.saleNumber;
                                        return (
                                            <li key={sale.id || sale.saleNumber}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedSale(sale)}
                                                    className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors border ${sel
                                                        ? 'bg-slate-800 text-white border-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-white'
                                                        : i % 2 === 0
                                                            ? 'border-transparent bg-muted/40 dark:bg-muted/20 hover:bg-accent/80 dark:hover:bg-muted/50'
                                                            : 'border-transparent bg-card hover:bg-accent/80 dark:hover:bg-muted/50'}`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className={`text-[11px] font-semibold font-mono leading-tight truncate ${sel ? 'text-white' : 'text-foreground'}`}>
                                                            {sale.saleNumber}
                                                        </span>
                                                        <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${sel ? 'text-emerald-300 dark:text-emerald-300' : 'text-primary'}`}>
                                                            {CURRENCY}{sale.grandTotal.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className={`flex items-center justify-between gap-1 mt-0.5 text-[10px] ${sel ? 'text-slate-300' : 'text-muted-foreground'}`}>
                                                        <span className="truncate">
                                                            {new Date(sale.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                            {' · '}
                                                            {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <span className="shrink-0 uppercase tracking-tight opacity-90">{sale.paymentMethod}</span>
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Receipt preview — light slip in light theme, dark slip in dark theme */}
                    <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border bg-card text-card-foreground overflow-hidden relative shadow-inner dark:border-slate-700 dark:bg-[#0b111f] dark:text-slate-100">
                        <div className="absolute top-2 right-2 pointer-events-none text-foreground/[0.04] dark:text-white/[0.06]">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 120 })}
                        </div>

                        {selectedSale ? (
                            <div className="flex flex-col h-full min-h-0 relative z-10 p-3 sm:p-4">
                                <div className="shrink-0 flex flex-wrap items-end justify-between gap-2 pb-2 border-b border-border dark:border-white/10">
                                    <div>
                                        <p className="text-[9px] font-semibold uppercase tracking-[0.25em] text-emerald-700 dark:text-emerald-400/90">Transaction slip</p>
                                        <h3 className="text-base sm:text-lg font-semibold font-mono tracking-tight text-foreground dark:text-white mt-0.5">{selectedSale.saleNumber}</h3>
                                    </div>
                                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded dark:text-emerald-200/90 dark:bg-emerald-500/15 dark:border-emerald-500/25">
                                        AUTH {authCodeFromSaleKey(selectedSale.saleNumber, selectedSale.id)}
                                    </span>
                                </div>

                                <div className={`flex-1 min-h-0 ${scrollNoBar} py-2`}>
                                    <table className="w-full text-left text-[11px] sm:text-xs border-collapse">
                                        <thead>
                                            <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border dark:border-white/10">
                                                <th className="font-semibold py-1 pr-2">Item</th>
                                                <th className="font-semibold py-1 w-8 text-center">Qty</th>
                                                <th className="font-semibold py-1 w-[4.5rem] text-right tabular-nums">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedSale.items.map((item, idx) => (
                                                <tr key={idx} className="border-b border-border/80 last:border-0 dark:border-white/[0.06]">
                                                    <td className="py-1 pr-2 align-top leading-snug max-w-[1px] text-foreground dark:text-slate-100">
                                                        <span className="line-clamp-2">{item.name}</span>
                                                    </td>
                                                    <td className="py-1 text-center tabular-nums text-muted-foreground dark:text-slate-400">{item.quantity}</td>
                                                    <td className="py-1 text-right font-mono tabular-nums text-foreground dark:text-slate-200">{item.subtotal.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="shrink-0 space-y-1 pt-2 border-t border-border dark:border-white/10">
                                    <div className="flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <span>Subtotal</span>
                                        <span className="font-mono tabular-nums text-foreground/90 dark:text-slate-300">{selectedSale.subtotal.toLocaleString()}</span>
                                    </div>
                                    {selectedSale.discountTotal > 0 && (
                                        <div className="flex justify-between text-[10px] uppercase tracking-wide text-rose-600 dark:text-rose-300/90">
                                            <span>Discount</span>
                                            <span className="font-mono">−{selectedSale.discountTotal.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-baseline gap-2 pt-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-400/90">Total</span>
                                        <span className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-foreground tracking-tight dark:text-white">
                                            <span className="text-xs text-muted-foreground mr-1 dark:text-slate-500">{CURRENCY}</span>
                                            {selectedSale.grandTotal.toLocaleString()}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handlePrint(selectedSale)}
                                    className="mt-3 w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] flex items-center justify-center gap-2 uppercase tracking-wide"
                                >
                                    {ICONS.print}
                                    Print slip
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-muted-foreground min-h-[200px]">
                                <div className="w-14 h-14 rounded-xl bg-muted border border-border flex items-center justify-center mb-3 dark:border-slate-600">
                                    {React.cloneElement(ICONS.archive as React.ReactElement, { size: 28, className: 'opacity-40' })}
                                </div>
                                <p className="text-xs font-semibold">Select a sale</p>
                                <p className="text-[10px] mt-1 max-w-[14rem] leading-relaxed opacity-80">Choose a row on the left to preview and reprint.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SalesHistoryModal;

