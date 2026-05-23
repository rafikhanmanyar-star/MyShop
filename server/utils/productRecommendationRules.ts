/**
 * Recipe-family and companion-keyword rules for PDP recommendations.
 * Used server-side for scoring; mirrored on mobile for offline subtitle fallbacks.
 *
 * API enhancement: persist rules in tenant_settings or product_recommendation_rules table.
 * DB: product_pairs(tenant_id, product_id_a, product_id_b, co_count) from order history;
 *      recipe_ingredients already links products in the same recipe graph.
 */

export type RecipeFamilyRule = {
    id: string;
    /** Match anchor product name/category */
    match: RegExp;
    /** Extra ILIKE keywords for companion products (prioritized over generic category fill) */
    companions: string[];
    subtitle: string;
    bundleTitle?: string;
};

export const RECIPE_FAMILY_RULES: RecipeFamilyRule[] = [
    {
        id: 'rice',
        match: /\b(rice|basmati|chawal|sela)\b/i,
        companions: ['oil', 'cooking oil', 'masala', 'biryani', 'salt', 'onion', 'garlic', 'yogurt', 'dahi', 'zeera'],
        subtitle: 'Perfect for making biryani',
        bundleTitle: 'Make Chicken Biryani',
    },
    {
        id: 'tea',
        match: /\b(tea|chai|elaichi|cardamom tea)\b/i,
        companions: ['sugar', 'biscuit', 'milk', 'elaichi', 'cardamom', 'cream'],
        subtitle: 'Complete your tea time',
        bundleTitle: 'Tea time essentials',
    },
    {
        id: 'pasta',
        match: /\b(pasta|macaroni|spaghetti|noodle)\b/i,
        companions: ['sauce', 'cheese', 'ketchup', 'mayo', 'olive'],
        subtitle: 'Complete your pasta meal',
        bundleTitle: 'Pasta night bundle',
    },
    {
        id: 'chicken',
        match: /\b(chicken|murgh|broiler)\b/i,
        companions: ['rice', 'oil', 'masala', 'yogurt', 'ginger', 'garlic', 'onion'],
        subtitle: 'Customers usually buy these together',
        bundleTitle: 'Chicken curry essentials',
    },
    {
        id: 'flour',
        match: /\b(maida|flour|atta|besan)\b/i,
        companions: ['yeast', 'oil', 'sugar', 'egg', 'baking'],
        subtitle: 'Baking & cooking essentials',
    },
    {
        id: 'dal',
        match: /\b(dal|lentil|chana|moong|masoor)\b/i,
        companions: ['rice', 'oil', 'masala', 'onion', 'tomato', 'ginger'],
        subtitle: 'Complete your daal chawal',
    },
];

export function matchRecipeFamily(
    productName: string,
    categoryName?: string | null
): RecipeFamilyRule | null {
    const hay = `${productName} ${categoryName ?? ''}`;
    for (const rule of RECIPE_FAMILY_RULES) {
        if (rule.match.test(hay)) return rule;
    }
    return null;
}

/** Companion keywords for SQL ILIKE scoring (deduped, capped). */
export function getRecipeCompanionKeywords(
    productName: string,
    categoryName?: string | null,
    max = 12
): string[] {
    const family = matchRecipeFamily(productName, categoryName);
    if (!family) return [];
    const seen = new Set<string>();
    for (const c of family.companions) {
        const w = c.toLowerCase().trim();
        if (w.length >= 3) seen.add(w);
        if (seen.size >= max) break;
    }
    return Array.from(seen);
}

export function getRecommendationSubtitle(
    productName: string,
    categoryName?: string | null,
    hasCoPurchase = false
): string {
    const family = matchRecipeFamily(productName, categoryName);
    if (family) return family.subtitle;
    if (hasCoPurchase) return 'Customers usually buy these together';
    return 'Complete your recipe';
}

export function getBundleTitle(productName: string, categoryName?: string | null): string | null {
    return matchRecipeFamily(productName, categoryName)?.bundleTitle ?? null;
}
