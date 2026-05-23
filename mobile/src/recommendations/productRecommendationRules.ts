/**
 * Client-side mirror of server recipe-family rules (subtitle fallback when offline / cached PDP).
 * Keep in sync with server/utils/productRecommendationRules.ts
 */

export type RecipeFamilyRule = {
    id: string;
    match: RegExp;
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

export function matchRecipeFamily(productName: string, categoryName?: string | null): RecipeFamilyRule | null {
    const hay = `${productName} ${categoryName ?? ''}`;
    for (const rule of RECIPE_FAMILY_RULES) {
        if (rule.match.test(hay)) return rule;
    }
    return null;
}

export function getRecommendationSubtitle(
    productName: string,
    categoryName?: string | null,
    serverSubtitle?: string | null
): string {
    if (serverSubtitle?.trim()) return serverSubtitle.trim();
    const family = matchRecipeFamily(productName, categoryName);
    return family?.subtitle ?? 'Customers usually buy these together';
}
