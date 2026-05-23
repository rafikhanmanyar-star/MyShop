# Mobile Product Favorites API

Customer favorites are stored in `customer_favorites` (tenant + customer scoped) and exposed under `/api/mobile/:shopSlug/favorites/*`. All mutating routes require `Authorization: Bearer <mobile_customer JWT>` and resolve the tenant from `:shopSlug`.

## Database

```sql
customer_favorites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES mobile_customers(id),
  product_id TEXT NOT NULL REFERENCES shop_products(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (tenant_id, customer_id, product_id)
)
```

Indexes: `(tenant_id, customer_id, created_at DESC)`, `(tenant_id, product_id)`. RLS: `tenant_isolation`.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/:shopSlug/favorites/ids` | Yes | `{ productIds: string[] }` — full ID list for sync/cache |
| `GET` | `/:shopSlug/favorites/status?productIds[]=…` | Yes | `{ status: { [productId]: boolean } }` (max 100 IDs) |
| `GET` | `/:shopSlug/favorites` | Yes | Paginated favorite **products** (same query params as `GET /products`) |
| `POST` | `/:shopSlug/favorites/add` | Yes | Body `{ productId }` → `{ ok, productId, favorited: true }` |
| `POST` | `/:shopSlug/favorites/remove` | Yes | Body `{ productId }` → `{ ok, productId, favorited: false }` |

### List favorites (browse “My Fav”)

Supports the same filters as catalog: `search`, `filterInStock`, `filterPopular`, `onSale`/`deals`, `sortBy`, `categoryIds[]`, `cursor`, `page`, etc. Results are restricted to the customer’s favorites via `favoriteCustomerId` in `getProductsForMobile`.

## Security

- JWT `type` must be `mobile_customer`; `tenantId` must match resolved shop.
- Queries always filter `tenant_id` + `customer_id` from the token — never from the request body.
- Duplicate favorites prevented by `UNIQUE (tenant_id, customer_id, product_id)`.

## Mobile client

- `mobile/src/services/favoriteService.ts` — sync, optimistic add/remove
- `mobile/src/stores/favoriteStore.ts` — in-memory cache + `localStorage` offline mirror
- `mobile/src/hooks/useFavorites.ts` — React hook for pages/cards
- Browse filter: URL `filterMyFav=true`
