/**
 * AI-ready natural language query parser (modular stub).
 * Future: map phrases like "cheap gaming phone" to structured filters + semantic retrieval.
 */
export type ParsedCatalogQuery = {
    raw: string;
    tokens: string[];
    /** Detected price intent e.g. "cheap" → sort bias */
    priceIntent: 'none' | 'low' | 'high';
    /** Future: category hints from NLU */
    categoryHints: string[];
};

const PRICE_LOW = /\b(cheap|budget|affordable|lowest price|under)\b/i;
const PRICE_HIGH = /\b(premium|best|flagship|expensive|luxury)\b/i;

export function parseCatalogSearchQuery(raw: string): ParsedCatalogQuery {
    const t = raw.trim();
    const tokens = t
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter((w) => w.length > 0);

    let priceIntent: ParsedCatalogQuery['priceIntent'] = 'none';
    if (PRICE_LOW.test(t)) priceIntent = 'low';
    else if (PRICE_HIGH.test(t)) priceIntent = 'high';

    return {
        raw: t,
        tokens,
        priceIntent,
        categoryHints: [],
    };
}
