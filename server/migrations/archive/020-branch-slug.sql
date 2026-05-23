-- ============================================================================
-- MIGRATION 020: Branch URL slug for mobile ordering (QR per branch)
-- ============================================================================
-- Links shop_branches to a unique URL slug so each branch can have its own
-- QR code; mobile users scanning the QR at a branch door get orders routed
-- to that branch's POS.

ALTER TABLE shop_branches
    ADD COLUMN IF NOT EXISTS slug TEXT;

-- Unique slug globally (one slug = one branch)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_branches_slug ON shop_branches(slug) WHERE slug IS NOT NULL;

-- Backfill: set first branch of each tenant to tenant's slug (preserve existing behavior)
DO $$
DECLARE
    r RECORD;
    first_branch_id TEXT;
BEGIN
    FOR r IN SELECT id, slug FROM tenants WHERE slug IS NOT NULL
    LOOP
        SELECT id INTO first_branch_id
        FROM shop_branches
        WHERE tenant_id = r.id
        ORDER BY name ASC
        LIMIT 1;
        IF first_branch_id IS NOT NULL THEN
            UPDATE shop_branches SET slug = r.slug WHERE id = first_branch_id AND slug IS NULL;
        END IF;
    END LOOP;
END $$;
