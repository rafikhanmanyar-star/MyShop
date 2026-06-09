# Google Play — Internal testing release 1.0.8

Use these values in **Create internal testing release**. Customers only see **Release notes**; **Release name** is internal.

## Before upload

1. Fix `android/keystore.properties` (passwords must match `mobile/obostores-release.keystore`).
2. Build signed AAB:

```powershell
$env:JAVA_HOME = "F:\Program Files\Android\Android Studio\jbr"
cd mobile
npm run android:bundleRelease
```

3. Upload: `android\app\build\outputs\bundle\release\app-release.aab`

If Play shows *"All uploaded bundles must be signed"*, the AAB was built without valid signing — rebuild after step 1.

---

## Release name (internal, max 50 characters)

```
OBO Stores 1.0.8 — Internal test
```

---

## Release notes (en-US) — paste into Play Console

```xml
<en-US>
Welcome to OBO Stores on Android!

• Order groceries, snacks, drinks, dairy, frozen items, and household essentials from FMC B-17 Kohsar Plaza
• Fast delivery across B-17 Islamabad with live order tracking
• Checkout — cash on delivery, pickup, or pay before delivery (shop shares Easypaisa/JazzCash/bank details with you)
• Save your delivery address with GPS or map pin
• Budget planner, weekly menu planner, recipes, and shopping lists
• Order updates via push notifications (optional)
• Account settings and password management

Privacy: https://obostore.com/privacy-policy
Delete account: https://obostore.com/delete-account

This is an early internal test build — thank you for your feedback!
</en-US>
```

---

## Short release notes (if character limit is tight)

```xml
<en-US>
First Android release of OBO Stores. Order groceries from FMC B-17 with live tracking, saved addresses, and push order updates. Privacy policy and account deletion: obostore.com
</en-US>
```

---

## Version info (for reference)

| Field | Value |
|--------|--------|
| Application ID | `com.obostores.customer` |
| versionName | `1.0.8` |
| versionCode | `108` |
