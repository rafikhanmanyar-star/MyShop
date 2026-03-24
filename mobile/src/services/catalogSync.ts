/**
 * Full catalog sync: when online, fetch all products (paginated), categories,
 * and brands for a shop and persist to local DB permanently. Data is never
 * cleared on app exit or reload; it is used when offline.
 */

import { publicApi, getFullImageUrl, getProductImagePath } from '../api';
import {
    setProducts,
    setCategories,
    setBrands,
} from './offlineCache';
import { fetchAndCacheImage } from './imageCache';

const PAGE_SIZE = 100;

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
}

export interface CatalogSyncResult {
    success: boolean;
    productCount: number;
    categoryCount: number;
    brandCount: number;
    error?: string;
}

/**
 * Sync full product catalog, categories, and brands for a shop to offline cache.
 * Call when the user enters a shop while online.
 */
export async function syncCatalogForShop(shopSlug: string): Promise<CatalogSyncResult> {
    if (!isOnline()) {
        return { success: false, productCount: 0, categoryCount: 0, brandCount: 0, error: 'Offline' };
    }

    try {
        const [categoriesData, brandsData] = await Promise.all([
            publicApi.getCategories(shopSlug).catch(() => []),
            publicApi.getBrands(shopSlug).catch(() => []),
        ]);

        const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.categories ?? [];
        const brands = Array.isArray(brandsData) ? brandsData : (brandsData as any)?.brands ?? [];

        await setCategories(shopSlug, categories);
        await setBrands(shopSlug, brands);

        let cursor: string | undefined;
        const allItems: any[] = [];

        do {
            const params: Record<string, string | number> = { limit: PAGE_SIZE };
            if (cursor) params.cursor = cursor;
            const result = await publicApi.getProducts(shopSlug, params);
            const items = result?.items ?? [];
            allItems.push(...items);
            cursor = result?.nextCursor;
        } while (cursor);

        await setProducts(shopSlug, allItems);

        // Prefill image cache so product images load offline (same URLs as useImageUrl / getFullImageUrl)
        await Promise.all(
            allItems
                .map((p: any) => getProductImagePath(p))
                .filter((path): path is string => Boolean(path))
                .slice(0, 50)
                .map((path) => fetchAndCacheImage(getFullImageUrl(path)!, path))
        );

        return {
            success: true,
            productCount: allItems.length,
            categoryCount: categories.length,
            brandCount: brands.length,
        };
    } catch (err: any) {
        return {
            success: false,
            productCount: 0,
            categoryCount: 0,
            brandCount: 0,
            error: err?.message ?? 'Sync failed',
        };
    }
}
