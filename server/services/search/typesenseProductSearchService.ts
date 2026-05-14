import Typesense from 'typesense';
import { getTypesenseCollectionName, isTypesenseConfigured } from './typesenseConfig.js';

let client: InstanceType<typeof Typesense.Client> | null = null;

function getClient(): InstanceType<typeof Typesense.Client> | null {
    if (!isTypesenseConfigured()) return null;
    if (client) return client;
    const host = process.env.TYPESENSE_HOST!;
    const protocol = (process.env.TYPESENSE_PROTOCOL || 'https') as 'http' | 'https';
    const port = process.env.TYPESENSE_PORT ? parseInt(process.env.TYPESENSE_PORT, 10) : protocol === 'https' ? 443 : 8108;
    client = new Typesense.Client({
        nodes: [{ host, port, protocol }],
        apiKey: process.env.TYPESENSE_API_KEY!,
        connectionTimeoutSeconds: 5,
    });
    return client;
}

export type TypesenseProductFilters = {
    categoryIds?: string[];
    subcategoryIds?: string[];
    brandIds?: string[];
    minPrice?: number;
    maxPrice?: number;
    onSale?: boolean;
    inStockOnly?: boolean;
};

function escId(id: string): string {
    return String(id).replace(/`/g, '');
}

function buildFilterBy(tenantId: string, f: TypesenseProductFilters): string {
    const parts = [`tenant_id:=\`${escId(tenantId)}\``];
    if (f.categoryIds?.length) {
        parts.push(`(${f.categoryIds.map((id) => `category_id:=\`${escId(id)}\``).join(' || ')})`);
    }
    if (f.subcategoryIds?.length) {
        parts.push(`(${f.subcategoryIds.map((id) => `subcategory_id:=\`${escId(id)}\``).join(' || ')})`);
    }
    if (f.brandIds?.length) {
        parts.push(`(${f.brandIds.map((id) => `brand_id:=\`${escId(id)}\``).join(' || ')})`);
    }
    if (f.minPrice != null && Number.isFinite(f.minPrice)) parts.push(`price:>=${f.minPrice}`);
    if (f.maxPrice != null && Number.isFinite(f.maxPrice)) parts.push(`price:<=${f.maxPrice}`);
    if (f.onSale) parts.push('is_on_sale:=true');
    if (f.inStockOnly) parts.push('in_stock:=true');
    return parts.join(' && ');
}

export async function typesenseSearchSuggestions(
    tenantId: string,
    q: string,
    perPage = 8
): Promise<{ id: string; name: string; brand?: string; category?: string; text_match?: number }[]> {
    const c = getClient();
    if (!c || !q.trim()) return [];
    const collection = getTypesenseCollectionName();
    try {
        const res = await c.collections(collection).documents().search({
            q: q.trim(),
            query_by: 'name,brand,category,subcategory,tags,sku,short_description',
            filter_by: `tenant_id:=\`${escId(tenantId)}\``,
            per_page: perPage,
        });
        return (res.hits || []).map((h: any) => ({
            id: String(h.document?.id ?? ''),
            name: String(h.document?.name ?? ''),
            brand: h.document?.brand ? String(h.document.brand) : undefined,
            category: h.document?.category ? String(h.document.category) : undefined,
            text_match: typeof h.text_match === 'number' ? h.text_match : undefined,
        }));
    } catch (e: any) {
        console.warn('[Typesense] suggestions failed:', e?.message || e);
        return [];
    }
}

export async function typesenseSearchProductIds(params: {
    tenantId: string;
    q: string;
    page: number;
    perPage: number;
    filters: TypesenseProductFilters;
    sortBy?: string;
}): Promise<{ ids: string[]; scores: Map<string, number>; found: number }> {
    const c = getClient();
    const empty = { ids: [], scores: new Map<string, number>(), found: 0 };
    if (!c || !params.q.trim()) return empty;
    const collection = getTypesenseCollectionName();
    const sortBy = params.sortBy || 'relevance';
    let sortByTypesense: string | undefined;
    switch (sortBy) {
        case 'price_low_high':
            sortByTypesense = 'price:asc';
            break;
        case 'price_high_low':
            sortByTypesense = 'price:desc';
            break;
        case 'newest':
            sortByTypesense = 'created_at:desc';
            break;
        case 'best_selling':
            sortByTypesense = 'total_sales:desc';
            break;
        case 'top_rated':
            sortByTypesense = 'rating_avg:desc';
            break;
        case 'biggest_discount':
            sortByTypesense = 'discount_percentage:desc';
            break;
        default:
            sortByTypesense = undefined;
    }
    try {
        const res = await c.collections(collection).documents().search({
            q: params.q.trim(),
            query_by: 'name,brand,category,subcategory,tags,sku,short_description',
            query_by_weights: '6,3,3,2,2,4,1',
            filter_by: buildFilterBy(params.tenantId, params.filters),
            per_page: params.perPage,
            page: Math.max(1, params.page),
            ...(sortByTypesense ? { sort_by: sortByTypesense } : {}),
        });
        const scores = new Map<string, number>();
        const ids: string[] = [];
        for (const h of res.hits || []) {
            const id = String((h as any).document?.id ?? '');
            if (!id) continue;
            ids.push(id);
            scores.set(id, typeof (h as any).text_match === 'number' ? (h as any).text_match : 0);
        }
        return { ids, scores, found: res.found ?? ids.length };
    } catch (e: any) {
        console.warn('[Typesense] product search failed:', e?.message || e);
        return empty;
    }
}

/** Schema fields for DevOps — create collection if missing (see scripts/index-typesense-products.ts). */
export const TYPESENSE_PRODUCT_SCHEMA_FIELDS = [
        { name: 'id', type: 'string' as const },
        { name: 'tenant_id', type: 'string' as const, facet: true },
        { name: 'name', type: 'string' as const },
        { name: 'sku', type: 'string' as const, optional: true },
        { name: 'brand', type: 'string' as const, optional: true },
        { name: 'brand_id', type: 'string' as const, optional: true, facet: true },
        { name: 'category', type: 'string' as const, optional: true },
        { name: 'category_id', type: 'string' as const, optional: true, facet: true },
        { name: 'subcategory', type: 'string' as const, optional: true },
        { name: 'subcategory_id', type: 'string' as const, optional: true, facet: true },
        { name: 'tags', type: 'string' as const, optional: true },
        { name: 'short_description', type: 'string' as const, optional: true },
        { name: 'price', type: 'float' as const },
        { name: 'in_stock', type: 'bool' as const, facet: true },
        { name: 'is_on_sale', type: 'bool' as const, facet: true },
        { name: 'discount_percentage', type: 'float' as const, optional: true },
        { name: 'total_sales', type: 'float' as const, optional: true },
        { name: 'rating_avg', type: 'float' as const, optional: true },
        { name: 'popularity_score', type: 'float' as const, optional: true },
        { name: 'color', type: 'string' as const, optional: true, facet: true },
        { name: 'size', type: 'string' as const, optional: true, facet: true },
        { name: 'seller_name', type: 'string' as const, optional: true },
        { name: 'created_at', type: 'int64' as const, optional: true },
];
