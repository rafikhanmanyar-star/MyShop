# Product Detail Page — Recommendations Architecture

## Overview

The mobile PDP (`mobile/src/pages/ProductDetail.tsx`) is compact and recommendation-focused. Service feature cards (Free Delivery, Secure Payment, etc.) are **not** shown on PDP — they remain on the home page only.

## Ranking priority (server)

`GET /:shopSlug/products/:id/recommendations?limit=12`

1. **Frequently bought together** — `mobile_order_items` co-occurrence on the same order
2. **Recipe graph** — `recipe_ingredients` products sharing a recipe with the anchor SKU
3. **Recipe-family rules** — `server/utils/productRecommendationRules.ts` (rice → oil, masala, …)
4. **Catalog similarity** — subcategory, category, brand, keyword, price band, popularity
5. **Fallback** — top sellers when the pool is thin

Response shape:

```json
{
  "items": [/* ProductListProduct[] */],
  "subtitle": "Perfect for making biryani",
  "bundle": {
    "title": "Make Chicken Biryani",
    "product_ids": ["..."],
    "total_price": 1240
  }
}
```

## Client modules

| Path | Role |
|------|------|
| `mobile/src/recommendations/productRecommendationRules.ts` | Offline subtitle fallback; keep in sync with server rules |
| `mobile/src/recommendations/types.ts` | API types |
| `mobile/src/components/RecommendationCard.tsx` | Memoized compact horizontal card (browse-aligned) |

## Suggested database enhancements

1. **`product_co_purchase_stats`** (materialized nightly)
   - `(tenant_id, product_id_a, product_id_b, order_count)`
   - Index `(tenant_id, product_id_a, order_count DESC)` for fast PDP lookups

2. **`product_recommendation_rules`** (tenant-configurable)
   - `anchor_pattern`, `companion_keywords[]`, `subtitle`, `bundle_title`
   - Replaces hard-coded `RECIPE_FAMILY_RULES` for multi-tenant grocery chains

3. **`product_family`** / **`product_tags`**
   - Tag products (`rice`, `biryani`, `tea`) for family-based ranking without fragile name regex

4. **Extend `recipe_ingredients` usage**
   - Already links products in shared recipes; highest signal for “complete your recipe”

## Performance

- Recommendation cards use `memo()` with shallow prop compare
- `RecRow` is memoized; cart qty map is stable via `useMemo`
- Images use `loading="lazy"` on horizontal scroll
- PDP hides `FloatingCartBar` to avoid overlap with sticky add bar

## Rebuild Android

After mobile changes:

```bash
cd mobile && npm run build
npx cap sync android
```
