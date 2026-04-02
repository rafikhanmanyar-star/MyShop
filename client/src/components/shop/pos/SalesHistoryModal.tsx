
import React, { useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { shopApi } from '../../../services/shopApi';
import { POSSale } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';

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

    // When opened by barcode scan (SALE|tenant|invoice), lookup sale and select
    useEffect(() => {
        if (!isSalesHistoryModalOpen || !searchQuery) return;
        const match = String(searchQuery).match(/^SALE\|[^|]+\|(.+)$/);
        if (match) {
            const invoiceNumber = match[1].trim();
            setSearchTerm(invoiceNumber);
            setIsBarcodeScan(true);
            shopApi.getSaleByInvoiceNumber(invoiceNumber)
                .then((sale) => { if (sale) setSelectedSale(sale as POSSale); })
                .catch(() => {})
                .finally(() => setSearchQuery(''));
        }
    }, [isSalesHistoryModalOpen, searchQuery]);

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
            } catch (_) {
                // Not found or API error; fall back to local filter
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
            title={<div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl pos-gradient-dark flex items-center justify-center text-white shadow-none">
                    {ICONS.clock}
                </div>
                <div>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-none tracking-tight">Sales Archive</h2>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-none">Reprint & Audit Station</span>
                    </div>
                </div>
            </div>}
            size="xl"
        >
            <div className="flex flex-col h-[700px] -m-2">
                {/* Search Bar Area */}
                <div className="mb-8">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                            {React.cloneElement(ICONS.search as React.ReactElement, { size: 22 })}
                        </div>
                        <input
                            type="text"
                            placeholder="Search Receipt #, Customer Name or scan barcode (F4)..."
                            className={`w-full pl-16 pr-24 py-5 bg-[#f8fafc] dark:bg-slate-800 border-2 rounded-[1.5rem] focus:bg-white dark:focus:bg-slate-700 transition-all font-semibold text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none ${isBarcodeScan
                                ? 'border-indigo-500 ring-8 ring-indigo-500/5'
                                : 'border-transparent focus:border-indigo-500 focus:ring-8 focus:ring-indigo-500/5'
                                } shadow-none`}
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value).catch(() => {})}
                            autoFocus
                        />
                        {isBarcodeScan && (
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold tracking-widest animate-pulse shadow-none shadow-none-600/30">
                                📷 BARCODE SCAN
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex gap-8 overflow-hidden">
                    {/* Sales List Panel */}
                    <div className="w-[45%] flex flex-col bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[2.5rem] overflow-hidden shadow-none">
                        <div className="px-8 py-5 bg-[#f8fafc]/50 dark:bg-slate-800/80 border-b border-slate-50 dark:border-slate-700 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500 tracking-[0.2em] flex justify-between items-center">
                            <span>Transactional Log</span>
                            <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-lg">{filteredSales.length} RECORDED</span>
                        </div>
                        <div className="flex-1 overflow-y-auto pos-scrollbar p-3">
                            {isLoading ? (
                                <div className="py-24 flex flex-col items-center gap-4 text-slate-300 dark:text-slate-600">
                                    <div className="w-10 h-10 border-4 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
                                    <span className="font-semibold text-xs uppercase tracking-widest">Accessing Ledger...</span>
                                </div>
                            ) : filteredSales.length === 0 ? (
                                <div className="py-24 text-center text-slate-400 dark:text-slate-500 animate-fade-in px-8">
                                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-5">
                                        {React.cloneElement(ICONS.search as React.ReactElement, { size: 28, className: "opacity-20" })}
                                    </div>
                                    <h5 className="text-sm font-semibold uppercase tracking-widest">No Matches Found</h5>
                                    <p className="text-xs font-bold mt-2 opacity-60">Try searching for a partial receipt ID or customer name.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredSales.map(sale => (
                                        <button
                                            key={sale.id || sale.saleNumber}
                                            onClick={() => setSelectedSale(sale)}
                                            className={`w-full p-5 text-left rounded-3xl transition-all flex justify-between items-center group relative overflow-hidden ${selectedSale?.saleNumber === sale.saleNumber
                                                ? 'bg-indigo-600 text-white'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700 border border-transparent'}`}
                                        >
                                            <div className="flex flex-col relative z-10">
                                                <span className={`text-sm font-semibold uppercase tracking-tight mb-1 ${selectedSale?.saleNumber === sale.saleNumber ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                                                    {sale.saleNumber}
                                                </span>
                                                <span className={`text-xs font-bold uppercase tracking-widest ${selectedSale?.saleNumber === sale.saleNumber ? 'text-white/60' : 'text-slate-400 dark:text-slate-500'}`}>
                                                    {new Date(sale.createdAt).toLocaleDateString()} • {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="text-right relative z-10">
                                                <div className={`text-base font-semibold font-mono tracking-tighter ${selectedSale?.saleNumber === sale.saleNumber ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                                    {CURRENCY}{sale.grandTotal.toLocaleString()}
                                                </div>
                                                <div className={`text-xs font-semibold uppercase tracking-widest mt-1 ${selectedSale?.saleNumber === sale.saleNumber ? 'text-white/40' : 'text-slate-300 dark:text-slate-600'}`}>
                                                    {sale.paymentMethod}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sale Detail / Receipt Preview Panel */}
                    <div className="flex-1 flex flex-col bg-[#0f172a] dark:bg-slate-800 rounded-[2.5rem] p-10 text-white overflow-hidden relative shadow-none">
                        <div className="absolute top-0 right-0 p-12 opacity-[0.03] text-white">
                            {React.cloneElement(ICONS.shoppingCart as React.ReactElement, { size: 200 })}
                        </div>

                        {selectedSale ? (
                            <div className="flex flex-col h-full relative z-10 animate-scale-in">
                                <div className="mb-10 text-center">
                                    <span className="text-xs font-semibold uppercase tracking-[0.5em] text-white/30 mb-4 block">Official Transaction Slip</span>
                                    <h3 className="text-3xl font-semibold mb-2 tracking-tighter">{selectedSale.saleNumber}</h3>
                                    <p className="text-xs text-indigo-400 uppercase font-semibold tracking-widest bg-indigo-500/10 inline-block px-4 py-1.5 rounded-xl border border-indigo-500/20">
                                        AUTH CODE: {Math.random().toString(36).substring(7).toUpperCase()}
                                    </p>
                                </div>

                                <div className="flex-1 overflow-y-auto mb-10 pr-4 pos-scrollbar space-y-8">
                                    <div>
                                        <div className="flex items-center gap-3 mb-5">
                                            <div className="h-px bg-white/10 flex-1"></div>
                                            <h4 className="text-xs font-semibold uppercase text-white/40 tracking-[0.3em] whitespace-nowrap">Order Manifesto</h4>
                                            <div className="h-px bg-white/10 flex-1"></div>
                                        </div>
                                        <div className="space-y-4">
                                            {selectedSale.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center group/item hover:bg-white/5 p-3 -mx-3 rounded-2xl transition-all">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-white/90">{item.name}</span>
                                                        <span className="text-xs font-bold text-white/30 uppercase tracking-widest mt-0.5">Quantity: {item.quantity}</span>
                                                    </div>
                                                    <span className="font-mono text-base font-semibold tracking-tighter text-white/80">{item.subtotal.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-8 border-t border-white/10 space-y-4">
                                        <div className="flex justify-between text-xs font-semibold uppercase tracking-widest text-white/40">
                                            <span>Sub-total Provision</span>
                                            <span className="font-mono text-white/80">{selectedSale.subtotal.toLocaleString()}</span>
                                        </div>
                                        {selectedSale.discountTotal > 0 && (
                                            <div className="flex justify-between text-xs font-semibold uppercase tracking-widest text-rose-400">
                                                <span>Applied Rebate</span>
                                                <span className="font-mono">-{selectedSale.discountTotal.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-baseline pt-4">
                                            <span className="text-sm font-semibold uppercase tracking-[0.4em] text-indigo-400">Payable Total</span>
                                            <span className="text-5xl font-semibold text-white font-mono tracking-tighter">
                                                <span className="text-xl text-white/30 mr-2">{CURRENCY}</span>
                                                {selectedSale.grandTotal.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handlePrint(selectedSale)}
                                    className="w-full py-7 pos-gradient-primary text-white rounded-[2rem] font-semibold text-xl transition-all shadow-none shadow-none-500/20 active:scale-[0.97] flex items-center justify-center gap-4 uppercase tracking-[0.2em] group"
                                >
                                    <div className="group-hover:rotate-12 transition-transform">
                                        {ICONS.print}
                                    </div>
                                    PRINT TRANSACTION SLIP
                                </button>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-white/20 text-center animate-fade-in">
                                <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/5">
                                    {React.cloneElement(ICONS.archive as React.ReactElement, { size: 40, className: "opacity-20" })}
                                </div>
                                <h4 className="text-lg font-semibold uppercase tracking-[0.2em] text-white/40">Access Log Panel</h4>
                                <p className="text-xs font-bold mt-3 opacity-30 max-w-[200px] uppercase tracking-widest leading-loose">Select a record from the ledger to perform archival actions</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SalesHistoryModal;

