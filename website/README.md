# oBo stores — Marketing website

Public marketing site for **obostores.com**: product showcase, mobile ordering CTAs, and overview of the MyShop POS + OBO RIDER platform.

## Develop locally

```bash
cd website
npm install
cp .env.local.example .env.local
npm run dev
```

Open **http://localhost:5190**. The dev server proxies `/api` and `/uploads` to `VITE_API_URL`.

## Build

```bash
npm run build
```

Output: `website/dist/`

## Deploy to Cloudflare Pages

1. **Workers & Pages → Create → Connect Git** → this repo.
2. **Root directory:** `website`
3. **Build command:** `npm ci && npm run build`
4. **Output directory:** `dist`
5. **Environment variables** (production) — copy from `.env.production.example`:
   - `VITE_API_URL` — your API, e.g. `https://api.obostores.com/api`
   - `VITE_SHOP_SLUG` — shop slug, e.g. `obo`
   - `VITE_SHOP_APP_URL` — customer PWA, e.g. `https://shop.obostores.com`
6. **Custom domains:** `obostores.com`, `www.obostores.com`
7. SPA routing: `public/_redirects` is included (`/* /index.html 200`).

## Live product grid

The homepage loads real products from `GET /api/mobile/{slug}/products` (popular, deals, new). Ensure CORS allows `https://obostores.com` on the API, or use the same Cloudflare zone with a proxied API subdomain.
