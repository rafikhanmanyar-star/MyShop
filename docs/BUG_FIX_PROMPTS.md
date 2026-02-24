# Bug Fix Prompts – How to Report Issues for Resolution

This guide explains how to report a bug or issue in the app so it can be resolved quickly—whether you're reporting to an AI assistant, a teammate, or a ticket system.

---

## Step-by-step: Reporting a bug or issue

### 1. **Write a one-line summary**

Start with a short, specific title so the reader knows the area and the problem at a glance.

- **Good:** “Checkout fails with ‘Invalid cart’ when cart has 0 items”
- **Avoid:** “Something is broken”

### 2. **Specify where it happens**

Tell exactly where in the app the issue appears (screen, flow, platform).

- **Screen/route:** e.g. “Orders list”, “/dashboard/orders”, “Mobile app – Home”
- **Platform:** Web (browser), Electron desktop, or mobile app
- **User type/role** (if it matters): e.g. “Admin”, “Branch staff”

### 3. **List steps to reproduce**

Number the exact actions that lead to the bug.

**Example:**
1. Log in as admin.
2. Go to **Procurement → Orders**.
3. Click **Create order**.
4. Add a product and click **Submit**.
5. See the error (or wrong behaviour).

### 4. **Expected vs actual**

- **Expected:** What should happen (correct behaviour).
- **Actual:** What actually happens (error message, wrong UI, crash, etc.).  
  If there’s an error, paste the **exact** message or stack trace.

### 5. **Environment (when relevant)**

- OS (e.g. Windows 10).
- Node version (if server/scripts): `node -v`.
- Browser (if web): e.g. Chrome 120.
- App version or “latest from main”.
- Local vs cloud API (e.g. `npm run dev` vs `electron:cloud`).

### 6. **Extra context**

- When it started (e.g. “after pull from main yesterday”).
- Screenshot or short screen recording if it helps.
- Related file/feature (e.g. “happens in `client/src/pages/Checkout.tsx`” or “mobile orders API”).

---

## Prompt template (copy and fill in)

Use this as the body of your report. Replace the bracketed parts with your details.

```
**Bug/Issue report**

**Summary:** [One sentence: what’s wrong and where]

**Where:** [Screen/route + platform, e.g. Web Orders page, Electron, Mobile]

**Steps to reproduce:**
1. [First action]
2. [Second action]
3. […]
4. [Action after which the bug appears]

**Expected:** [What should happen]

**Actual:** [What happens instead – include exact error message or behaviour]

**Environment (if relevant):** [OS, Node version, browser, local vs cloud, app version]

**Extra context:** [Screenshots, when it started, related file/feature – optional]
```

---

## Example filled-in prompt

```
**Bug/Issue report**

**Summary:** Saving an expense fails with 500 when attachment is over 2MB.

**Where:** Web app – Expenses → Add expense (Chrome, Windows 10)

**Steps to reproduce:**
1. Log in, go to Expenses.
2. Click "Add expense".
3. Fill amount, category, description.
4. Attach a file > 2MB (e.g. 3MB PDF).
5. Click Save.

**Expected:** Expense saves or a clear “file too large” message.

**Actual:** Request fails with 500; Network tab shows server error. No message in UI.

**Environment:** Windows 10, Chrome 120, local API (npm run dev), latest main.

**Extra context:** Small files (< 1MB) work. Suspect server upload limit or validation.
```

---

## Tips for faster resolution

- **Be specific:** “Clicking Submit on the order form” is better than “when I submit”.
- **Include exact errors:** Copy the full error message or first lines of a stack trace.
- **One issue per report:** One bug or feature problem per prompt or ticket.
- **Mention what you already tried:** e.g. “Tried clearing cache and a different browser – same result.”
