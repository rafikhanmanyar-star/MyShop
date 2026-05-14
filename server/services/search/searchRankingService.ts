import type { ParsedCatalogQuery } from './searchQueryParserService.js';

export type RankableProductRow = {
    id: string;
    name?: string;
    available_stock?: number;
    is_pre_order?: boolean;
    total_sales?: number | null;
    rating_avg?: number | null;
    popularity_score?: number | null;
    typesense_score?: number;
};

/**
 * Merge search-engine score with business ranking (exact match, in-stock, bestseller, ratings).
 * Used when reordering Typesense hits or SQL results in memory.
 */
export function scoreProductForSearch(
    row: RankableProductRow,
    query: ParsedCatalogQuery,
    opts?: { sponsoredBoost?: number }
): number {
    const q = query.raw.trim().toLowerCase();
    const name = (row.name || '').trim().toLowerCase();
    let score = (row.typesense_score ?? 0) * 10;

    if (q && name === q) score += 5000;
    else if (q && name.startsWith(q)) score += 2000;
    else if (q && name.includes(q)) score += 800;

    const stock = Number(row.available_stock ?? 0);
    const pre = Boolean(row.is_pre_order);
    if (stock > 0 || pre) score += 400;
    else score -= 200;

    score += Math.min(Number(row.total_sales ?? 0), 5000) * 0.15;
    score += Math.min(Number(row.popularity_score ?? 0), 500) * 0.4;
    score += (Number(row.rating_avg ?? 0) || 0) * 40;

    if (query.priceIntent === 'low') {
        score += 50;
    } else if (query.priceIntent === 'high') {
        score += 20;
    }

    score += opts?.sponsoredBoost ?? 0;
    return score;
}

export function sortRowsBySearchScore<T extends RankableProductRow>(rows: T[], query: ParsedCatalogQuery): T[] {
    const parsed = query;
    return [...rows].sort((a, b) => scoreProductForSearch(b, parsed) - scoreProductForSearch(a, parsed));
}
