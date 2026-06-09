# MyShop – Build & Test Commands

Commands for testing locally and building installable apps (Windows desktop and Android). Each section has **run/build only** and **full (with push to GitHub)** where applicable.

---

## 1. Local test (development)

Run the app in development mode for local testing.

### Run only (no push)

| Command | Description |
|--------|-------------|
| `npm run dev` | Starts the **local API** (**http://localhost:3001**, PostgreSQL on **Render** via `server/.env` `DATABASE_URL`), **POS web client** (**http://localhost:5173**), **marketing website** (**http://localhost:5190**), **mobile storefront** (**http://localhost:5175**), and **rider app** (**http://localhost:5180**). Frontends proxy `/api` to the local API. No Electron. **On Ctrl+C or exit**, all dev ports are freed automatically; stale ports are cleared before each start. |
| `npm run dev:stop` | Manually kill anything still listening on dev ports **3001, 5173, 5175, 5180, 5190** and any orphaned **Node.js** dev processes for this repo (use if Task Manager still shows many `node.exe` after closing a terminal or if `npm run dev` fails with “address already in use”). |
| `npm run dev:apps` | Same as `npm run dev` but **without** the POS client (API + website + mobile + rider only). |
| `npm run dev:server` | **API only** (port **3001**). |
| `npm run dev:client` | **POS web client only** (port **5173**). |
| `npm run dev:mobile` | **Mobile storefront only** (Vite on **http://localhost:5175**). Also started by `npm run dev`. Requires local API (or set proxy target in `mobile/vite.config.ts`). |
| `npm run dev:rider` | **Rider app only** (Vite on **http://localhost:5180**). Also started by `npm run dev`. |
| `npm run dev:website` | **Marketing site only** (Next.js on **http://localhost:5190**) — product showcase + order CTAs. Also started by `npm run dev`. Copy `website/.env.local.example` to `website/.env.local` if needed. |
| `npm run dev:pos:cloud` | **POS web client only** (Vite on **http://localhost:5173**) talking to the **cloud API** (no local `server`, no Electron, no Git push). Set `VITE_API_URL` in `client/.env.cloud` (copy from `client/.env.cloud.example`) or in `client/.env.local`. The dev server **proxies** `/api` and `/uploads` to that host so the app behaves like a normal local dev build. |
| `npm run electron:dev` | Starts the API server, **mobile** storefront (Vite), **rider** app (Vite), waits for `/api/health`, then launches Electron in dev mode. Open the mobile PWA at **http://localhost:5175** and the rider app at **http://localhost:5180** (both proxy `/api` to `localhost:3001`; local API default port is **3001** so **3000** stays free for other apps). |
| `npm run electron:cloud` | Builds the cloud POS client and launches Electron against the **Render API** (no local server). |
| `npm run check:typography` | Runs the POS client typography lint (`client/scripts/check-typography.mjs`). |
| `npm run build:website` | Production build of the marketing site (`website/`). |

**What it does:** These commands only run dev servers (no installable build, no commit, no push to GitHub). **`npm run dev`** starts the local API (Render DB), POS web client (**5173**), marketing website (**5190**), mobile storefront (**5175**), and rider app (**5180**). **`npm run electron:dev`** starts the local API, mobile and rider Vite apps, and Electron. **`npm run dev:pos:cloud`** starts only the POS web app against your configured cloud `VITE_API_URL`.

**Database:** `npm run dev` uses `DATABASE_URL` from `server/.env` (copy from `server/.env.local.example` or root `.env.example` — use the Render external URL, not localhost Postgres).

**Uploads (voice audio, product images):** With a cloud DB and local API, files created on Render are not on your PC under `server/uploads`. Add `REMOTE_UPLOADS_ORIGIN=https://myshop-api-9pd4.onrender.com` to `server/.env` (see `server/.env.local.example`) so the local API proxies missing `/uploads/*` from Render. Restart the API after changing `.env`.

**Voice order → delivery flow:** Order Center → voice order → **Create invoice** (opens POS) → add items → complete sale → app opens **Order Center** on the new delivery order (green “From voice” badge). Customer approves the invoice in the mobile app; then in Order Center use **Mark Confirmed** → **Packed** → delivery as usual.

### Full (with push to GitHub)

Local testing is **run-only**; there is no combined “test and push” command. When you’re ready to ship, use the **Installable app** or **Android app** full flows below.

---

## 2. Database migrations

Schema is defined in a **single consolidated file** (`server/migrations/001-consolidated-schema.sql` plus SQLite variant). Historical incremental files live in `server/migrations/archive/`. See `server/migrations/README.md`.

Requires PostgreSQL connection settings in `server/.env` (same as the API).

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run migrate` | **Repository root** | Runs `server`’s migration runner. Fresh DB: applies consolidated schema once. Existing DB: skips consolidated if legacy migrations or `tenants` already exist. |
| `npm run migrate` | **`server/`** | Same as above. |

**New changes:** add `002-…sql` (and optional `.sqlite.sql`) under `server/migrations/`, then run migrate. Do not edit the consolidated file manually.

---

## 3. Migrate SKUs / catalog between tenants (oBo → obostores)

Copy **categories, brands, and products** (matched by SKU) from one tenant to another. Optionally include **inventory** quantities and batches.

| Step | Where to run | Command |
|------|----------------|---------|
| List tenants | **`server/`** | `npm run migrate-skus -- --list-tenants` |
| Dry run | **`server/`** | `npm run migrate-skus` |
| Apply catalog only | **`server/`** | `npm run migrate-skus -- --execute` |
| Apply + update existing SKUs | **`server/`** | `npm run migrate-skus -- --update-existing --execute` |
| Apply catalog + inventory | **`server/`** | `npm run migrate-skus -- --with-inventory --execute` |
| Apply catalog + inventory + update existing | **`server/`** | `npm run migrate-skus -- --with-inventory --update-existing --execute` |

**Environment (optional):** `FROM_COMPANY_HINT` (default `oBo`), `TO_COMPANY_HINT` (default `obostores`), or `--from-id` / `--to-id` for exact tenant IDs. Requires `DATABASE_URL` in `server/.env`.

**After migrate:** if Typesense search is enabled, run `npm run typesense:index` in `server/`.

**Stock only (catalog already exists):** use **Migrate inventory between tenants** (section 4) instead.

---

## 4. Migrate inventory stock between tenants (oBo → obostores)

Copy **on-hand / reserved** quantities and optional **batch** rows from one tenant to another, matched by **SKU**. Use when the catalog already exists on the destination and you only need stock aligned with the source.

| Step | Where to run | Command |
|------|----------------|---------|
| List tenants | **`server/`** | `npx tsx scripts/migrate-inventory-between-tenants.ts --list-tenants` |
| Dry run | **`server/`** | `npm run migrate-inventory` |
| Apply | **`server/`** | `npm run migrate-inventory -- --execute` |
| Apply + replace dest batches first | **`server/`** | `npm run migrate-inventory -- --execute --replace-batches` |
| Single SKU test | **`server/`** | `npm run migrate-inventory -- --execute --sku YOUR-SKU-CODE` |

**Environment (optional):** `FROM_COMPANY_HINT` (default `obo`), `TO_COMPANY_HINT` (default `obostores`), or `--from-id` / `--to-id` for exact tenant IDs. Requires `DATABASE_URL` in `server/.env`.

**Full catalog + stock:** use `npm run migrate-skus -- --with-inventory --update-existing --execute` instead.

---

## 4b. Migrate suppliers & loyalty members between tenants (oBo → obostores)

Copy **suppliers** (`shop_vendors`) and **loyalty members** (`shop_loyalty_members` + linked `contacts`) from one tenant to another.

| Step | Where to run | Command |
|------|----------------|---------|
| List tenants | **`server/`** | `npm run migrate-suppliers-loyalty -- --list-tenants` |
| Dry run | **`server/`** | `npm run migrate-suppliers-loyalty` |
| Apply suppliers + loyalty | **`server/`** | `npm run migrate-suppliers-loyalty -- --execute` |
| Apply + update existing rows | **`server/`** | `npm run migrate-suppliers-loyalty -- --update-existing --execute` |
| Suppliers only | **`server/`** | `npm run migrate-suppliers-loyalty -- --suppliers-only --execute` |
| Loyalty only | **`server/`** | `npm run migrate-suppliers-loyalty -- --loyalty-only --execute` |

**Matching:** suppliers by normalized **name + company_name**; loyalty contacts by **phone digits**, members by **card number** or linked contact.

**Environment (optional):** `FROM_COMPANY_HINT` (default `obo`), `TO_COMPANY_HINT` (default `obostores`), or `--from-id` / `--to-id`. Requires `DATABASE_URL` in `server/.env`.

**Note:** loyalty members without a phone on their contact are skipped (logged). `mobile_customers` are per-tenant and are **not** copied by this script.

---

## 4c. Migrate khata invoices & payments between tenants (oBo → obostores)

Copy **khata ledger** rows: **debit** = customer invoice, **credit** = payment. Links payments to invoices via `linked_debit_id`. Customers matched by **phone**, unique **name**, or new contact created on destination.

| Step | Where to run | Command |
|------|----------------|---------|
| List tenants | **`server/`** | `npm run migrate-khata -- --list-tenants` |
| Dry run | **`server/`** | `npm run migrate-khata` |
| Apply | **`server/`** | `npm run migrate-khata -- --execute` |

**Environment (optional):** `FROM_COMPANY_HINT` (default `obo`), `TO_COMPANY_HINT` (default `obostores`), or `--from-id` / `--to-id`. Requires `DATABASE_URL` in `server/.env`.

**Note:** Preserves `created_at`. `order_id` is set only when a matching `shop_sales.sale_number` exists on the destination (otherwise `NULL`; sale ref stays in `note`). Does **not** copy journal/GL entries for khata payments.

---

## 5. Delete product & related transactions (DB cleanup)

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

## 6. Server maintenance & search

One-off admin scripts. All run from **`server/`** with `DATABASE_URL` in `server/.env` unless noted.

| Command | Description |
|--------|-------------|
| `npm run typesense:index` | Rebuild Typesense product search index for mobile catalog. Requires `TYPESENSE_HOST`, `TYPESENSE_API_KEY` (and optional `TYPESENSE_COLLECTION_PRODUCTS`). Optional arg: tenant ID. |
| `npm run purge-preprod` | Delete pre-production test transactions before `PURGE_BEFORE` (default 2026-03-01). Set `PURGE_PREPROD_DRY_RUN=true` for counts only. Optional `TENANT_ID` to limit to one tenant. |
| `npm run backfill-batch-expiry` | Set `expiry_date` on legacy inventory batches with NULL expiry (default date `2026-12-01`). `DRY_RUN=1` for counts only. `--include-expired` also updates batches past expiry. |
| `npm run set-tenant-inventory-expiry` | Set expiry on **all** batch rows for one tenant (overwrites existing). `--list-tenants`, `--tenant-id`, or `--tenant-name`. `DRY_RUN=1` for counts only. |
| `npm run test` | Run server unit tests (`vitest run`). |

**Purge example (dry run from repo root):**

```powershell
$env:PURGE_BEFORE="2026-03-01"; $env:PURGE_PREPROD_DRY_RUN="true"; npm run purge-preprod --prefix server
```

---

## 7. App icons

### Mobile / PWA / Android (OBO Stores customer app)

Source artwork: **`mobile/assets/obo-app-icon-source.png`**. Edit this file, then regenerate.

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run generate-icons` | **`mobile/`** | Regenerates PWA / iOS home-screen PNGs in `mobile/public/icons/` (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `shop-logo.png`). |
| `npm run generate-android-icons` | **`mobile/`** | Regenerates Android launcher and adaptive icons in `android/app/src/main/res/mipmap-*`. |
| `npm run build` | **`mobile/`** | Runs **both** icon generators, then TypeScript + Vite production build. |

**Typical workflow after changing the logo:**

```powershell
cd mobile
npm run generate-icons
npm run generate-android-icons
npm run cap:sync
```

### Marketing website images

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run generate:images` | **`website/`** | Generates compressed WebP mockup images from SVG templates into `website/public/images/`. |

### Windows desktop (Electron)

The Windows installer uses **`build/icon.png`** (see root `package.json` → `build.icon`). Replace that file before running `npm run dist:win` or `npm run release`.

---

## 8. Fetch marketing website from GitHub

Pull the latest **`website/`** folder from the remote repo when another teammate has updated the marketing site on GitHub. This does **not** change other folders (client, server, mobile, etc.).

| Command | Description |
|--------|-------------|
| `npm run fetch:website` | `git fetch` + checkout `website/` from `origin/main`, then `npm install` in `website/`. |
| `.\fetch-website.ps1 -Force` | Overwrite local `website/` even if you have uncommitted edits there. |
| `.\fetch-website.ps1 -SkipInstall` | Update files only; skip `npm install`. |
| `.\fetch-website.ps1 -Branch main` | Use another branch (default: `main`). |

**What it does:** Fetches from GitHub, replaces your local `website/` tree with `origin/main` (or the branch you pass), installs dependencies, and leaves those files **staged** in git — run `git status` before committing.

**When to use:** After a teammate pushes website changes you need locally for `npm run dev:website` or Cloudflare deploy prep. Does not push anything to GitHub.

---

## 9. Android app (OBO Stores / Google Play)

Capacitor wraps the **`mobile/`** PWA as native Android app **`com.obostores.customer`**. See also `docs/FIREBASE_ANDROID.md` and `docs/PLAY_STORE_RELEASE_1.0.8.md`.

### Prerequisites (Windows)

Set **JDK 17** (Android Studio JBR) and SDK paths for the current PowerShell session:

```powershell
$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

Verify Java: `Test-Path "$env:JAVA_HOME\bin\java.exe"`

### Sync web build into Android project

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run cap:sync` | **`mobile/`** | Regenerates icons, builds Vite app, copies assets into `android/` via Capacitor. Run after web or icon changes. |
| `npm run android:open` | **`mobile/`** | Opens the Android project in Android Studio. |

### Build APK / AAB

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run android:assembleDebug` | **`mobile/`** | Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk` |
| `npm run android:assembleRelease` | **`mobile/`** | Signed release APK (requires keystore): `android/app/build/outputs/apk/release/app-release.apk` |
| **`npm run android:bundleRelease`** | **`mobile/`** | **One command for Play Store:** auto-detects `JAVA_HOME`, bumps `versionCode` / `versionName`, verifies keystore, builds web app, syncs Capacitor, runs Gradle. Output: `android/app/build/outputs/bundle/release/app-release.aab` |
| `npm run android:bundleRelease:gradle` | **`mobile/`** | Gradle-only rebuild (no version bump, no keystore check). |

**`android:bundleRelease` does everything:**

1. Sets `JAVA_HOME` to Android Studio JBR (tries `F:\` and `C:\Program Files\...` automatically)
2. Bumps `versionName` (patch) and sets `versionCode` to match (e.g. `1.1.11`/`111` → `1.1.12`/`112`) in `android/app/build.gradle` and `mobile/package.json`
3. Verifies `android/keystore.properties` can open the release keystore
4. Runs `cap:sync` (icons + Vite build + Capacitor sync)
5. Runs `gradlew.bat bundleRelease`

**Play Store AAB — single command:**

```powershell
cd mobile
npm run android:bundleRelease
```

Upload: `android\app\build\outputs\bundle\release\app-release.aab`

**Optional flags** (pass after `--`):

| Flag | Effect |
|------|--------|
| `-NoVersionBump` | Rebuild without changing version (retry failed build only — Play rejects duplicate versionCode) |
| `-BumpType minor` | Bump minor version instead of patch (e.g. `1.1.11` → `1.2.0`) |
| `-BumpType major` | Bump major version (e.g. `1.1.11` → `2.0.0`) |
| `-SkipKeystoreVerify` | Skip keystore check (not recommended for Play uploads) |

```powershell
npm run android:bundleRelease -- -NoVersionBump
npm run android:bundleRelease -- -BumpType minor
```

### Version bump (manual alternative)

Google Play rejects an AAB whose `versionCode` is not higher than the last upload (e.g. *"Version code 111 has already been used"*). **`android:bundleRelease` bumps automatically** on every run; use `-NoVersionBump` only to retry a failed build at the same version:

| Field | Purpose | Example |
|-------|---------|---------|
| `versionName` | User-visible version | `"1.1.11"` → `"1.1.12"` |
| `versionCode` | Internal integer; must increase every Play upload | `111` → `112` |

### Release signing (keystore)

Signing is configured in `android/app/build.gradle` when `android/keystore.properties` exists.

| Command | Where to run | Description |
|--------|----------------|-------------|
| `npm run android:create-keystore` | **`mobile/`** | Interactive: creates `mobile/obostores-release.keystore` and `android/keystore.properties` (backs up existing files). |
| `npm run android:verify-keystore` | **`mobile/`** | Verifies `keystore.properties` can open the keystore (must print OK lines before release builds). |

**Manual setup:** copy `android/keystore.properties.example` → `android/keystore.properties`. Passwords must match the keystore. Default keystore path: `mobile/obostores-release.keystore`, alias: `obostores`.

If Play Console shows *"All uploaded bundles must be signed"*, rebuild after fixing `keystore.properties`.

### Firebase (push, analytics, crashlytics)

Place `android/app/google-services.json` from Firebase Console. Package name must be **`com.obostores.customer`**. See `docs/FIREBASE_ANDROID.md`.

### Pre-launch: Advertising ID declaration (Play Console)

If Play Console shows **Incomplete advertising ID declaration**, complete the form in the console — the app code is already configured for **No**.

**What the app does (already in repo):**

- `android/app/src/main/AndroidManifest.xml` removes `AD_ID` / `ACCESS_ADSERVICES_AD_ID` (Firebase Analytics would otherwise merge them).
- Sets `google_analytics_adid_collection_enabled=false` (analytics without Play advertising ID).
- `npm run android:bundleRelease` verifies the release manifest contains **no** advertising ID permission.

**Fix in Google Play Console (required once per app):**

1. Open [Google Play Console](https://play.google.com/console) → your app **OBO Stores**.
2. Go to **Policy and programs** → **App content** (or use the **Update declaration** link on the release error).
3. Find **Advertising ID** → **Manage** / **Start**.
4. **Does your app use advertising ID?** → **No**.
5. Save and submit the declaration. Status should change from incomplete to complete.
6. Return to your release (Closed testing → Production / Pre-launch) and send for review again.

**Important:** Answer **No** only if the uploaded AAB was built from this repo (merged manifest must not include `com.google.android.gms.permission.AD_ID`). Rebuild with `npm run android:bundleRelease` if unsure.

The app uses Firebase Analytics, Crashlytics, and FCM — not AdMob or third-party ad SDKs. In-app promo banners come from your API, not the advertising ID.

### Rejection: “Organization account required” (Play Console Requirements)

If Play rejects a release with *Some types of apps can only be distributed by organizations*, the cause is almost always **App content declarations** or **store category** — not a bug in the AAB.

**OBO Stores is a grocery app.** Checkout options (COD, Easypaisa/JazzCash as payment *instructions*, budget/menu planner) are **not** banking or medical services.

**Fix in Play Console (try before converting the developer account):**

1. **Policy and programs** → **App content**
2. **Financial features** → **My app doesn’t provide any financial features** (do not select “Mobile payments and digital wallets” for COD / shop-shared payment details only).
3. **Health apps** → **My app doesn’t provide any health features** (menu planner / recipes are shopping helpers, not medical apps).
4. **Main store listing** → category **Shopping** or **Food & Drink**, not Finance or Medical.
5. Resubmit the release for review (new AAB usually **not** required).

Full checklist: `docs/PLAY_STORE_ORGANIZATION_REJECTION.md`. If Google still requires an organization after accurate declarations, upgrade to an **Organization** developer account and [transfer the app](https://support.google.com/googleplay/android-developer/answer/6230247).

---

## 10. Installable desktop app (Windows)

Build the Windows desktop app and optionally bump version, commit, push, and create a GitHub release.

### Build only (no push)

| Command | Description |
|--------|-------------|
| `npm run dist:local` | Build server + client, then run electron-builder. Output in `release/`. Full local stack (embedded server). |
| `npm run dist:win:local` | Same as above, Windows installer only. |
| `npm run dist:win` | Build **cloud** client only (API on Render), then create Windows installer. No version bump or push. |
| `npm run dist` | Build cloud client + electron-builder (all platforms configured). |
| `npm run pack:local` | Build local stack into `release/` folder (no installer). |
| `npm run pack` | Build cloud client into `release/` folder (no installer). |

**What it does:** Produces the installable package (e.g. `.exe` in `release/`). Does not change version, commit, or push.

### Full (build + version bump + commit + push + GitHub release)

One command runs the PowerShell script that does all steps: bump version, build, commit, push, and create a GitHub release (with upload so “Check for updates” works).

| Command | Description |
|--------|-------------|
| `npm run release` | Patch bump (e.g. 1.0.47 → 1.0.48), build **cloud** Windows app, commit, push, create GitHub release and upload installer + `latest.yml` (+ blockmap if present). **Keeps only the latest 10 GitHub releases** (deletes older ones) and **keeps only the latest 10 builds** in the local `release/` folder. |
| `npm run release:minor` | Minor bump (e.g. 1.0.47 → 1.1.0), then same as `release`. |
| `npm run release:major` | Major bump (e.g. 1.0.47 → 2.0.0), then same as `release`. |

**What it does (steps in `build-and-push.ps1`):**

1. Bump version (patch/minor/major) in root, client, and server `package.json`.
2. Build client for cloud and package with electron-builder (Windows installer in `release/`).
3. `git add -A` and commit (e.g. `build: vX.Y.Z - release build`).
4. `git push origin`.
5. Create GitHub release for the new tag and upload the installer, `latest.yml`, and blockmap (for in-app updates).
6. **Prune GitHub releases**: delete all but the latest 10 releases on GitHub.
7. **Prune local `release/` folder**: delete older installer builds so only the latest 10 remain (by version).

**Requirements:** GitHub CLI (`gh`) installed and logged in (`gh auth login`). On Windows you can install with: `winget install GitHub.cli`.

**Optional:**  
- Custom commit message: `.\build-and-push.ps1 -Message "feat: add new feature"`  
- Push without creating a release: `.\build-and-push.ps1 -SkipRelease`

---

## Quick reference

| Action | Build / run only | Full (with push to GitHub) |
|--------|-------------------|----------------------------|
| **Local test (all apps)** | `npm run dev` | — |
| **Single app dev** | `npm run dev:server`, `dev:client`, `dev:mobile`, `dev:rider`, `dev:website` | — |
| **POS vs cloud API** | `npm run dev:pos:cloud`, `npm run electron:cloud` | — |
| **Electron local** | `npm run electron:dev` | — |
| **Database migrations** | `npm run migrate` (root or `server/`) | — |
| **Migrate catalog (SKUs)** | From `server/`: `npm run migrate-skus` (dry), `--execute` to apply | — |
| **Migrate inventory only** | From `server/`: `npm run migrate-inventory` | — |
| **Typesense reindex** | From `server/`: `npm run typesense:index` | — |
| **Regenerate mobile icons** | From `mobile/`: `npm run generate-icons`, `npm run generate-android-icons` | — |
| **Android debug APK** | From `mobile/`: `npm run android:assembleDebug` | — |
| **Android Play Store AAB** | From `mobile/`: `npm run android:bundleRelease` (auto JAVA_HOME, version bump, keystore verify, build) | — |
| **Verify Android keystore** | From `mobile/`: `npm run android:verify-keystore` | — |
| **Fetch website from GitHub** | `npm run fetch:website` | — |
| **Delete test product (DB)** | From `server/`: set `TENANT_COMPANY_HINT` / `PRODUCT_HINT`, then `npx tsx scripts/delete-product-by-name.ts --dry` or `--execute` | — |
| **Installable desktop (local stack)** | `npm run dist:local` or `npm run dist:win:local` | — |
| **Installable desktop (cloud, Windows)** | `npm run dist:win` | `npm run release` (patch), `npm run release:minor`, `npm run release:major` |
