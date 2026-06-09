# Firebase — Android customer app

Native Firebase is integrated for the **OBO Stores customer** Android app (`com.obostores.customer`). The web/PWA build in `mobile/` is unchanged in the browser; Firebase runs only inside the Capacitor Android shell.

## Architecture

| Layer | Path | Role |
|--------|------|------|
| Web UI | `mobile/` (Vite + React PWA) | Shop, cart, orders, voice — same as before |
| Native shell | `android/` (Capacitor 6) | WebView + Firebase SDKs |
| Config | `android/app/google-services.json` | Firebase project binding (do not commit if your policy forbids API keys) |

Plugins (via `@capacitor-firebase/*`):

- **Analytics** — `app_open` and custom events
- **Crashlytics** — automatic crashes + `recordException` for non-fatal errors
- **Cloud Messaging** — FCM token, permission, foreground listeners; token stored in `localStorage` key `myshop_fcm_token_v1` for future API registration

## `google-services.json`

Place the file from the Firebase Console at:

```text
android/app/google-services.json
```

`applicationId` / package name must be **`com.obostores.customer`** (matches `android/app/build.gradle`).

## Gradle

**Project** (`android/build.gradle`):

- `com.google.gms:google-services:4.4.2`
- `com.google.firebase:firebase-crashlytics-gradle:3.0.2`

**App** (`android/app/build.gradle`):

- Plugins: `com.google.gms.google-services`, `com.google.firebase.crashlytics`
- BOM: `com.google.firebase:firebase-bom:33.1.0`
- `firebase-analytics`, `firebase-crashlytics`, `firebase-messaging`

## Java (`JAVA_HOME`)

Gradle needs **JDK 17**. The easiest source on Windows is the JBR bundled with Android Studio:

Default on Windows:

```text
C:\Program Files\Android\Android Studio\jbr
```

If Studio was installed on another drive (e.g. **F:**):

```text
F:\Program Files\Android\Android Studio\jbr
```

After Android Studio is installed, verify (use your actual path):

```powershell
Test-Path "F:\Program Files\Android\Android Studio\jbr\bin\java.exe"
```

**Current session only:**

```powershell
$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:CAPACITOR_ANDROID_STUDIO_PATH = "F:\Program Files\Android\Android Studio\bin\studio64.exe"
```

**Permanent (User):** Windows → Environment Variables → `JAVA_HOME` = that path.

If Studio is not installed yet, **do not** set `JAVA_HOME` to that path — Gradle will fail. Either install Studio first, or install a standalone [JDK 17](https://adoptium.net/) and point `JAVA_HOME` at it (e.g. `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`).

## Build workflow

From repo root:

```powershell
cd mobile
npm run cap:sync
```

Debug APK:

```powershell
npm run android:assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Release APK (requires signing — see below):

```powershell
npm run android:assembleRelease
```

Open in Android Studio:

```powershell
npm run android:open
```

## Release signing (required for Play / App Distribution)

Signing is wired in `android/app/build.gradle`. It activates when `android/keystore.properties` exists.

### 1. Create a keystore (once)

From `mobile/` (or any folder; default path below is `mobile/obostores-release.keystore`):

```powershell
& "F:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkey -v `
  -keystore obostores-release.keystore -alias obostores `
  -keyalg RSA -keysize 2048 -validity 10000
```

Back up the `.keystore` file and passwords securely.

### 2. Add `android/keystore.properties` (gitignored)

Copy the example and edit passwords. **`storePassword` and `keyPassword` must match** what you entered in `keytool` (usually the same value twice).

```powershell
copy "C:\My Projects\MyShop\android\keystore.properties.example" `
     "C:\My Projects\MyShop\android\keystore.properties"
```

```properties
storeFile=../mobile/obostores-release.keystore
storePassword=your_keystore_password
keyAlias=obostores
keyPassword=your_key_password
```

Verify before building (must print two OK lines). Run from **repo root** or use npm from `mobile/`:

```powershell
$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
cd "C:\My Projects\MyShop"
.\android\scripts\verify-keystore.ps1
# or from mobile/:  npm run android:verify-keystore
```

If verification fails (`keystore password was incorrect`), create a **new** keystore (from repo root or `mobile/`):

```powershell
$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
cd "C:\My Projects\MyShop"
.\android\scripts\create-release-keystore.ps1
# or from mobile/:  npm run android:create-keystore
```

Or manually with keytool after fixing passwords in `keystore.properties`:

```powershell
$env:Path = "F:\Program Files\Android\Android Studio\jbr\bin;" + $env:Path
cd mobile
$keypass = "YourNewSecurePass6charsMin"
keytool -genkey -v -keystore obostores-release.keystore -alias obostores `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $keypass -keypass $keypass `
  -dname "CN=OBO Stores, OU=Mobile, O=obo soft, L=Islamabad, ST=ICT, C=PK"
```

Then set the same value for `storePassword` and `keyPassword` in `keystore.properties`.

### 3. Build signed release for Google Play (AAB)

`android/keystore.properties` **must exist** with the same passwords you used when running `keytool`. Without it, `app-release.aab` is **unsigned** and Play Console rejects it ("All uploaded bundles must be signed").

```powershell
copy "C:\My Projects\MyShop\android\keystore.properties.example" `
     "C:\My Projects\MyShop\android\keystore.properties"
# Edit keystore.properties — set storePassword and keyPassword to your real values

$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
cd mobile
npm run android:bundleRelease
```

Upload this file to Play Console:

```text
android\app\build\outputs\bundle\release\app-release.aab
```

Optional signed APK (same signing config):

```powershell
npm run android:assembleRelease
```

Output: `android\app\build\outputs\apk\release\app-release.apk`

Without `keystore.properties`, release builds still compile but are **unsigned** (not suitable for App Distribution / Play).

## Firebase App Distribution

1. Build a signed release APK or AAB.
2. In [Firebase Console](https://console.firebase.google.com/) → **App Distribution** → **obostores-6786c** → Android app `com.obostores.customer`.
3. Upload the APK/AAB and add tester emails or groups.
4. CLI (optional): install Firebase CLI, `firebase login`, then `firebase appdistribution:distribute app-release.apk --app <ANDROID_APP_ID>`.

## Push notifications (next steps)

Backend is **not** wired yet. When ready:

1. Read `localStorage.getItem('myshop_fcm_token_v1')` after login or expose it via your API.
2. Send FCM messages from Firebase Console or server Admin SDK using that token.
3. Data-only messages are handled in foreground via `FirebaseMessaging` listeners in `mobile/src/services/firebaseNative.ts`.

## Developer tools

In **development** builds on **native Android**, Account → **Developer tools** → **Test Crashlytics crash** (not shown in production or in the browser PWA).

Debug logs (`[Firebase]` prefix) appear only when `import.meta.env.DEV` is true.

## Troubleshooting

| Issue | Check |
|--------|--------|
| `JAVA_HOME is set to an invalid directory` | Android Studio not installed yet, or `JAVA_HOME` points at the wrong path. Install Studio, then set `JAVA_HOME` to the real `jbr` folder (see below). Until then, clear it: `$env:JAVA_HOME = $null` |
| `Unable to launch Android Studio` | Install Android Studio, or set `CAPACITOR_ANDROID_STUDIO_PATH` to `...\bin\studio64.exe` |
| Gradle sync fails | Android SDK 35 (install via SDK Manager), JDK 17, `ANDROID_HOME` set |
| Play: must target API 35 | Set `compileSdkVersion` / `targetSdkVersion` to 35 in `android/variables.gradle`, rebuild AAB |
| `google-services.json` missing | File must be under `android/app/`, not repo root only |
| Package mismatch | Firebase app package = `com.obostores.customer` |
| No FCM token | Android 13+: notification permission; Google Play services on device/emulator |
| Crashlytics empty | Wait ~5 min after first crash; debug builds report to Firebase |
| Plugin conflict | Do not install `@capacitor/push-notifications` alongside `@capacitor-firebase/messaging` |

## App icon on the phone vs Play Console

| Where | What it controls |
|--------|------------------|
| **Play Console** → Store listing → App icon | Icon on the **Play Store page** only |
| **`android/app/src/main/res/mipmap-*`** | Icon on the **home screen** after install |

They are **not linked**. Uploading an icon in Play Console does **not** change the installed app icon. Project source: `mobile/assets/obo-app-icon-source.png`.

Regenerate all `mipmap-*` launcher files:

```powershell
cd mobile
npm run generate-android-icons
npm run android:bundleRelease
```

Then upload a new AAB to Play internal testing.

## Home promotional ads (POS → app)

Ads are loaded from your **API** (`GET /api/mobile/{shopSlug}/branding` → `home_promo_slides`). They are **not** baked into the Play APK.

- **No Play update** needed when you change ads in POS — only save **Configuration** in Mobile Orders → Mobile branding, then reopen the app (or navigate away and back to Home).
- The app must reach your production API (`VITE_API_URL` in `mobile/.env.production`, currently Render).
- Promo images use paths like `/uploads/...`; the phone loads them from the API host, not from Google Play.

If you still see the default “Quick Delivery” banner, the app has **no valid promo slides** (empty list, missing images, or branding not saved).

## Play Console: Advertising ID declaration

Firebase Analytics can merge `com.google.android.gms.permission.AD_ID` into the APK. This app **does not** use the advertising ID for ads.

`AndroidManifest.xml` removes those permissions and sets `google_analytics_adid_collection_enabled=false`.

In Play Console → **App content** → **Advertising ID**, answer **No**, then rebuild and upload a new AAB so the merged manifest matches.

## Manual actions

- [ ] Add release keystore and signing config before store / App Distribution production use
- [ ] Register FCM token with your API when backend endpoint exists
- [ ] Upload release mapping file / enable symbol upload for readable Crashlytics stack traces in release
- [ ] Confirm `google-services.json` is handled per your secrets policy (`.gitignore` may exclude it)
