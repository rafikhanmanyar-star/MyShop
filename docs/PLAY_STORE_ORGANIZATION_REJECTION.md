# Play Console rejection: Organization account required

If Google Play shows:

> **Play Console Requirements: Violation of Play Console Requirements**  
> Some types of apps can only be distributed by organizations. You have selected an app category or declared your app offers certain features that require you to submit your app using an organization account.

this is **not** fixed by rebuilding the AAB. It is caused by a mismatch between your **developer account type** (Personal vs Organization) and what you declared in **App content** or chose as **store category**.

Policy reference: [Play Console Requirements](https://support.google.com/googleplay/android-developer/answer/10788890)

---

## What triggers an Organization-only account

Google requires an **Organization** developer account when the app is treated as offering:

| Area | Examples |
|------|-----------|
| **Financial products & services** | Banking, loans, crypto wallets, **mobile payments / digital wallets**, money transfer |
| **Health apps** | Medical apps, human subjects research, regulated health categories |
| **VPN** | Apps using `VpnService` |
| **Government** | Apps for or on behalf of government agencies |

**OBO Stores** (`com.obostores.customer`) is a **grocery / e-commerce customer app**. It must **not** be declared under Finance or Medical health categories.

---

## How OBO Stores actually works (use this when filling forms)

| Feature in the app | What it is | Correct Play declaration |
|--------------------|------------|---------------------------|
| Cash on delivery, pickup, “Easypaisa/Jazzcash/Online” at checkout | Order **payment method label** only; shop shares payment details **outside** the app. No wallet SDK, no transfers, no lending. | **Financial features → My app doesn’t provide any financial features** |
| Budget planner, weekly menu, recipes | Grocery **shopping** helpers, not medical diagnosis or clinical health | **Health apps → My app doesn’t provide any health features** |
| Location at checkout | Delivery address / branch radius | Normal location use — not org-triggering |
| Firebase Analytics / FCM | Analytics & push | Not financial; Advertising ID = **No** (see `Cursor/COMMANDS.md`) |

---

## Fix path A — Correct declarations (try this first on a Personal account)

1. Open [Play Console](https://play.google.com/console) → **OBO Stores**.
2. Go to **Policy and programs** → **App content**.
3. **Financial features** → **Manage**
   - Select **My app doesn’t provide any financial features**.
   - Do **not** select “Mobile payments and digital wallets” just because checkout mentions Easypaisa/JazzCash.
4. **Health apps** → **Manage**
   - Select **My app doesn’t provide any health features**.
   - Do **not** select nutrition/medical categories for menu planner or recipes.
5. **Store settings** → **Main store listing** (and any localized listings)
   - **Category**: use **Shopping** or **Food & Drink** (or similar retail), **not** Finance or Medical.
6. **Policy status** → open the rejection → use **Update declaration** if offered.
7. Return to your release track → **Send changes for review** (you usually do **not** need a new AAB for declaration-only fixes).

Wait for review (often 1–3 days). Status should clear if declarations and category match the app.

---

## Fix path B — Use an Organization developer account

Required if the app **truly** offers org-only services (banking, medical app, VPN, government) or Google still requires org after accurate declarations (e.g. registered business policy in your region).

1. [Choose a developer account type](https://support.google.com/googleplay/android-developer/answer/13634885) → create or upgrade to **Organization**.
2. Complete **D-U-N-S** / business verification if prompted.
3. [Transfer the app](https://support.google.com/googleplay/android-developer/answer/6230247) to the organization account using Play Console **Transfer ownership** (do not create a duplicate listing).

---

## If the rejection persists

1. **Policy status** → **Contact support** / **Get support** on the issue (include screenshots of Financial + Health declarations set to “doesn’t provide”).
2. Confirm **developer account type** on **Settings** → **Developer account** (Personal vs Organization).
3. Ensure **Data safety** does not claim health or financial data types the app does not collect.
4. Re-upload only if you changed the app; otherwise resubmit the **same approved AAB** after fixing declarations.

---

## After approval

- Rebuild and upload only when you have code changes: `cd mobile` → `npm run android:bundleRelease`.
- Keep release notes focused on **shopping / delivery** (see `docs/PLAY_STORE_RELEASE_1.0.8.md`); avoid “digital bank”, “wallet”, or “medical/nutrition health” wording in store text.
