import React, { useMemo, useState, useEffect } from 'react';
import { useInventory } from '../../../context/InventoryContext';
import { InventoryItem } from '../../../types/inventory';
import { CURRENCY, ICONS } from '../../../constants';
import Card from '../../ui/Card';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { shopApi } from '../../../services/shopApi';
import { getShopCategoriesOfflineFirst } from '../../../services/categoriesOfflineCache';
import { getFullImageUrl } from '../../../config/apiUrl';

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

function missingLabels(item: InventoryItem): string[] {
    const m: string[] = [];
    if (!item.imageUrl?.trim()) m.push('Image');
    if (!item.barcode?.trim()) m.push('Barcode');
    if (!item.name?.trim()) m.push('Name');
    if (!item.sku?.trim()) m.push('SKU');
    if (!item.unit?.trim()) m.push('Unit');
    return m;
}

/** Gross margin on retail: (retail − cost) / retail × 100 when retail > 0. */
function grossMarginPercentOnRetail(retail: number, cost: number): number {
    if (retail <= 0) return 0;
    return ((retail - cost) / retail) * 100;
}

/**
 * Cost and retail are both set (non-trivial) but pricing is weak: retail at/below cost,
 * or margin on retail is strictly under 5%.
 */
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

function isPricingIssueLabel(label: string): boolean {
    return label === 'Retail ≤ cost' || label === 'Margin < 5%';
}

function isIncompleteServerProduct(item: InventoryItem): boolean {
    if (item.id.startsWith('pending-')) return false;
    return allIssueLabels(item).length > 0;
}

function categoryLabel(categories: { id: string; name: string }[], category: string): string {
    if (category === 'General' || !category) return 'General';
    const c = categories.find((x) => x.id === category);
    return c?.name ?? category;
}

const IncompleteProductsTab: React.FC = () => {
    const { items, updateItem } = useInventory();
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [search, setSearch] = useState('');
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
    } | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getShopCategoriesOfflineFirst()
            .then((res) => setCategories(Array.isArray(res) ? res : []))
            .catch(() => setCategories([]));
    }, []);

    const incomplete = useMemo(() => items.filter(isIncompleteServerProduct), [items]);

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
        };
    }, [incomplete]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return incomplete;
        return incomplete.filter(
            (i) =>
                i.sku.toLowerCase().includes(q) ||
                i.name.toLowerCase().includes(q) ||
                (i.barcode && i.barcode.toLowerCase().includes(q))
        );
    }, [incomplete, search]);

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
                    return allIssueLabels(a).join(', ').localeCompare(allIssueLabels(b).join(', '), undefined, {
                        sensitivity: 'base',
                    }) * dir;
                default:
                    return 0;
            }
        };
        return [...filtered].sort(compare);
    }, [filtered, sortKey, sortDir, categories]);

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
            });
            cancelEdit();
        } catch {
            /* updateItem already alerted */
        } finally {
            setSaving(false);
        }
    };

    const SortTh = ({ label, field }: { label: string; field: SortKey }) => (
        <th
            className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-muted/80 px-3 py-3 text-left text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
            onClick={() => toggleSort(field)}
        >
            <span className="inline-flex items-center gap-1">
                {label}
                {sortKey === field
                    ? React.cloneElement((sortDir === 'asc' ? ICONS.arrowUp : ICONS.arrowDown) as React.ReactElement, {
                          width: 14,
                          height: 14,
                      })
                    : React.cloneElement(ICONS.arrowUpDown as React.ReactElement, {
                          width: 14,
                          height: 14,
                          className: 'opacity-40',
                      })}
            </span>
        </th>
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="grid flex-shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SKUs to fix</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{issueStats.totalSkus}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {issueStats.totalIssueFlags > 0
                            ? `${issueStats.totalIssueFlags} issue${issueStats.totalIssueFlags === 1 ? '' : 's'} total`
                            : 'All clear'}
                    </p>
                </div>
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-200/90">No image</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-100">
                        {issueStats.missingImage}
                    </p>
                    <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">Products affected</p>
                </div>
                <div className="rounded-xl border border-sky-200/80 bg-sky-50/80 p-4 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-200/90">No barcode</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-950 dark:text-sky-100">
                        {issueStats.missingBarcode}
                    </p>
                    <p className="mt-1 text-xs text-sky-800/80 dark:text-sky-200/70">Products affected</p>
                </div>
                <div className="rounded-xl border border-violet-200/80 bg-violet-50/80 p-4 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-200/90">No name</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-violet-950 dark:text-violet-100">
                        {issueStats.missingName}
                    </p>
                    <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/70">Products affected</p>
                </div>
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-200/90">No SKU</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-950 dark:text-rose-100">
                        {issueStats.missingSku}
                    </p>
                    <p className="mt-1 text-xs text-rose-800/80 dark:text-rose-200/70">Products affected</p>
                </div>
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200/90">No unit</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">
                        {issueStats.missingUnit}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/70">Products affected</p>
                </div>
                <div className="rounded-xl border border-orange-200/80 bg-orange-50/80 p-4 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-800 dark:text-orange-200/90">
                        Weak pricing
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-orange-950 dark:text-orange-100">
                        {issueStats.pricingSkus}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-orange-800/85 dark:text-orange-200/75">
                        {issueStats.pricingSkus === 0
                            ? 'Retail above cost, margin at least 5%'
                            : `${issueStats.pricingRetailLteCost} retail ≤ cost · ${issueStats.pricingLowMargin} margin under 5%`}
                    </p>
                </div>
            </div>
            <p className="flex-shrink-0 text-xs text-muted-foreground">
                Per-issue counts can add up to more than “SKUs to fix” because one product may have several gaps at once. Weak
                pricing applies when cost and retail are set: retail at or below cost, or gross margin on retail is under 5%.
            </p>
            <div className="flex flex-shrink-0 flex-wrap items-start gap-4">
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Lists SKUs with missing catalog fields (image, barcode, name, SKU, unit) or weak pricing (retail at/below
                    cost, or gross margin on retail under 5%). Sort any column, edit a row, then save — rows drop off when
                    issues are resolved.
                </p>
                <div className="relative ml-auto min-w-[200px] max-w-md flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                        {ICONS.search}
                    </div>
                    <input
                        type="text"
                        className="block w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:placeholder:text-slate-500"
                        placeholder="Search SKU, name, barcode…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-none shadow-sm">
                <div className="custom-scrollbar min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
                    <table className="w-full min-w-[960px] text-left">
                        <thead className="text-xs font-semibold uppercase text-muted-foreground">
                            <tr>
                                <SortTh label="Image" field="image" />
                                <SortTh label="SKU" field="sku" />
                                <SortTh label="Name" field="name" />
                                <SortTh label="Barcode" field="barcode" />
                                <SortTh label="Category" field="category" />
                                <SortTh label="Unit" field="unit" />
                                <SortTh label={`Cost (${CURRENCY})`} field="costPrice" />
                                <SortTh label={`Retail (${CURRENCY})`} field="retailPrice" />
                                <SortTh label="Reorder" field="reorderPoint" />
                                <SortTh label="On hand" field="onHand" />
                                <SortTh label="Issues" field="missing" />
                                <th className="sticky top-0 z-10 bg-muted/80 px-3 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sorted.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-6 py-16 text-center text-sm text-muted-foreground">
                                        {incomplete.length === 0
                                            ? 'No issues — field data is complete and retail is above cost with at least 5% gross margin on retail (where prices apply).'
                                            : 'No rows match your search.'}
                                    </td>
                                </tr>
                            ) : (
                                sorted.map((item) => {
                                    const editing = editingId === item.id && draft;
                                    const issues = allIssueLabels(item);
                                    return (
                                        <tr key={item.id} className="align-top hover:bg-muted/30">
                                            <td className="px-3 py-3">
                                                {editing ? (
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                                                            {imagePreview ? (
                                                                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                                                            ) : (
                                                                React.cloneElement(ICONS.image as React.ReactElement, {
                                                                    size: 24,
                                                                    className: 'text-slate-300 dark:text-slate-500',
                                                                })
                                                            )}
                                                        </div>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            aria-label="Upload product image"
                                                            title="Upload product image"
                                                            className="max-w-[140px] text-xs"
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
                                                ) : (
                                                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                                                        {item.imageUrl ? (
                                                            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                                        ) : (
                                                            React.cloneElement(ICONS.image as React.ReactElement, {
                                                                size: 22,
                                                                className: 'text-slate-300 dark:text-slate-500',
                                                            })
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 font-mono text-sm">
                                                {editing ? (
                                                    <div className="min-w-[120px]">
                                                        <Input
                                                            compact
                                                            value={draft.sku}
                                                            onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                                                        />
                                                    </div>
                                                ) : (
                                                    item.sku || '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm">
                                                {editing ? (
                                                    <Input
                                                        compact
                                                        value={draft.name}
                                                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                                    />
                                                ) : (
                                                    item.name || '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-3 font-mono text-sm">
                                                {editing ? (
                                                    <Input
                                                        compact
                                                        value={draft.barcode}
                                                        onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                                                    />
                                                ) : (
                                                    item.barcode || '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm">
                                                {editing ? (
                                                    <select
                                                        aria-label="Category"
                                                        title="Category"
                                                        className="block w-full min-w-[140px] rounded-md border border-gray-300 bg-card px-2 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-900"
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
                                            <td className="px-3 py-3 text-sm">
                                                {editing ? (
                                                    <Input
                                                        compact
                                                        value={draft.unit}
                                                        onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                                                    />
                                                ) : (
                                                    item.unit || '—'
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm">
                                                {editing ? (
                                                    <Input
                                                        compact
                                                        type="number"
                                                        value={draft.costPrice}
                                                        onChange={(e) =>
                                                            setDraft({ ...draft, costPrice: Number(e.target.value) })
                                                        }
                                                    />
                                                ) : (
                                                    item.costPrice
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm">
                                                {editing ? (
                                                    <Input
                                                        compact
                                                        type="number"
                                                        value={draft.retailPrice}
                                                        onChange={(e) =>
                                                            setDraft({ ...draft, retailPrice: Number(e.target.value) })
                                                        }
                                                    />
                                                ) : (
                                                    item.retailPrice
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-sm">
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
                                            <td className="px-3 py-3 font-mono text-sm text-muted-foreground">{item.onHand}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex max-w-[220px] flex-wrap gap-1">
                                                    {issues.map((label) => (
                                                        <span
                                                            key={label}
                                                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                                isPricingIssueLabel(label)
                                                                    ? 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                                                            }`}
                                                        >
                                                            {label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right whitespace-nowrap">
                                                {editing ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button type="button" variant="secondary" size="sm" onClick={cancelEdit} disabled={saving}>
                                                            Cancel
                                                        </Button>
                                                        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
                                                            {saving ? 'Saving…' : 'Save'}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(item)}>
                                                        Edit
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default IncompleteProductsTab;
