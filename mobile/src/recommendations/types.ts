import type { ProductListProduct } from '../components/ProductListCard';

/** PDP recommendation API payload (server-driven ranking + optional bundle). */
export type ProductRecommendationsResponse = {
    items: ProductListProduct[];
    subtitle?: string | null;
    bundle?: {
        title: string;
        product_ids: string[];
        total_price?: number;
    } | null;
};
