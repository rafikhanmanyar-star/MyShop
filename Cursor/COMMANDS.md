# MyShop – Build & Test Commands

Commands for testing locally and building the installable app. Each section has **run/build only** and **full (with push to GitHub)** where applicable.

---

## 1. Local test (development)

Run the app in development mode for local testing.

### Run only (no push)

| Command | Description |
|--------|-------------|
| `npm run electron:dev` | Starts the API server, **mobile** storefront (Vite), **rider** app (Vite), waits for `/api/health`, then launches Electron in dev mode. Open the mobile PWA at **http://localhost:5175** and the rider app at **http://localhost:5180** (both proxy `/api` to `localhost:3001`; local API default port is **3001** so **3000** stays free for other apps). |
| `npm run dev:website` | **Marketing site** (Vite on **http://localhost:5190**) — product showcase + order CTAs. Copy `website/.env.local.example` to `website/.env.local`. |
| `npm run dev:pos:cloud` | **POS web client only** (Vite on **http://localhost:5173**) talking to the **cloud API** (no local `server`, no Electron, no Git push). Set `VITE_API_URL` in `client/.env.cloud` (copy from `client/.env.cloud.example`) or in `client/.env.local`. The dev server **proxies** `/api` and `/uploads` to that host so the app behaves like a normal local dev build. |

**What it does:** These commands only run dev servers (no installable build, no commit, no push to GitHub). **`npm run electron:dev`** starts the local API, mobile and rider Vite apps, and Electron. **`npm run dev:pos:cloud`** starts only the POS web app against your configured cloud `VITE_API_URL`. **`npm run dev`** starts the local API plus the POS web client on **http://localhost:5173** (no Electron, no mobile/rider).

### Full (with push to GitHub)

Local testing is **run-only**; there is no combined “test and push” command. When you’re ready to ship, use the **Installable app** full flow below.

---

## 2. Database migrations

Apply SQL migrations in `server/migrations/` (e.g. new indexes, schema changes). Requires PostgreSQL connection settings in `server/.env` (same as the API).

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run migrate` | **Repository root** | Runs `server`’s migration runner (`tsx scripts/run-migrations.ts`). Applies any pending `.sql` files in order. |
| `npm run migrate` | **`server/`** | Same as above (defined in `server/package.json` as `migrate`). |

**What it does:** Executes pending migrations once and records them so they are not applied twice. Run after pulling changes that add files under `server/migrations/`.

---

## 3. Delete product & related transactions (DB cleanup)

One-off script to remove a product and its **POS sales**, **sales returns**, **mobile orders** (lines referencing the product), **purchase bills** (lines referencing the product), **inventory movements / batches**, and **procurement demand draft lines**, then the **`shop_products`** row. Uses the same `DATABASE_URL` as the API (`server/.env`).

| Step | Where to run | Command |
|------|----------------|---------|
| Dry run (counts only, no deletes) | **`server/`** | `$env:TENANT_COMPANY_HINT="obo"; $env:PRODUCT_HINT="your-product-name"; npx tsx scripts/delete-product-by-name.ts --dry` |
| Execute (after backup) | **`server/`** | `$env:TENANT_COMPANY_HINT="obo"; $env:PRODUCT_HINT="your-product-name"; npx tsx scripts/delete-product-by-name.ts --execute` |

**Environment variables (optional):**

- `TENANT_COMPANY_HINT` — substring match on `tenants.company_name` or `tenants.name` (default: `obo`). If more than one tenant matches, the script exits and lists them.
- `PRODUCT_HINT` — substring match on product **name**, **sku**, or **barcode** (default: `erasdf`). If more than one product matches, narrow the hint or use an exact sku.

**What it does:** Connects to PostgreSQL, resolves a single tenant and a single product, prints related row counts, then (with `--execute`) deletes in one transaction: sales returns and journals → mobile orders → purchase bills → POS sales → remaining movements/batches for that product → product. Omit both env vars to use the defaults.

---

## 4. Installable app

Build the Windows desktop app and optionally bump version, commit, push, and create a GitHub release.

### Build only (no push)

| Command | Description |
|--------|-------------|
| `npm run dist:local` | Build server + client, then run electron-builder. Output in `release/`. Full local stack (embedded server). |
| `npm run dist:win:local` | Same as above, Windows installer only. |
| `npm run dist:win` | Build **cloud** client only (API on Render), then create Windows installer. No version bump or push. |

**What it does:** Produces the installable package (e.g. `.exe` in `release/`). Does not change version, commit, or push.

### Full (build + version bump + commit + push + GitHub release)

One command runs the PowerShell script that does all steps: bump version, build, commit, push, and create a GitHub release (with upload so “Check for updates” works).

| Command | Description |
|--------|-------------|
| `npm run release` | Patch bump (e.g. 1.0.47 → 1.0.48), build **cloud** Windows app, commit, push, create GitHub release and upload installer + `latest.yml` (+ blockmap if present). **Keeps only the latest 3 GitHub releases** (deletes older ones) and **keeps only the latest 3 builds** in the local `release/` folder. |
| `npm run release:minor` | Minor bump (e.g. 1.0.47 → 1.1.0), then same as `release`. |
| `npm run release:major` | Major bump (e.g. 1.0.47 → 2.0.0), then same as `release`. |

**What it does (steps in `build-and-push.ps1`):**

1. Bump version (patch/minor/major) in root, client, and server `package.json`.
2. Build client for cloud and package with electron-builder (Windows installer in `release/`).
3. `git add -A` and commit (e.g. `build: vX.Y.Z - release build`).
4. `git push origin`.
5. Create GitHub release for the new tag and upload the installer, `latest.yml`, and blockmap (for in-app updates).
6. **Prune GitHub releases**: delete all but the latest 3 releases on GitHub.
7. **Prune local `release/` folder**: delete older installer builds so only the latest 3 remain (by version).

**Requirements:** GitHub CLI (`gh`) installed and logged in (`gh auth login`). On Windows you can install with: `winget install GitHub.cli`.

**Optional:**  
- Custom commit message: `.\build-and-push.ps1 -Message "feat: add new feature"`  
- Push without creating a release: `.\build-and-push.ps1 -SkipRelease`

---

## Quick reference

| Action | Build / run only | Full (with push to GitHub) |
|--------|-------------------|----------------------------|
| **Local test** | `npm run electron:dev` | — (run-only; use installable release when ready to ship) |
| **POS vs cloud API** | `npm run dev:pos:cloud` | — |
| **Database migrations** | `npm run migrate` (from repo root or `server/`) | — |
| **Delete test product (DB)** | From `server/`: set `TENANT_COMPANY_HINT` / `PRODUCT_HINT`, then `npx tsx scripts/delete-product-by-name.ts --dry` or `--execute` | — |
| **Installable (local stack)** | `npm run dist:local` or `npm run dist:win:local` | — (use `release` for cloud + push) |
| **Installable (cloud, Windows)** | `npm run dist:win` | `npm run release` (patch), `npm run release:minor`, `npm run release:major` |
