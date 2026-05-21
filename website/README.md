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

Output: `website/out/` (static HTML export for Render / Cloudflare Pages)

## Deploy to Cloudflare Pages

### Fix: `Cannot find cwd: .../mobile`

That error means the Pages project **Root directory** is set to `mobile` (customer PWA). This marketing site is in **`website`**, not `mobile`.

**Cloudflare Dashboard → Workers & Pages → your project → Settings → Builds & deployments → Build configuration → Edit:**

| Setting | Marketing site (obostores.com) | Customer PWA (shop.*) |
|--------|-----------------------------------|------------------------|
| **Root directory** | `website` | `mobile` |
| **Build command** | `npm ci && npm run build` | `npm ci && npm run build` |
| **Build output directory** | `out` | `dist` |

Use a **separate Pages project** for the marketing site and for the mobile shop app — do not reuse the mobile project’s root directory.

### Which Git repo?

- **MyShop monorepo** (`rafikhanmanyar-star/MyShop`): Root directory = **`website`**
- **Standalone `Website` repo**: push the *contents* of `website/` to the repo root (so `package.json` is at the repo root), then Root directory = **empty** (`.`)

### Standard setup (MyShop repo)

1. **Workers & Pages → Create → Connect Git** → **MyShop** repo (or your standalone Website repo with files at root).
2. **Root directory:** `website` (MyShop) or leave blank (standalone repo)
3. **Build command:** `npm ci && npm run build`
4. **Output directory:** `out`

### Deploy on Render (static site)

In the Render dashboard for **OboStores-Website**:

| Setting | Value |
|--------|--------|
| **Root directory** | `website` |
| **Build command** | `NODE_OPTIONS=--max-old-space-size=2048 npm ci && npm run build` |
| **Publish directory** | `out` |

The repo `render.yaml` is configured the same way. After pushing these fixes, trigger **Manual Deploy** (or push to `main`).
5. **Environment variables** (production) — copy from `.env.production.example`:
   - `VITE_API_URL` — your API, e.g. `https://api.obostores.com/api`
   - `VITE_SHOP_SLUG` — shop slug, e.g. `obo`
   - `VITE_SHOP_APP_URL` — customer PWA, e.g. `https://shop.obostores.com`
6. **Custom domains:** `obostores.com`, `www.obostores.com`
7. SPA routing: `public/_redirects` is included (`/* /index.html 200`).

## Live product grid

The homepage loads real products from `GET /api/mobile/{slug}/products` (popular, deals, new). Ensure CORS allows `https://obostores.com` on the API, or use the same Cloudflare zone with a proxied API subdomain.
