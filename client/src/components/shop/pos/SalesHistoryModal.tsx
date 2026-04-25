import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../ui/Modal';
import { usePOS } from '../../../context/POSContext';
import { shopApi } from '../../../services/shopApi';
import { POSSale } from '../../../types/pos';
import { ICONS, CURRENCY } from '../../../constants';
import { isApiConnectivityFailure, userMessageForApiError } from '../../../utils/apiConnectivity';
import { showAppToast } from '../../../utils/appToast';
import {
    Banknote,
    Calendar,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Download,
    Eye,
    Filter,
    MoreVertical,
    PieChart,
    Printer,
    TrendingUp,
    Undo2,
} from 'lucide-react';

const PAGE_SIZE = 25;
const scrollNoBar =
    'overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

function authCodeFromSaleKey(saleNumber: string, id?: string): string {
    const seed = `${saleNumber}|${id ?? ''}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const n = Math.abs(h) % 2176782336;
    return n.toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

function displayStatus(sale: POSSale): string {
    const raw = (sale.status || '').trim();
    const low = raw.toLowerCase();
    if (low.includes('void') || low.includes('cancel')) return 'VOIDED';
    if (sale.source === 'Mobile' || low === 'delivered') return 'COMPLETED';
    if (low.includes('complete')) return 'COMPLETED';
    if (!raw) return 'COMPLETED';
    return raw.replace(/\s+/g, ' ').toUpperCase();
}

function isOnlinePayment(pm: string) {
    const s = (pm || '').toLowerCase();
    return s.includes('online') || s.includes('card') || s.includes('wallet');
}

type DateRangeKey = 'all' | 'today' | '7' | '30' | '90';
type StatusFilter = 'all' | 'completed' | 'voided';
type CustomerTypeFilter = 'all' | 'walk_in' | 'named' | 'loyalty';

const SalesHistoryModal: React.FC = () => {
    const navigate = useNavigate();
    const {
        isSalesHistoryModalOpen,
        setIsSalesHistoryModalOpen,
        printReceipt,
        searchQuery,
        setSearchQuery,
    } = usePOS();

    const [sales, setSales] = useState<POSSale[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSale, setSelectedSale] = useState<POSSale | null>(null);
    const [isBarcodeScan, setIsBarcodeScan] = useState(false);
    const [dateRange, setDateRange] = useState<DateRangeKey>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [customerType, setCustomerType] = useState<CustomerTypeFilter>('all');
    const [page, setPage] = useState(0);
    const [menuSaleKey, setMenuSaleKey] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [archiveHintDays, setArchiveHintDays] = useState(30);

    useEffect(() => {
        if (!isSalesHistoryModalOpen) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuSaleKey(null);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [isSalesHistoryModalOpen]);

    const fetchSales = useCallback(async () => {
        setIsLoading(true);
        try {
            const ps = await shopApi.getPosSettings().catch(() => null);
            const days = Math.min(
                3650,
                Math.max(1, parseInt(String((ps as any)?.archive_history_days ?? 30), 10) || 30)
            );
            setArchiveHintDays(days);
            const response = await shopApi.getSales({ days });
            if (response && Array.isArray(response)) {
                const sortedSales = [...response].sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setSales(sortedSales);
            } else {
                setSales([]);
            }
        } catch (error) {
            console.error('Failed to fetch sales history:', error);
            if (isApiConnectivityFailure(error)) {
                showAppToast(userMessageForApiError(error, 'Could not load sales history.'), 'error');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isSalesHistoryModalOpen) {
            void fetchSales();
            setPage(0);
        }
    }, [isSalesHistoryModalOpen, fetchSales]);

    useEffect(() => {
        if (!isSalesHistoryModalOpen || !searchQuery) return;
        const raw = String(searchQuery).trim();
        const pipeMatch = raw.match(/^SALE\|[^|]+\|(.+)$/);
        const invoiceNumber = pipeMatch ? pipeMatch[1].trim() : raw;
        if (!/^SALE-/i.test(invoiceNumber)) return;
        setSearchTerm(invoiceNumber);
        setIsBarcodeScan(!!pipeMatch);
        shopApi
            .getSaleByInvoiceNumber(invoiceNumber)
            .then((sale) => {
                if (sale) {
                    setSelectedSale(sale as POSSale);
                    setPage(0);
                }
            })
            .catch((e) => {
                if (isApiConnectivityFailure(e)) {
                    showAppToast(userMessageForApiError(e, 'Could not look up sale.'), 'error');
                }
            })
            .finally(() => setSearchQuery(''));
    }, [isSalesHistoryModalOpen, searchQuery, setSearchQuery]);

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
                const matchedSale = sales.find((s) => s.saleNumber === invoiceNumber);
                if (matchedSale) setSelectedSale(matchedSale);
            }
            return;
        }

        const looksLikeBarcode = value.length > 8 && /^[A-Z0-9-]+$/i.test(value);
        setIsBarcodeScan(looksLikeBarcode);

        const matchedSale = sales.find((sale) => sale.saleNumber?.toLowerCase() === value.toLowerCase());
        if (matchedSale) setSelectedSale(matchedSale);
    };

    const filteredSales = useMemo(() => {
        const st = new Date();
        return sales.filter((sale) => {
            const sLower = searchTerm.toLowerCase();
            if (sLower) {
                const num = sale.saleNumber?.toLowerCase().includes(sLower);
                const name = sale.customerName?.toLowerCase().includes(sLower);
                const refMatch = (sale as any).barcodeValue
                    ? String((sale as any).barcodeValue).toLowerCase().includes(sLower)
                    : false;
                if (!num && !name && !refMatch) return false;
            }
            const created = new Date(sale.createdAt);
            if (dateRange === 'today') {
                if (
                    created.getDate() !== st.getDate() ||
                    created.getMonth() !== st.getMonth() ||
                    created.getFullYear() !== st.getFullYear()
                ) {
                    return false;
                }
            } else if (dateRange === '7' || dateRange === '30' || dateRange === '90') {
                const d = parseInt(dateRange, 10);
                const t = new Date(st);
                t.setDate(t.getDate() - d);
                if (created < t) return false;
            }

            if (statusFilter === 'completed' && displayStatus(sale) === 'VOIDED') return false;
            if (statusFilter === 'voided' && displayStatus(sale) !== 'VOIDED') return false;

            if (customerType === 'walk_in') {
                if (sale.customerName && sale.customerName.trim().length > 0) return false;
            } else if (customerType === 'named') {
                if (!sale.customerName || !sale.customerName.trim().length) return false;
            } else if (customerType === 'loyalty') {
                if (!sale.loyaltyMemberId) return false;
            }
            return true;
        });
    }, [sales, searchTerm, dateRange, statusFilter, customerType]);

    const pageCount = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageItems = useMemo(
        () => filteredSales.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
        [filteredSales, safePage]
    );

    const stats = useMemo(() => {
        const list = filteredSales;
        if (list.length === 0) {
            return { avg: 0, net24: 0, count24: 0, onlinePct: 0, cashPct: 100, sampleCount: 0 };
        }
        const totalSum = list.reduce((a, s) => a + (Number(s.grandTotal) || 0), 0);
        const avg = totalSum / list.length;
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        let net24 = 0;
        let count24 = 0;
        let onlineW = 0;
        let cashW = 0;
        for (const s of list) {
            const t = new Date(s.createdAt).getTime();
            if (t >= dayAgo) {
                net24 += Number(s.grandTotal) || 0;
                count24 += 1;
            }
            if (isOnlinePayment(s.paymentMethod)) onlineW += 1;
            else cashW += 1;
        }
        const w = onlineW + cashW;
        const onlinePct = w > 0 ? Math.round((onlineW / w) * 100) : 0;
        return { avg, net24, count24, onlinePct, cashPct: w > 0 ? 100 - onlinePct : 100, sampleCount: list.length };
    }, [filteredSales]);

    useEffect(() => {
        setPage(0);
    }, [searchTerm, dateRange, statusFilter, customerType]);

    const handlePrint = async (sale: POSSale) => {
        const reprintCount = sale.reprintCount ?? (sale as any).reprint_count ?? 0;
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

    const exportArchive = () => {
        const lines = [
            ['Transaction ID', 'Date (ISO)', 'Customer', 'Payment', 'Total', 'Status', 'Source'].join(','),
        ];
        for (const s of filteredSales) {
            const row = [
                s.saleNumber,
                s.createdAt,
                (s.customerName || 'Walk-in').replace(/"/g, '""'),
                s.paymentMethod,
                String(s.grandTotal),
                displayStatus(s),
                s.source || 'POS',
            ].map((c) => (typeof c === 'string' && c.includes(',') ? `"${c}"` : c));
            lines.push(row.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sales-archive-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const goSalesReturn = (sale: POSSale) => {
        setMenuSaleKey(null);
        setIsSalesHistoryModalOpen(false);
        navigate('/sales-returns/new', { state: { prefillInvoice: sale.saleNumber } });
    };

    if (!isSalesHistoryModalOpen) return null;

    const startIdx = filteredSales.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
    const endIdx = Math.min(filteredSales.length, safePage * PAGE_SIZE + PAGE_SIZE);

    return (
        <Modal
            isOpen={isSalesHistoryModalOpen}
            onClose={() => setIsSalesHistoryModalOpen(false)}
            title={
                <div className="flex w-full min-w-0 items-start justify-between gap-3 pr-1">
                    <div className="min-w-0">
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-primary-900 dark:text-foreground">
                            Sales Archive
                        </h2>
                        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Reprint, audit &amp; returns
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={exportArchive}
                        disabled={filteredSales.length === 0}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200/80 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-900 hover:bg-primary-100 disabled:opacity-50 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-100 dark:hover:bg-primary-900/50"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </button>
                </div>
            }
            size="full"
            disableScroll
            className="sm:max-w-[min(1200px,98vw)]"
        >
            <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-2 pt-3 sm:px-3 sm:pb-3 sm:pt-3">
                <p className="shrink-0 text-[11px] leading-normal text-muted-foreground break-words">
                    Showing records from the last <span className="font-semibold text-foreground">{archiveHintDays}</span>{' '}
                    day{archiveHintDays === 1 ? '' : 's'}. Change this under Settings → POS Preferences → Sales archive.
                </p>

                <div className="grid shrink-0 grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
                    <div className="relative min-w-0 group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary">
                            {React.cloneElement(ICONS.search as React.ReactElement, { size: 16 })}
                        </div>
                        <input
                            type="text"
                            placeholder="Search by ID, customer, or reference…"
                            className={`w-full pl-9 pr-24 py-2 text-sm rounded-lg bg-background border transition-all font-medium text-foreground placeholder:text-muted-foreground outline-none ${
                                isBarcodeScan
                                    ? 'border-primary ring-2 ring-primary/20'
                                    : 'border-input focus:border-primary focus:ring-2 focus:ring-primary/20'
                            }`}
                            value={searchTerm}
                            onChange={(e) => void handleSearchChange(e.target.value)}
                            autoFocus
                        />
                        {isBarcodeScan && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                Scan
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <select
                            aria-label="Date range"
                            className="h-9 w-full min-w-[7rem] rounded-lg border border-input bg-background px-2 text-xs font-semibold"
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
                        >
                            <option value="all">All in range</option>
                            <option value="today">Today</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                        </select>
                    </div>
                    <select
                        aria-label="Status filter"
                        className="h-9 w-full min-w-[6.5rem] rounded-lg border border-input bg-background px-2 text-xs font-semibold"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    >
                        <option value="all">All status</option>
                        <option value="completed">Completed</option>
                        <option value="voided">Voided</option>
                    </select>
                    <select
                        aria-label="Customer type filter"
                        className="h-9 w-full min-w-[7rem] rounded-lg border border-input bg-background px-2 text-xs font-semibold"
                        value={customerType}
                        onChange={(e) => setCustomerType(e.target.value as CustomerTypeFilter)}
                    >
                        <option value="all">All customers</option>
                        <option value="walk_in">Walk-in</option>
                        <option value="named">Named</option>
                        <option value="loyalty">Loyalty</option>
                    </select>
                    <div className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground" title="Filters">
                        <Filter className="h-4 w-4" />
                    </div>
                </div>

                <div className={`min-h-0 flex-1 rounded-xl border border-border ${scrollNoBar} overflow-x-auto`}>
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center gap-2 text-muted-foreground">
                            <div className="h-8 w-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
                            <span className="text-xs font-medium uppercase tracking-wide">Loading…</span>
                        </div>
                    ) : (
                        <table className="w-full min-w-[720px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-border bg-muted/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    <th className="w-8 px-2 py-2.5" />
                                    <th className="px-2 py-2.5">Transaction ID</th>
                                    <th className="px-2 py-2.5">Date &amp; time</th>
                                    <th className="px-2 py-2.5">Customer</th>
                                    <th className="px-2 py-2.5">Payment</th>
                                    <th className="px-2 py-2.5 text-right">Total</th>
                                    <th className="px-2 py-2.5">Status</th>
                                    <th className="w-[8.5rem] px-2 py-2.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                                            No matching transactions. Adjust search or filters.
                                        </td>
                                    </tr>
                                ) : (
                                    pageItems.map((sale) => {
                                        const sel = selectedSale?.saleNumber === sale.saleNumber;
                                        const d = new Date(sale.createdAt);
                                        const st = displayStatus(sale);
                                        const isVoid = st === 'VOIDED';
                                        const k = sale.id || sale.saleNumber;
                                        return (
                                            <tr
                                                key={k}
                                                className={`cursor-pointer border-b border-border/60 transition-colors ${
                                                    sel ? 'bg-primary-900/8 dark:bg-primary-500/10' : 'hover:bg-muted/40'
                                                }`}
                                                onClick={() => setSelectedSale(sale)}
                                            >
                                                <td className="px-2 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" className="rounded border-input opacity-40" disabled aria-hidden="true" tabIndex={-1} />
                                                </td>
                                                <td className="px-2 py-2 font-mono font-semibold text-primary-900 dark:text-primary-300">
                                                    #{sale.saleNumber}
                                                </td>
                                                <td className="px-2 py-2 text-muted-foreground">
                                                    <div>
                                                        {d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div className="text-[10px]">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td className="max-w-[8rem] truncate px-2 py-2 text-foreground">
                                                    {sale.customerName?.trim() || '—'}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <span className="inline-flex items-center gap-1.5 text-[11px]">
                                                        {isOnlinePayment(sale.paymentMethod) ? (
                                                            <CreditCard className="h-3.5 w-3.5 text-sky-600" />
                                                        ) : (
                                                            <Banknote className="h-3.5 w-3.5 text-amber-700" />
                                                        )}
                                                        {sale.paymentMethod}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums">
                                                    {CURRENCY} {Number(sale.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                            isVoid
                                                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
                                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                                                        }`}
                                                    >
                                                        {st}
                                                    </span>
                                                </td>
                                                <td className="px-1 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="inline-flex items-center justify-end gap-0.5">
                                                        <button
                                                            type="button"
                                                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            title="View slip"
                                                            aria-label="View slip"
                                                            onClick={() => setSelectedSale(sale)}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            title="Print receipt"
                                                            aria-label="Print receipt"
                                                            onClick={() => void handlePrint(sale)}
                                                        >
                                                            <Printer className="h-4 w-4" />
                                                        </button>
                                                        <div className="relative" ref={menuSaleKey === k ? menuRef : null}>
                                                            <button
                                                                type="button"
                                                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                title="More actions"
                                                                aria-label="More actions"
                                                                aria-haspopup="menu"
                                                                aria-expanded={menuSaleKey === k}
                                                                onClick={() => setMenuSaleKey((cur) => (cur === k ? null : k))}
                                                            >
                                                                <MoreVertical className="h-4 w-4" />
                                                            </button>
                                                            {menuSaleKey === k && (
                                                                <div className="absolute right-0 top-full z-20 mt-0.5 min-w-[10rem] rounded-lg border border-border bg-card py-1 shadow-lg">
                                                                    <button
                                                                        type="button"
                                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted"
                                                                        onClick={() => goSalesReturn(sale)}
                                                                    >
                                                                        <Undo2 className="h-3.5 w-3.5" />
                                                                        Sales return
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <span>
                        {filteredSales.length === 0
                            ? 'No transactions'
                            : `Showing ${startIdx}–${endIdx} of ${filteredSales.length.toLocaleString()}`}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="rounded p-1 hover:bg-muted disabled:opacity-40"
                            disabled={safePage <= 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[3rem] text-center text-xs font-mono">
                            {safePage + 1} / {pageCount}
                        </span>
                        <button
                            type="button"
                            className="rounded p-1 hover:bg-muted disabled:opacity-40"
                            disabled={safePage >= pageCount - 1}
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            aria-label="Next page"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Average (filtered)</span>
                            <TrendingUp className="h-4 w-4 text-primary-600" />
                        </div>
                        <p className="text-lg font-bold tabular-nums text-foreground">
                            {CURRENCY} {stats.avg.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Across {stats.sampleCount} shown</p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Net (24h in range)</span>
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                        </div>
                        <p className="text-lg font-bold tabular-nums text-foreground">
                            {CURRENCY} {stats.net24.toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Based on {stats.count24} order{stats.count24 === 1 ? '' : 's'} in last 24h (filtered set)</p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment mix</span>
                            <PieChart className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full bg-sky-600 transition-all"
                                style={{ width: `${stats.onlinePct}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            {stats.onlinePct}% online · {stats.cashPct}% other (filtered)
                        </p>
                    </div>
                </div>

                {selectedSale && (
                    <div className="flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-dashed border-primary-200/80 bg-primary-50/40 p-3 dark:border-primary-800 dark:bg-primary-950/20">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400/90">Transaction slip</p>
                                <h3 className="font-mono text-sm font-semibold text-foreground break-all">{selectedSale.saleNumber}</h3>
                            </div>
                            <span className="shrink-0 rounded border border-emerald-200/80 bg-emerald-100 px-2 py-0.5 font-mono text-[10px] text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200">
                                AUTH {authCodeFromSaleKey(selectedSale.saleNumber, selectedSale.id)}
                            </span>
                        </div>
                        <div className="min-h-0 max-h-[min(50vh,22rem)] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-background/50 pr-1 [scrollbar-gutter:stable] dark:bg-slate-900/30">
                            <table className="w-full min-w-0 table-fixed text-left text-[10px] border-collapse sm:text-xs">
                                <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-sm dark:bg-slate-800/90">
                                    <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                        <th className="w-[58%] py-1.5 pl-1 pr-2 text-left font-semibold">Item</th>
                                        <th className="w-[10%] py-1.5 text-center font-semibold">Qty</th>
                                        <th className="w-[32%] py-1.5 pl-1 pr-1 text-right font-semibold">Amt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedSale.items.map((item, idx) => (
                                        <tr key={idx} className="border-b border-border/50 last:border-0">
                                            <td className="break-words py-1.5 pl-1 pr-2 align-top text-foreground">
                                                {item.name}
                                            </td>
                                            <td className="px-0.5 py-1.5 text-center tabular-nums text-muted-foreground align-top">
                                                {item.quantity}
                                            </td>
                                            <td className="py-1.5 pl-1 pr-1 text-right font-mono text-[11px] tabular-nums text-foreground align-top">
                                                {item.subtotal.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] text-muted-foreground">
                                Subtotal {selectedSale.subtotal.toLocaleString()} · Total <strong className="text-foreground">{CURRENCY} {selectedSale.grandTotal.toLocaleString()}</strong>
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void handlePrint(selectedSale)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                                >
                                    <Printer className="h-3.5 w-3.5" />
                                    Print slip
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goSalesReturn(selectedSale)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold"
                                >
                                    <Undo2 className="h-3.5 w-3.5" />
                                    Sales return
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default SalesHistoryModal;
