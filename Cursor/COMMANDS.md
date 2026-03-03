# MyShop – Build & Test Commands

Commands for testing locally and building the installable app. Each section has **run/build only** and **full (with push to GitHub)** where applicable.

---

## 1. Local test (development)

Run the app in development mode for local testing.

### Run only (no push)

| Command | Description |
|--------|-------------|
| `npm run electron:dev` | Starts dev server + client, waits for API, then launches Electron in dev mode. Use this to test locally with hot reload. |

**What it does:** Runs server and client in dev mode, then opens the Electron app. No build, no commit, no push. Ideal for day-to-day development.

### Full (with push to GitHub)

Local testing is **run-only**; there is no combined “test and push” command. When you’re ready to ship, use the **Installable app** full flow below.

---

## 2. Installable app

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
| `npm run release` | Patch bump (e.g. 1.0.47 → 1.0.48), build **cloud** Windows app, commit, push, create GitHub release and upload installer + `latest.yml` (+ blockmap if present). |
| `npm run release:minor` | Minor bump (e.g. 1.0.47 → 1.1.0), then same as `release`. |
| `npm run release:major` | Major bump (e.g. 1.0.47 → 2.0.0), then same as `release`. |

**What it does (steps in `build-and-push.ps1`):**

1. Bump version (patch/minor/major) in root, client, and server `package.json`.
2. Build client for cloud and package with electron-builder (Windows installer in `release/`).
3. `git add -A` and commit (e.g. `build: vX.Y.Z - release build`).
4. `git push origin`.
5. Create GitHub release for the new tag and upload the installer, `latest.yml`, and blockmap (for in-app updates).

**Requirements:** GitHub CLI (`gh`) installed and logged in (`gh auth login`). On Windows you can install with: `winget install GitHub.cli`.

**Optional:**  
- Custom commit message: `.\build-and-push.ps1 -Message "feat: add new feature"`  
- Push without creating a release: `.\build-and-push.ps1 -SkipRelease`

---

## Quick reference

| Action | Build / run only | Full (with push to GitHub) |
|--------|-------------------|----------------------------|
| **Local test** | `npm run electron:dev` | — (run-only; use installable release when ready to ship) |
| **Installable (local stack)** | `npm run dist:local` or `npm run dist:win:local` | — (use `release` for cloud + push) |
| **Installable (cloud, Windows)** | `npm run dist:win` | `npm run release` (patch), `npm run release:minor`, `npm run release:major` |
