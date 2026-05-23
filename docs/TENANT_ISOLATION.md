# Multi-tenant isolation (MyShop / OBO Stores)

## Root cause (2026 fix)

`resolveShopBySlug` previously matched **branch slug before tenant slug**. If tenant `tk` had a branch whose slug was `obostores`, the mobile URL `/obostores` resolved to `tk` instead of the real tenant `obostores`. Login, catalog, and orders then used the wrong `tenantId`.

## Resolution order (canonical)

Implemented in `server/services/tenantResolver.ts`:

1. **Tenant slug** — exact match on `tenants.slug`
2. **Composite** — `{tenantSlug}-{branchCode}` when tenant slugs contain dashes
3. **Branch slug** — global unique `shop_branches.slug` (only when no tenant shares that slug)

## Server

| Layer | Responsibility |
|--------|----------------|
| `tenantResolver.ts` | Central slug → `tenantId` |
| `mobileMiddleware.publicTenantMiddleware` | Public mobile routes via slug |
| `mobileMiddleware.mobileAuthMiddleware` | JWT + slug consistency when both present |
| `mobileTenantGuard` | Slug-less routes (`POST /orders`) require `X-Shop-Slug` header |
| `tenantMiddleware` | Admin/POS JWT `tenantId` + user/session validation |
| `databaseService` | `set_config('app.current_tenant_id')` for PostgreSQL RLS when AsyncLocalStorage is active |

### Admin login

`authService.login` no longer picks an arbitrary tenant when the same **username** exists in multiple companies. Users must select a company (or use `?org=` / QR) when more than one password match exists.

## Mobile PWA

- Per-shop session: `mobile_token:{slug}`, `mobile_tenant_id:{slug}`
- All authenticated API calls send `X-Shop-Slug`
- `SET_SHOP` clears session when JWT `tenantId` ≠ shop `id` from `/info`
- Offline order queue only syncs orders for the active shop slug

## Security tests

Run: `cd server && npm test` — includes `tenantResolver.test.ts`.

## Operational checklist

- [ ] Ensure branch slugs do not intentionally mirror another tenant’s slug
- [ ] New tenants: set unique `tenants.slug` before creating branches
- [ ] After deploy: verify `POST /api/mobile/orders` with wrong JWT + correct `X-Shop-Slug` returns `403 TENANT_MISMATCH`
