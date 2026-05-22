# Database migrations

## Layout

| Path | Purpose |
|------|---------|
| `001-consolidated-schema.sql` | Full PostgreSQL schema (fresh installs) |
| `001-consolidated-schema.sqlite.sql` | Full SQLite schema (local dev) |
| `archive/` | Historical incremental migrations (001–083), kept for reference |

## Commands

From the repo root or `server/`:

```bash
npm run migrate
```

The runner applies only `.sql` files in this directory (not `archive/`).

## Fresh database

Run `npm run migrate` once. Only `001-consolidated-schema.sql` is applied.

## Existing database (already on incremental migrations)

No action needed. The runner detects legacy `schema_migrations` rows (or an existing `tenants` table) and marks the consolidated migration as applied without re-running it.

## New schema changes

Add a **new** numbered file after the consolidated migration, for example:

- `002-my-feature.sql`
- `002-my-feature.sqlite.sql` (if SQLite needs different SQL)

Do not edit `001-consolidated-schema.sql` by hand. To regenerate it from archive after many incremental files accumulate, run:

```bash
cd server
npx tsx scripts/merge-migrations.ts
```

(That script moves incremental files into `archive/` and rebuilds the consolidated files.)
