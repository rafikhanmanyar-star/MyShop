# Android In-App Updates (MyShop Customer App)

Customer app package: **`com.obostores.customer`**

## Architecture

| Layer | Path |
|-------|------|
| Backend policy | `GET /api/app-version` — `server/services/appVersionService.ts` |
| Version fetch | `mobile/src/services/updates/versionChecker.ts` |
| Play Core bridge | `android/.../PlayStoreUpdatePlugin.java` + `mobile/src/plugins/PlayStoreUpdate.ts` |
| Play flows | `mobile/src/services/updates/playStoreUpdateManager.ts` |
| Orchestration | `mobile/src/services/updates/updateService.ts` |
| UI hook | `mobile/src/hooks/useAppUpdate.ts` |
| Dialogs | `mobile/src/components/updates/UpdateDialog.tsx` |
| Startup prompt | `mobile/src/components/updates/AppUpdateBootstrap.tsx` |
| Utilities screen | `/:shopSlug/utilities/updates` |

## Backend configuration (Render / `.env`)

```env
APP_LATEST_VERSION=1.1.12
APP_MINIMUM_SUPPORTED_VERSION=1.0.0
APP_FORCE_UPDATE=false
APP_RELEASE_NOTES=["Faster checkout","Improved recommendations","Feedback module"]
# Optional native floor:
APP_MINIMUM_ANDROID_VERSION_CODE=100
```

Logic:

- `currentVersion < minimumSupportedVersion` → **force update** (immediate flow when Play allows).
- `currentVersion < latestVersion` → optional update prompt (flexible by default).
- Server never prompts if `latestVersion` is **older** than the client (downgrade protection).

## Play Store / Gradle

- Dependency: `com.google.android.play:app-update:2.1.0` in `android/app/build.gradle`.
- Plugin registered in `MainActivity.java`.
- Fallback listing: `market://details?id=com.obostores.customer` → HTTPS Play URL.

In-app updates only work when the APK/AAB was installed from **Google Play** (production, internal testing, or closed testing). Debug sideload builds will fall back to opening the Play Store.

## Update flows

1. **Flexible (default)** — download in background; user taps **Install & restart** when ready.
2. **Immediate** — full-screen Play UI; used when `forceUpdateRequired` from backend.
3. **PWA** — web builds still use `PWAReloadPrompt` + service worker.
4. **Fallback** — `openPlayStore()` if Play Core flow fails.

## Testing

### Backend

```bash
curl "http://localhost:3001/api/app-version?currentVersion=1.0.0"
curl "http://localhost:3001/api/app-version?currentVersion=1.1.12&build=111"
```

### Android (internal testing track)

1. Upload build **N** to internal testing.
2. Install build **N-1** from Play on a test device.
3. Upload build **N** and wait for Play to propagate.
4. Open app → startup modal or **Utilities → Check for Updates**.
5. Exercise: no update, flexible download, cancel flow, **Install & restart**.

Use Play Console **Internal app sharing** or **internal test track**; local `assembleDebug` installs cannot complete in-app update flows.

### Scenarios checklist

- [ ] No update available → “You’re up to date”
- [ ] Flexible update → download progress → Install & restart
- [ ] Force update (`APP_FORCE_UPDATE=true` or version below minimum)
- [ ] Airplane mode → friendly offline message
- [ ] User cancels Play UI → no crash
- [ ] Header **Check for updates** opens flow
- [ ] “Later” snoozes startup prompt 24h

## Security

- Semver validation on server env vars.
- Client ignores downgrade prompts (`latestVersion` must be greater than installed).
- Optional `minimumAndroidVersionCode` for native build floor.
- Version check uses short timeout (8s) to avoid startup delay; check runs ~2.2s after shop route loads.

## Release alignment

Align these on each Play release:

1. `android/app/build.gradle` — `versionCode` / `versionName`
2. `mobile/package.json` version
3. `APP_LATEST_VERSION` on the API server
4. Raise `APP_MINIMUM_SUPPORTED_VERSION` only when forcing older clients off

Native UI version uses **`App.getInfo()` / PlayStoreUpdate.getAppInfo()`** on Android (not `__APP_VERSION__` from the web bundle).
