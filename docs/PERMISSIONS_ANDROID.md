# Android permissions — MyShop customer app

The customer app is a **Capacitor 6** shell around the React PWA (`mobile/`). Permissions are managed in `mobile/src/permissions/`.

## Declared permissions (`AndroidManifest.xml`)

| Permission | Purpose | Background |
|------------|---------|------------|
| `RECORD_AUDIO` | Voice orders, voice search | No — only when user taps Record / mic |
| `ACCESS_FINE_LOCATION` | Delivery pin, range check | Foreground only |
| `ACCESS_COARSE_LOCATION` | Fallback location | Foreground only |
| `POST_NOTIFICATIONS` | Order updates (FCM) | N/A |

**Not declared (by design):** `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE*` — the customer app does not track riders or run continuous GPS in the background.

The **rider app** is a separate PWA (`rider/`) using browser geolocation while online; it is not wrapped in Capacitor today.

## Architecture

```
mobile/src/permissions/
  permissionService.ts      — onboarding flags, open settings, request counts
  microphonePermission.ts   — RECORD_AUDIO (native plugin + getUserMedia web)
  locationPermission.ts     — @capacitor/geolocation + web geolocation
  permissionHooks.ts        — useMicrophonePermission, useLocationPermission, …
  geoDistance.ts            — Haversine (km / mi)
  deliveryRangeValidator.ts — client-side radius UX (server still authoritative)
  nativePlugins.ts          — MicrophonePermission, AppSettings Capacitor plugins
```

Native plugins live in `android/app/src/main/java/com/obostores/customer/`.

## UX flows

1. **First launch (Android native):** `PermissionOnboardingModal` in `ShopLoader` explains why mic/location are needed, then triggers system dialogs.
2. **Contextual:** Voice recorder, voice search, checkout “Use my location” request permission at point of use.
3. **Denied:** `PermissionDeniedBanner` with retry + manual fallback copy.
4. **Permanent denial:** “Open Settings” via `AppSettingsPlugin` (app details screen).
5. **Account → App permissions:** `PermissionStatusSection` for troubleshooting.

## Google Play compliance

- **Data safety form:** declare microphone and approximate/precise location; explain voice orders and delivery validation.
- **Privacy policy:** link from Play listing; mention audio recording and location for delivery only.
- **No background location** in customer app — do not request `ACCESS_BACKGROUND_LOCATION` unless product scope changes.
- **RECORD_AUDIO:** disclose in-app before first use (onboarding + rationale cards).

## Testing checklist

- [ ] Fresh install — onboarding appears once, skip works
- [ ] Grant / deny / deny twice (permanent) for mic and location
- [ ] GPS disabled at OS level — `LocationServicesPrompt` on checkout
- [ ] Voice order without mic — typing fallback, no crash
- [ ] Checkout outside delivery radius — badge + toast, order blocked client-side
- [ ] Android 12 / 13 / 14 devices
- [ ] Release build (`android:assembleRelease`) — permissions in merged manifest

## Build

```bash
cd mobile
npm run cap:sync   # builds web + syncs Capacitor + geolocation plugin
cd ../android
gradlew.bat assembleDebug
```

## Security

- Location/audio never sent except with explicit user action (order, voice upload).
- Tenant isolation unchanged — shop slug and auth tokens scope all API calls.
- Server enforces delivery radius in `server/services/mobileOrderBranchRouting.ts`.
