import React, { useMemo, useState, useEffect } from 'react';
import {
    AlertCircle,
    Ban,
    BadgePercent,
    CircleAlert,
    Clock,
    ImageOff,
    Lightbulb,
    MoreVertical,
    Ruler,
    ScanBarcode,
    Search,
    SlidersHorizontal,
    Tag,
    Type,
    Upload,
    ImageIcon,
} from 'lucide-react';
import { useInventory } from '../../../context/InventoryContext';
import { InventoryItem } from '../../../types/inventory';
import { CURRENCY, ICONS } from '../../../constants';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { shopApi } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';

const PAGE_SIZE = 25;

type SortKey =
    | 'image'
    | 'sku'
    | 'name'
    | 'barcode'
    | 'category'
    | 'unit'
    | 'costPrice'
    | 'retailPrice'
    | 'reorderPoint'
    | 'onHand'
    | 'missing';

type SalesStatusFilter = 'active' | 'all' | 'deactivated_only';

function missingLabels(item: InventoryItem): string[] {
    const m: string[] = [];
    if (!item.imageUrl?.trim()) m.push('Image');
    if (!item.barcode?.trim()) m.push('Barcode');
    if (!item.name?.trim()) m.push('Name');
    if (!item.sku?.trim()) m.push('SKU');
    if (!item.unit?.trim()) m.push('Unit');
    return m;
}

function grossMarginPercentOnRetail(retail: number, cost: number): number {
    if (retail <= 0) return 0;
    return ((retail - cost) / retail) * 100;
}

function pricingIssueLabels(item: InventoryItem): string[] {
    const retail = item.retailPrice;
    const cost = item.costPrice;
    if (!Number.isFinite(retail) || !Number.isFinite(cost)) return [];
    if (retail < 0 || cost < 0) return [];
    if (retail === 0 && cost === 0) return [];

    if (retail <= cost) {
        return ['Retail ≤ cost'];
    }
    if (retail > 0) {
        const marginPct = grossMarginPercentOnRetail(retail, cost);
        if (marginPct < 5) {
            return ['Margin < 5%'];
        }
    }
    return [];
}

function allIssueLabels(item: InventoryItem): string[] {
    return [...missingLabels(item), ...pricingIssueLabels(item)];
}

function rowIssueLabels(item: InventoryItem): string[] {
    const base = allIssueLabels(item);
    if (item.salesDeactivated) {
        return ['Sales off', ...base];
    }
    return base;
}

function isPricingIssueLabel(label: string): boolean {
    return label === 'Retail ≤ cost' || label === 'Margin < 5%';
}

function issuePillMeta(label: string): { text: string; className: string } {
    if (label === 'Sales off') {
        return {
            text: 'DEACTIVATED',
            className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
        };
    }
    if (isPricingIssueLabel(label)) {
        return {
            text: 'PRICING',
            className: 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-200',
        };
    }
    switch (label) {
        case 'Image':
            return {
                text: 'IMAGE',
                className: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
            };
        case 'Barcode':
            return {
                text: 'BARCODE',
                className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
            };
        case 'Name':
            return {
                text: 'NAME',
                className: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200',
            };
        case 'SKU':
            return {
                text: 'SKU',
                className: 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
            };
        case 'Unit':
            return {
                text: 'UNIT',
                className: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
            };
        default:
            return {
                text: label.toUpperCase(),
                className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
            };
    }
}

/** Dedupe display pills: multiple pricing labels → one PRICING */
function displayIssueKeys(labels: string[]): string[] {
    const out: string[] = [];
    let hasPricing = false;
    for (const l of labels) {
        if (isPricingIssueLabel(l)) {
            hasPricing = true;
            continue;
        }
        if (!out.includes(l)) out.push(l);
    }
    if (hasPricing) out.push('Margin < 5%');
    return out;
}

function isIncompleteServerProduct(item: InventoryItem): boolean {
    if (item.id.startsWith('pending-')) return false;
    return allIssueLabels(item).length > 0;
}

type SummaryIssueFilter = 'all' | 'image' | 'barcode' | 'name' | 'sku' | 'unit' | 'weak_pricing' | 'deactivated';

function matchesSummaryFilter(item: InventoryItem, filter: SummaryIssueFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'weak_pricing') return pricingIssueLabels(item).length > 0;
    if (filter === 'deactivated') return false;
    const labelByFilter: Record<Exclude<SummaryIssueFilter, 'all' | 'weak_pricing' | 'deactivated'>, string> = {
        image: 'Image',
        barcode: 'Barcode',
        name: 'Name',
        sku: 'SKU',
        unit: 'Unit',
    };
    return missingLabels(item).includes(labelByFilter[filter]);
}

function categoryLabel(categories: { id: string; name: string }[], category: string): string {
    if (category === 'General' || !category) return 'General';
    const c = categories.find((x) => x.id === category);
    return c?.name ?? category;
}

function formatPrice(n: number): string {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function formatStatCount(n: number): string {
    return n < 100 ? String(n).padStart(2, '0') : String(n);
}

function formatLastUpdated(ts: number): string {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'JUST NOW';
    const mins = Math.floor(sec / 60);
    if (mins === 1) return '1 MIN AGO';
    return `${mins} MINS AGO`;
}

function stockStatusDot(item: InventoryItem): { dotClass: string } {
    if (item.onHand <= 0) return { dotClass: 'bg-slate-300 dark:bg-slate-600' };
    if (item.reorderPoint > 0 && item.onHand <= item.reorderPoint) {
        return { dotClass: 'bg-amber-500' };
    }
    return { dotClass: 'bg-emerald-500' };
}

function marginPillClass(marginPct: number, retail: number, cost: number): string {
    if (retail <= 0) {
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    }
    if (retail <= cost || marginPct < 5) {
        return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200';
    }
    if (marginPct >= 25) {
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200';
    }
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
}

const IncompleteProductsTab: React.FC = () => {
    const { items, updateItem } = useInventory();
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [search, setSearch] = useState('');
    const [summaryIssueFilter, setSummaryIssueFilter] = useState<SummaryIssueFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState<SalesStatusFilter>('active');
    const [sortKey, setSortKey] = useState<SortKey>('sku');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<{
        sku: string;
        name: string;
        barcode: string;
        category: string;
        unit: string;
        costPrice: number;
        retailPrice: number;
        reorderPoint: number;
        imageUrl?: string;
        salesDeactivated: boolean;
    } | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [page, setPage] = useState(1);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [lastDataAt, setLastDataAt] = useState(() => Date.now());

    useEffect(() => {
        getShopCategoriesOfflineFirst()
            .then((res) => setCategories(Array.isArray(res) ? res : []))
            .catch(() => setCategories([]));
    }, []);

    useEffect(() => {
        setLastDataAt(Date.now());
    }, [items]);

    useEffect(() => {
        setPage(1);
    }, [search, summaryIssueFilter, categoryFilter, salesStatusFilter]);

    const incomplete = useMemo(() => items.filter(isIncompleteServerProduct), [items]);

    const deactivatedSkus = useMemo(
        () => items.filter((i) => !i.id.startsWith('pending-') && i.salesDeactivated === true),
        [items]
    );

    const issueStats = useMemo(() => {
        let missingImage = 0;
        let missingBarcode = 0;
        let missingName = 0;
        let missingSku = 0;
        let missingUnit = 0;
        let pricingRetailLteCost = 0;
        let pricingLowMargin = 0;
        let totalIssueFlags = 0;
        for (const item of incomplete) {
            const field = missingLabels(item);
            const pricing = pricingIssueLabels(item);
            totalIssueFlags += field.length + pricing.length;
            if (field.includes('Image')) missingImage += 1;
            if (field.includes('Barcode')) missingBarcode += 1;
            if (field.includes('Name')) missingName += 1;
            if (field.includes('SKU')) missingSku += 1;
            if (field.includes('Unit')) missingUnit += 1;
            if (pricing.includes('Retail ≤ cost')) pricingRetailLteCost += 1;
            if (pricing.includes('Margin < 5%')) pricingLowMargin += 1;
        }
        return {
            totalSkus: incomplete.length,
            missingImage,
            missingBarcode,
            missingName,
            missingSku,
            missingUnit,
            pricingRetailLteCost,
            pricingLowMargin,
            pricingSkus: pricingRetailLteCost + pricingLowMargin,
            totalIssueFlags,
            deactivatedCount: deactivatedSkus.length,
        };
    }, [incomplete, deactivatedSkus]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        if (summaryIssueFilter === 'deactivated') {
            let rows = deactivatedSkus;
            if (categoryFilter !== 'all') {
                rows = rows.filter((i) => (i.category || 'General') === categoryFilter);
            }
            if (q) {
                rows = rows.filter(
                    (i) =>
                        i.sku.toLowerCase().includes(q) ||
                        i.name.toLowerCase().includes(q) ||
                        (i.barcode && i.barcode.toLowerCase().includes(q))
                );
            }
            return rows;
        }

        let rows = incomplete.filter((i) => matchesSummaryFilter(i, summaryIssueFilter));

        if (categoryFilter !== 'all') {
            rows = rows.filter((i) => (i.category || 'General') === categoryFilter);
        }

        if (salesStatusFilter === 'active') {
            rows = rows.filter((i) => !i.salesDeactivated);
        } else if (salesStatusFilter === 'deactivated_only') {
            rows = rows.filter((i) => i.salesDeactivated === true);
        }

        if (!q) return rows;
        return rows.filter(
            (i) =>
                i.sku.toLowerCase().includes(q) ||
                i.name.toLowerCase().includes(q) ||
                (i.barcode && i.barcode.toLowerCase().includes(q))
        );
    }, [incomplete, deactivatedSkus, search, summaryIssueFilter, categoryFilter, salesStatusFilter]);

    const sorted = useMemo(() => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const compare = (a: InventoryItem, b: InventoryItem): number => {
            const num = (x: number, y: number) => (x === y ? 0 : x < y ? -dir : dir);
            switch (sortKey) {
                case 'image': {
                    const ai = a.imageUrl?.trim() ? 1 : 0;
                    const bi = b.imageUrl?.trim() ? 1 : 0;
                    return num(ai, bi);
                }
                case 'sku':
                    return a.sku.localeCompare(b.sku, undefined, { sensitivity: 'base' }) * dir;
                case 'name':
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * dir;
                case 'barcode':
                    return (a.barcode || '').localeCompare(b.barcode || '', undefined, { sensitivity: 'base' }) * dir;
                case 'category':
                    return (
                        categoryLabel(categories, a.category).localeCompare(
                            categoryLabel(categories, b.category),
                            undefined,
                            { sensitivity: 'base' }
                        ) * dir
                    );
                case 'unit':
                    return (a.unit || '').localeCompare(b.unit || '', undefined, { sensitivity: 'base' }) * dir;
                case 'costPrice':
                    return num(a.costPrice, b.costPrice);
                case 'retailPrice':
                    return num(a.retailPrice, b.retailPrice);
                case 'reorderPoint':
                    return num(a.reorderPoint, b.reorderPoint);
                case 'onHand':
                    return num(a.onHand, b.onHand);
                case 'missing':
                    return rowIssueLabels(a).join(', ').localeCompare(rowIssueLabels(b).join(', '), undefined, {
                        sensitivity: 'base',
                    }) * dir;
                default:
                    return 0;
            }
        };
        return [...filtered].sort(compare);
    }, [filtered, sortKey, sortDir, categories]);

    const totalEntries = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const pageSlice = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE;
        return sorted.slice(start, start + PAGE_SIZE);
    }, [sorted, safePage]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const startEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setDraft({
            sku: item.sku,
            name: item.name,
            barcode: item.barcode || '',
            category: item.category || 'General',
            unit: item.unit,
            costPrice: item.costPrice,
            retailPrice: item.retailPrice,
            reorderPoint: item.reorderPoint,
            imageUrl: item.imageUrl,
            salesDeactivated: item.salesDeactivated === true,
        });
        setImageFile(null);
        setImagePreview(item.imageUrl || null);
    };

    const cancelEdit = () => {
        if (imagePreview && imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
        setEditingId(null);
        setDraft(null);
        setImageFile(null);
        setImagePreview(null);
    };

    const handleSave = async () => {
        if (!editingId || !draft) return;
        if (!draft.name?.trim()) {
            alert('Product name is required.');
            return;
        }
        setSaving(true);
        try {
            let imageUrl = draft.imageUrl;
            if (imageFile) {
                const uploadRes = await shopApi.uploadImage(imageFile);
                imageUrl = getFullImageUrl(uploadRes.imageUrl) || '';
            }
            await updateItem(editingId, {
                sku: draft.sku,
                name: draft.name.trim(),
                barcode: draft.barcode.trim() || undefined,
                category: draft.category,
                unit: draft.unit.trim() || 'pcs',
                costPrice: draft.costPrice,
                retailPrice: draft.retailPrice,
                reorderPoint: draft.reorderPoint,
                imageUrl,
                salesDeactivated: draft.salesDeactivated,
            });
            cancelEdit();
        } catch {
            /* updateItem already alerted */
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = () => {
        const headers = ['SKU', 'Name', 'Barcode', 'Category', 'Unit', 'Retail', 'Cost', 'Stock', 'Issues'];
        const lines = [
            headers.join(','),
            ...sorted.map((item) => {
                const issues = rowIssueLabels(item).join('; ');
                const vals = [
                    item.sku,
                    `"${(item.name || '').replace(/"/g, '""')}"`,
                    item.barcode || '',
                    categoryLabel(categories, item.category),
                    item.unit || '',
                    item.retailPrice,
                    item.costPrice,
                    item.onHand,
                    `"${issues.replace(/"/g, '""')}"`,
                ];
                return vals.join(',');
            }),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `incomplete-skus-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const SortTh = ({ label, field }: { label: string; field: SortKey }) => (
        <th
            className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-slate-100/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95 dark:text-slate-400"
            onClick={() => toggleSort(field)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {advancedOpen &&
                    (sortKey === field
                        ? React.cloneElement((sortDir === 'asc' ? ICONS.arrowUp : ICONS.arrowDown) as React.ReactElement, {
                              width: 12,
                              height: 12,
                          })
                        : React.cloneElement(ICONS.arrowUpDown as React.ReactElement, {
                              width: 12,
                              height: 12,
                              className: 'opacity-35',
                          }))}
            </span>
        </th>
    );

    const statCardBase =
        'rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600';
    const statCardActive = 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#f4f6fa] dark:ring-offset-slate-900';

    const issueSelectValue =
        summaryIssueFilter === 'deactivated' ? 'deactivated' : summaryIssueFilter === 'all' ? 'all' : summaryIssueFilter;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f4f6fa] dark:bg-slate-950/40">
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
                {/* Page header */}
                <header className="flex flex-shrink-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                                Incomplete SKUs
                            </h1>
                            <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900"
                                title="SKUs with missing catalog fields, weak pricing (margin under 5% or retail at/below cost), or deactivated for sales. Counts by issue can exceed unique SKUs when one product has multiple gaps."
                            >
                                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                            </span>
                        </div>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            Identify and fix catalog issues affecting sales and operations.
                        </p>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:mt-0">
                        <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                        Last updated: {formatLastUpdated(lastDataAt)}
                    </div>
                </header>

                {/* Summary cards */}
                <section className="grid flex-shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,280px)_1fr]">
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            aria-pressed={summaryIssueFilter === 'all'}
                            onClick={() => setSummaryIssueFilter('all')}
                            className={`flex min-h-[140px] flex-col justify-between rounded-2xl bg-gradient-to-br from-[#5b4fd4] to-[#7c6ae8] p-5 text-left text-white shadow-md transition hover:brightness-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                                summaryIssueFilter === 'all' ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-[#f4f6fa] dark:ring-offset-slate-900' : ''
                            }`}
                        >
                            <CircleAlert className="h-8 w-8 opacity-90" strokeWidth={2} />
                            <div>
                                <p className="text-4xl font-bold tabular-nums tracking-tight">{issueStats.totalSkus}</p>
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/85">SKUs to fix</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            aria-pressed={summaryIssueFilter === 'deactivated'}
                            onClick={() => setSummaryIssueFilter('deactivated')}
                            className={`${statCardBase} flex items-center gap-3 py-3 ${
                                summaryIssueFilter === 'deactivated' ? statCardActive : ''
                            }`}
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                                <Ban className="h-5 w-5" strokeWidth={2} />
                            </span>
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                                    {formatStatCount(issueStats.deactivatedCount)}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Deactivated
                                </p>
                            </div>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {(
                            [
                                {
                                    id: 'image' as const,
                                    label: 'No image',
                                    short: 'No image',
                                    value: issueStats.missingImage,
                                    icon: ImageOff,
                                    iconClass: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400',
                                },
                                {
                                    id: 'barcode' as const,
                                    label: 'No barcode',
                                    short: 'No barcode',
                                    value: issueStats.missingBarcode,
                                    icon: ScanBarcode,
                                    iconClass: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400',
                                },
                                {
                                    id: 'name' as const,
                                    label: 'No name',
                                    short: 'No name',
                                    value: issueStats.missingName,
                                    icon: Type,
                                    iconClass: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400',
                                },
                                {
                                    id: 'sku' as const,
                                    label: 'No SKU',
                                    short: 'No SKU',
                                    value: issueStats.missingSku,
                                    icon: Tag,
                                    iconClass: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
                                },
                                {
                                    id: 'unit' as const,
                                    label: 'No unit',
                                    short: 'No unit',
                                    value: issueStats.missingUnit,
                                    icon: Ruler,
                                    iconClass: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
                                },
                                {
                                    id: 'weak_pricing' as const,
                                    label: 'Weak pricing',
                                    short: 'Weak pricing',
                                    value: issueStats.pricingSkus,
                                    icon: BadgePercent,
                                    iconClass: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400',
                                },
                            ] as const
                        ).map((c) => {
                            const Icon = c.icon;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={summaryIssueFilter === c.id}
                                    aria-label={c.label}
                                    onClick={() => setSummaryIssueFilter(c.id)}
                                    className={`${statCardBase} flex flex-col gap-2 ${summaryIssueFilter === c.id ? statCardActive : ''}`}
                                >
                                    <span
                                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.iconClass}`}
                                    >
                                        <Icon className="h-4 w-4" strokeWidth={2} />
                                    </span>
                                    <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                                        {formatStatCount(c.value)}
                                    </p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {c.short}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Info banner */}
                <div className="flex flex-shrink-0 items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/35 dark:text-sky-100">
                    <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" strokeWidth={2} />
                    <p>
                        Some products have multiple issues. Fixing one may resolve others automatically.
                    </p>
                </div>

                {/* Toolbar */}
                <div className="flex flex-shrink-0 flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950 lg:flex-row lg:flex-wrap lg:items-center">
                    <div className="relative min-w-[200px] flex-1 lg:max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                            placeholder="Search by SKU"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="Category filter"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="all">All categories</option>
                            <option value="General">General</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>

                        <select
                            aria-label="Issue type filter"
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            value={issueSelectValue}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'all') setSummaryIssueFilter('all');
                                else if (v === 'deactivated') setSummaryIssueFilter('deactivated');
                                else setSummaryIssueFilter(v as SummaryIssueFilter);
                            }}
                        >
                            <option value="all">All issues</option>
                            <option value="image">No image</option>
                            <option value="barcode">No barcode</option>
                            <option value="name">No name</option>
                            <option value="sku">No SKU</option>
                            <option value="unit">No unit</option>
                            <option value="weak_pricing">Weak pricing</option>
                            <option value="deactivated">Deactivated</option>
                        </select>

                        <select
                            aria-label="Sales status filter"
                            disabled={summaryIssueFilter === 'deactivated'}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            value={salesStatusFilter}
                            onChange={(e) => setSalesStatusFilter(e.target.value as SalesStatusFilter)}
                        >
                            <option value="active">Active</option>
                            <option value="all">All statuses</option>
                            <option value="deactivated_only">Deactivated only</option>
                        </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled
                            className="rounded-xl border-slate-200 bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                            title="Bulk fix coming soon"
                        >
                            Bulk fix
                        </Button>
                        <button
                            type="button"
                            onClick={exportCsv}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            title="Export CSV"
                        >
                            <Upload className="h-4 w-4" strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((o) => !o)}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                                advancedOpen
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                            }`}
                        >
                            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                            Advanced
                        </button>
                    </div>
                </div>

                {advancedOpen && (
                    <p className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        Advanced: extra reorder column and sort direction hints on headers. Weak pricing means retail at or
                        below cost, or gross margin on retail under 5%. Deactivated lists all SKUs hidden from POS and mobile.
                    </p>
                )}

                {/* Table */}
                <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
                        <table className="w-full min-w-[900px] text-left">
                            <thead>
                                <tr>
                                    <SortTh label="Product" field="name" />
                                    <SortTh label="Barcode" field="barcode" />
                                    <SortTh label="Category" field="category" />
                                    <SortTh label="Unit" field="unit" />
                                    <SortTh label="Price / cost" field="retailPrice" />
                                    <SortTh label="Stock" field="onHand" />
                                    {advancedOpen && <SortTh label="Reorder" field="reorderPoint" />}
                                    <SortTh label="Issues" field="missing" />
                                    <th className="sticky top-0 z-10 bg-slate-100/95 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/95 dark:text-slate-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pageSlice.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={advancedOpen ? 9 : 8}
                                            className="px-6 py-16 text-center text-sm text-slate-500 dark:text-slate-400"
                                        >
                                            {summaryIssueFilter === 'deactivated' && deactivatedSkus.length === 0
                                                ? 'No SKUs are deactivated for sales.'
                                                : incomplete.length === 0 && summaryIssueFilter !== 'deactivated'
                                                  ? 'No catalog issues — data is complete and pricing meets margin rules where prices apply.'
                                                  : search.trim() !== ''
                                                    ? 'No rows match your search.'
                                                    : summaryIssueFilter !== 'all'
                                                      ? 'No SKUs match this filter.'
                                                      : 'No rows to show.'}
                                        </td>
                                    </tr>
                                ) : (
                                    pageSlice.map((item) => {
                                        const editing = editingId === item.id && draft;
                                        const rawIssues = rowIssueLabels(item);
                                        const displayKeys = displayIssueKeys(rawIssues);
                                        const pills = displayKeys.map(issuePillMeta);
                                        const visible = pills.slice(0, 3);
                                        const more = pills.length - visible.length;
                                        const marginPct = grossMarginPercentOnRetail(item.retailPrice, item.costPrice);
                                        const { dotClass } = stockStatusDot(item);

                                        return (
                                            <tr key={item.id} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-900/50">
                                                <td className="px-4 py-3">
                                                    {editing ? (
                                                        <div className="flex gap-3">
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
                                                                    {imagePreview ? (
                                                                        <img
                                                                            src={imagePreview}
                                                                            alt=""
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <ImageIcon className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                                                                    )}
                                                                </div>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    aria-label="Upload product image"
                                                                    title="Upload product image"
                                                                    className="max-w-[120px] text-[10px]"
                                                                    onChange={(e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (file) {
                                                                            setImageFile(file);
                                                                            if (imagePreview?.startsWith('blob:'))
                                                                                URL.revokeObjectURL(imagePreview);
                                                                            setImagePreview(URL.createObjectURL(file));
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="min-w-0 flex-1 space-y-2">
                                                                <Input
                                                                    compact
                                                                    value={draft.name}
                                                                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                                                    placeholder="Name"
                                                                />
                                                                <Input
                                                                    compact
                                                                    value={draft.sku}
                                                                    onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                                                                    placeholder="SKU"
                                                                    className="font-mono text-xs"
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-3">
                                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
                                                                {item.imageUrl ? (
                                                                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                                                ) : (
                                                                    <ImageIcon className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-slate-900 dark:text-white">
                                                                    {item.name || '—'}
                                                                </p>
                                                                <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                                                                    {item.sku || '—'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-sm">
                                                    {editing ? (
                                                        <Input
                                                            compact
                                                            value={draft.barcode}
                                                            onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                                                        />
                                                    ) : item.barcode?.trim() ? (
                                                        item.barcode
                                                    ) : (
                                                        <span className="font-bold text-red-600 dark:text-red-400">MISSING</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                                                    {editing ? (
                                                        <select
                                                            aria-label="Category"
                                                            title="Category"
                                                            className="block w-full min-w-[140px] rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-900"
                                                            value={draft.category || 'General'}
                                                            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                                                        >
                                                            <option value="General">General</option>
                                                            {categories.map((cat) => (
                                                                <option key={cat.id} value={cat.id}>
                                                                    {cat.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        categoryLabel(categories, item.category)
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {editing ? (
                                                        <Input
                                                            compact
                                                            value={draft.unit}
                                                            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                                                        />
                                                    ) : item.unit?.trim() ? (
                                                        item.unit
                                                    ) : (
                                                        <span className="font-bold text-red-600 dark:text-red-400">MISSING</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {editing ? (
                                                        <div className="flex flex-col gap-2">
                                                            <Input
                                                                compact
                                                                type="number"
                                                                value={draft.retailPrice}
                                                                onChange={(e) =>
                                                                    setDraft({ ...draft, retailPrice: Number(e.target.value) })
                                                                }
                                                                placeholder="Retail"
                                                            />
                                                            <Input
                                                                compact
                                                                type="number"
                                                                value={draft.costPrice}
                                                                onChange={(e) =>
                                                                    setDraft({ ...draft, costPrice: Number(e.target.value) })
                                                                }
                                                                placeholder="Cost"
                                                            />
                                                            <Input
                                                                compact
                                                                type="number"
                                                                value={draft.reorderPoint}
                                                                onChange={(e) =>
                                                                    setDraft({ ...draft, reorderPoint: Number(e.target.value) })
                                                                }
                                                                placeholder="Reorder point"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <div>
                                                                <p className="font-semibold text-slate-900 dark:text-white">
                                                                    {CURRENCY} {formatPrice(item.retailPrice)}
                                                                </p>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                    C: {CURRENCY} {formatPrice(item.costPrice)}
                                                                </p>
                                                            </div>
                                                            <span
                                                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${marginPillClass(
                                                                    marginPct,
                                                                    item.retailPrice,
                                                                    item.costPrice
                                                                )}`}
                                                            >
                                                                {item.retailPrice > 0
                                                                    ? `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(1)}%`
                                                                    : '—'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {editing ? (
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                                On hand
                                                            </p>
                                                            <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
                                                                {item.onHand}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                                                            <span className="font-mono text-sm text-slate-800 dark:text-slate-200">
                                                                {item.onHand}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                {advancedOpen && (
                                                    <td className="px-4 py-3 text-sm">
                                                        {editing ? (
                                                            <Input
                                                                compact
                                                                type="number"
                                                                value={draft.reorderPoint}
                                                                onChange={(e) =>
                                                                    setDraft({ ...draft, reorderPoint: Number(e.target.value) })
                                                                }
                                                            />
                                                        ) : (
                                                            item.reorderPoint
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3">
                                                    <div className="flex max-w-[220px] flex-wrap items-center gap-1">
                                                        {visible.map((pill, pi) => (
                                                            <span
                                                                key={`${item.id}-pill-${pi}-${pill.text}`}
                                                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill.className}`}
                                                            >
                                                                {pill.text}
                                                            </span>
                                                        ))}
                                                        {more > 0 && (
                                                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                                +{more} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                                    {editing ? (
                                                        <div className="flex max-w-[220px] flex-col items-end gap-2">
                                                            <label className="flex cursor-pointer items-start gap-2 text-left text-xs text-slate-800 dark:text-slate-200">
                                                                <input
                                                                    type="checkbox"
                                                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                                                                    checked={!draft.salesDeactivated}
                                                                    onChange={(e) =>
                                                                        setDraft({
                                                                            ...draft,
                                                                            salesDeactivated: !e.target.checked,
                                                                        })
                                                                    }
                                                                />
                                                                <span>
                                                                    <span className="font-medium">Available for sale</span>
                                                                    <span className="mt-0.5 block text-[10px] text-slate-500">
                                                                        POS &amp; mobile shop
                                                                    </span>
                                                                </span>
                                                            </label>
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="secondary"
                                                                    size="sm"
                                                                    onClick={cancelEdit}
                                                                    disabled={saving}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                                <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                                                                    {saving ? 'Saving…' : 'Save'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                className="rounded-lg bg-indigo-600 px-3 hover:bg-indigo-700"
                                                                onClick={() => startEdit(item)}
                                                            >
                                                                Fix
                                                            </Button>
                                                            <details className="relative">
                                                                <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                                                                    <MoreVertical className="h-4 w-4" strokeWidth={2} />
                                                                </summary>
                                                                <div className="absolute right-0 z-20 mt-1 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                                                                    <button
                                                                        type="button"
                                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                                                                        onClick={() => startEdit(item)}
                                                                    >
                                                                        Fix
                                                                    </button>
                                                                </div>
                                                            </details>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalEntries > 0 && (
                        <footer className="flex flex-shrink-0 flex-col items-stretch justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center">
                            <p>
                                Showing {(safePage - 1) * PAGE_SIZE + 1} to{' '}
                                {Math.min(safePage * PAGE_SIZE, totalEntries)} of {totalEntries} entries
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
                                >
                                    ‹
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter((n) => {
                                        if (totalPages <= 7) return true;
                                        if (n === 1 || n === totalPages) return true;
                                        if (Math.abs(n - safePage) <= 1) return true;
                                        return false;
                                    })
                                    .map((n, idx, arr) => {
                                        const prev = arr[idx - 1];
                                        const showEllipsis = prev && n - prev > 1;
                                        return (
                                            <React.Fragment key={n}>
                                                {showEllipsis && <span className="px-1 text-slate-400">…</span>}
                                                <button
                                                    type="button"
                                                    onClick={() => setPage(n)}
                                                    className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 text-center text-sm font-medium ${
                                                        n === safePage
                                                            ? 'bg-indigo-600 text-white shadow-sm'
                                                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                                    }`}
                                                >
                                                    {n}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}
                                <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:enabled:hover:bg-slate-800"
                                >
                                    ›
                                </button>
                            </div>
                        </footer>
                    )}
                </div>
            </div>
        </div>
    );
};

export default IncompleteProductsTab;
