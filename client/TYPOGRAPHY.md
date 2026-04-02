# MyShop typography system

## Font stack

- **Primary:** Inter (loaded from Google Fonts in `index.html`, weights 400–700).
- **Fallback:** `system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `sans-serif` (see `tailwind.config.js` and `src/index.css` `@theme`).

## Tailwind scale

Custom `fontSize` tokens live in `tailwind.config.js` (`xs` through `3xl`) and align with the ERP/POS scale (e.g. `text-base` = 14px / 20px line height).

## Global CSS classes (`src/index.css`)

| Class | Role |
|--------|------|
| `text-heading` | Page title: `text-2xl font-semibold` + gray text + dark mode |
| `text-subheading` | Section title: `text-lg font-semibold` |
| `text-label` | Form labels: `text-sm font-medium` |
| `text-table-header` | Table headers: `text-xs font-semibold uppercase` + muted gray |
| `text-body` | Body copy: `text-sm` |
| `text-muted` | Help / secondary: `text-xs` + muted gray |

Legacy aliases `page-title`, `section-title`, `table-header`, `body-text`, `label`, etc. map to the same system.

**Sidebar:** use `nav-sidebar-link` on `NavLink` items (`text-sm font-medium tracking-wide`).

## Dark mode

Muted and body text use `text-gray-500 dark:text-gray-400` or semantic tokens. Headings use `text-gray-800 dark:text-gray-200` where the unified classes apply.

## Enforcement

- Run `npm run check:typography` — fails on `text-[Npx]` or arbitrary `text-[Nrem]` in `src/` (Tailwind arbitrary font sizes).
- **Manual review:** avoid inline `fontSize` / `fontFamily` in React `style` except chart libraries (Recharts) and print/PDF templates; keep chart tick labels at 12px and weight 600 where possible.

## Testing checklist (release)

- [ ] Sidebar and shell use Inter; no mixed UI fonts.
- [ ] Tables: header row readable (`text-table-header` / `table-modern`).
- [ ] Forms: labels `text-sm font-medium`, inputs `text-sm`.
- [ ] POS dense areas still readable after replacing micro sizes with `text-xs`/`text-sm`.
