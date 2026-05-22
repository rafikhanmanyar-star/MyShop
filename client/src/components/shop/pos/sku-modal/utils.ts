import type { InventoryItem } from '../../../../types/inventory';
import type { ShopProductCategory } from '../../../../services/shopApi';
import type { SkuFormValues } from './types';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const WEIGHT_UNIT_PRESETS = [
    { value: 'g', label: 'g' },
    { value: 'kg', label: 'kg' },
    { value: 'mL', label: 'mL' },
    { value: 'L', label: 'L' },
    { value: 'oz', label: 'oz' },
    { value: 'lb', label: 'lb' }
];

export const UNIT_OPTIONS: { value: string; label: string }[] = [
    { value: 'pcs', label: 'Piece (pcs)' },
    { value: 'BTL', label: 'Bottle (BTL)' },
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'L', label: 'Litre (L)' },
    { value: 'mL', label: 'Millilitre (mL)' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'dozen', label: 'Dozen' }
];

export const defaultSkuFormValues: SkuFormValues = {
    sku: '',
    barcode: '',
    name: '',
    description: '',
    mobileDescription: '',
    category: 'General',
    subcategoryId: '',
    retailPrice: 0,
    costPrice: 0,
    wholesalePrice: 0,
    taxRate: 0,
    retailPriceMode: 'fixed',
    retailMarkupPercent: 0,
    reorderPoint: 10,
    unit: 'pcs',
    imageUrl: '',
    salesDeactivated: false,
    trackInventory: true,
    brand: '',
    brandId: '',
    weight: '',
    weightUnit: 'g',
    size: '',
    color: '',
    material: '',
    originCountry: '',
    tags: [],
    collection: '',
    customAttrRows: []
};

export function attrsToRows(
    a: Record<string, string | number | boolean> | null | undefined
): { key: string; value: string }[] {
    if (!a) return [];
    return Object.entries(a).map(([key, value]) => ({ key, value: String(value) }));
}

export function rowsToAttrs(
    rows: { key: string; value: string }[]
): Record<string, string | number | boolean> | null {
    const out: Record<string, string | number | boolean> = {};
    for (const { key, value } of rows) {
        const k = key.trim();
        if (!k) continue;
        const v = value.trim();
        if (!v) continue;
        if (/^-?\d+$/.test(v)) {
            out[k] = parseInt(v, 10);
        } else if (/^-?\d+\.\d+$/.test(v)) {
            out[k] = parseFloat(v);
        } else if (v === 'true' || v === 'false') {
            out[k] = v === 'true';
        } else {
            out[k] = v;
        }
    }
    return Object.keys(out).length ? out : null;
}

export function parseWeightForSave(weightStr: string): number | null {
    const t = weightStr.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n;
}

export function parseNonNegativeNumber(raw: string): number {
    if (raw === '' || raw === '-') return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

export function deriveCategoryFormFromItem(
    item: InventoryItem,
    cats: ShopProductCategory[]
): Pick<SkuFormValues, 'category' | 'subcategoryId'> {
    if (!item.category || item.category === 'General') {
        return { category: 'General', subcategoryId: '' };
    }
    if (item.subcategoryId) {
        return { category: item.category, subcategoryId: item.subcategoryId };
    }
    const byId = new Map(cats.map((c) => [c.id, c]));
    const node = byId.get(item.category);
    if (!node) {
        return { category: 'General', subcategoryId: '' };
    }
    if (node.parent_id) {
        return { category: node.parent_id, subcategoryId: node.id };
    }
    return { category: node.id, subcategoryId: '' };
}

export function itemToFormValues(item: InventoryItem): SkuFormValues {
    const desc = item.description || '';
    return {
        sku: item.sku,
        barcode: item.barcode || '',
        name: item.name,
        description: desc,
        mobileDescription: desc,
        category: item.category || 'General',
        subcategoryId: item.subcategoryId || '',
        retailPrice: Math.max(0, item.retailPrice ?? 0),
        costPrice: Math.max(0, item.costPrice ?? 0),
        wholesalePrice: 0,
        taxRate: item.taxRate ?? 0,
        retailPriceMode: 'fixed',
        retailMarkupPercent: 0,
        reorderPoint: item.reorderPoint ?? 10,
        unit: item.unit || 'pcs',
        imageUrl: item.imageUrl || '',
        salesDeactivated: item.salesDeactivated === true,
        trackInventory: true,
        brand: item.brand || '',
        brandId: item.brandId || '',
        weight:
            item.weight != null && Number.isFinite(item.weight) ? String(item.weight) : '',
        weightUnit: item.weightUnit || 'g',
        size: item.size || '',
        color: item.color || '',
        material: item.material || '',
        originCountry: item.originCountry || '',
        tags: [],
        collection: '',
        customAttrRows: attrsToRows(item.attributes ?? undefined)
    };
}

export function generateSkuCode(name: string): string {
    const base = name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    return base ? `${base}-${Date.now().toString(36).slice(-4).toUpperCase()}` : `SKU-${Date.now()}`;
}

export function grossMarginPercent(retail: number, cost: number): number | null {
    if (!Number.isFinite(retail) || retail <= 0) return null;
    return ((retail - cost) / retail) * 100;
}

export function profitPerItem(retail: number, cost: number): number {
    return Math.max(0, Math.round((retail - cost) * 100) / 100);
}

export type StockHealth = 'healthy' | 'low' | 'out';

export function stockHealth(
    available: number,
    reorderPoint: number
): StockHealth {
    if (available <= 0) return 'out';
    if (available <= reorderPoint) return 'low';
    return 'healthy';
}

const DRAFT_KEY = 'myshop-sku-draft';

export function loadSkuDraft(): Partial<SkuFormValues> | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as Partial<SkuFormValues>;
    } catch {
        return null;
    }
}

export function saveSkuDraft(values: SkuFormValues): void {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...values, savedAt: Date.now() }));
    } catch {
        /* ignore quota */
    }
}

export function clearSkuDraft(): void {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch {
        /* ignore */
    }
}

export function getLastDraftSaveTime(): Date | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { savedAt?: number };
        return parsed.savedAt ? new Date(parsed.savedAt) : null;
    } catch {
        return null;
    }
}
