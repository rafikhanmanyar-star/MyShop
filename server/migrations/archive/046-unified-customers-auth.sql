-- ============================================================================
-- MIGRATION 046: Unified customer identity (POS + mobile), password reset queue
-- ============================================================================

-- Normalize Pakistan mobile input to E.164 storage: +923XXXXXXXXX (12 digits after +)
CREATE OR REPLACE FUNCTION myshop_normalize_pk_phone_e164(raw text)
RETURNS text AS $$
DECLARE
  d text;
BEGIN
  IF raw IS NULL OR trim(raw) = '' THEN RETURN NULL; END IF;
  d := regexp_replace(trim(raw), '\D', '', 'g');
  IF length(d) = 12 AND left(d, 2) = '92' THEN
    RETURN '+' || d;
  ELSIF length(d) = 11 AND left(d, 1) = '0' THEN
    RETURN '+92' || substring(d, 2);
  ELSIF length(d) = 10 AND left(d, 1) = '3' THEN
    RETURN '+92' || d;
  ELSIF length(d) = 13 AND left(d, 2) = '92' THEN
    RETURN '+' || d;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    password TEXT,
    address TEXT,
    is_loyalty_member BOOLEAN NOT NULL DEFAULT TRUE,
    created_from TEXT NOT NULL CHECK (created_from IN ('POS', 'MOBILE')),
    pos_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers (tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_name_lower ON customers (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_customers_pos_contact ON customers (tenant_id, pos_contact_id) WHERE pos_contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tenant_status ON password_reset_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_password_reset_created ON password_reset_requests (tenant_id, created_at DESC);

-- Backfill from mobile_customers (same id preserves mobile_orders FKs).
-- One row per (tenant, normalized phone); oldest registration wins if duplicates exist.
INSERT INTO customers (
    id, tenant_id, name, phone_number, password, address, is_loyalty_member, created_from, created_at, updated_at
)
SELECT DISTINCT ON (mc.tenant_id, myshop_normalize_pk_phone_e164(mc.phone))
    mc.id,
    mc.tenant_id,
    COALESCE(NULLIF(trim(mc.name), ''), 'Customer'),
    myshop_normalize_pk_phone_e164(mc.phone),
    mc.password,
    NULLIF(trim(mc.address_line1 || COALESCE(' ' || mc.address_line2, '')), ''),
    TRUE,
    'MOBILE',
    mc.created_at,
    mc.updated_at
FROM mobile_customers mc
WHERE myshop_normalize_pk_phone_e164(mc.phone) IS NOT NULL
ORDER BY mc.tenant_id, myshop_normalize_pk_phone_e164(mc.phone), mc.created_at ASC;

-- Link POS contacts to existing mobile-origin rows (same normalized phone)
UPDATE customers cu
SET pos_contact_id = c.id,
    updated_at = NOW()
FROM contacts c
WHERE c.tenant_id = cu.tenant_id
  AND c.type IN ('Customer', 'Client')
  AND myshop_normalize_pk_phone_e164(c.contact_no) IS NOT NULL
  AND regexp_replace(cu.phone_number, '\D', '', 'g') = regexp_replace(myshop_normalize_pk_phone_e164(c.contact_no), '\D', '', 'g')
  AND (cu.pos_contact_id IS NULL OR cu.pos_contact_id = c.id);

-- POS-only directory entries (contacts with phone, no unified row yet)
INSERT INTO customers (
    id, tenant_id, name, phone_number, password, address, is_loyalty_member, created_from, pos_contact_id, created_at, updated_at
)
SELECT
    c.id,
    c.tenant_id,
    c.name,
    myshop_normalize_pk_phone_e164(c.contact_no),
    NULL,
    c.address,
    TRUE,
    'POS',
    c.id,
    c.created_at,
    c.updated_at
FROM contacts c
WHERE c.type IN ('Customer', 'Client')
  AND myshop_normalize_pk_phone_e164(c.contact_no) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM customers cu
    WHERE cu.tenant_id = c.tenant_id
      AND regexp_replace(cu.phone_number, '\D', '', 'g')
        = regexp_replace(myshop_normalize_pk_phone_e164(c.contact_no), '\D', '', 'g')
  )
ON CONFLICT (tenant_id, phone_number) DO NOTHING;

-- Same E.164 can appear as different raw strings (e.g. 03… vs +92…), so multiple mobile_customers
-- rows can exist for one logical number. Canonicalizing phone below would violate UNIQUE(tenant_id, phone).
-- Keep earliest row per (tenant, normalized phone); reassign FKs; drop duplicate mobile_customers rows.
DROP TABLE IF EXISTS _mc_dup_map;
CREATE TEMP TABLE _mc_dup_map (loser_id TEXT PRIMARY KEY, winner_id TEXT NOT NULL);

INSERT INTO _mc_dup_map (loser_id, winner_id)
WITH norm AS (
    SELECT
        id,
        tenant_id,
        myshop_normalize_pk_phone_e164(phone) AS norm_phone,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id, myshop_normalize_pk_phone_e164(phone)
            ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
    FROM mobile_customers
    WHERE myshop_normalize_pk_phone_e164(phone) IS NOT NULL
)
SELECT l.id, w.id
FROM norm l
JOIN norm w
    ON w.tenant_id = l.tenant_id
    AND w.norm_phone = l.norm_phone
    AND w.rn = 1
WHERE l.rn > 1;

UPDATE mobile_orders mo
SET customer_id = m.winner_id
FROM _mc_dup_map m
WHERE mo.customer_id = m.loser_id;

UPDATE shop_sales_returns sr
SET mobile_customer_id = m.winner_id
FROM _mc_dup_map m
WHERE sr.mobile_customer_id = m.loser_id;

UPDATE budgets bw
SET
    total_budget_amount = bw.total_budget_amount + agg.added,
    updated_at = NOW()
FROM (
    SELECT
        bw_inner.id AS winner_row_id,
        SUM(b.total_budget_amount) AS added
    FROM budgets b
    JOIN _mc_dup_map m ON b.customer_id = m.loser_id
    JOIN budgets bw_inner
        ON bw_inner.customer_id = m.winner_id
        AND bw_inner.tenant_id = b.tenant_id
        AND bw_inner.month = b.month
        AND bw_inner.year = b.year
    GROUP BY bw_inner.id
) agg
WHERE bw.id = agg.winner_row_id;

DELETE FROM budgets b
USING _mc_dup_map m, budgets bw
WHERE b.customer_id = m.loser_id
  AND bw.customer_id = m.winner_id
  AND bw.tenant_id = b.tenant_id
  AND bw.month = b.month
  AND bw.year = b.year;

-- Remaining loser budgets: several losers can share the same (tenant, month, year) for one winner.
-- Merge into one row (MIN(id)), then delete the extras (avoids UNIQUE on budgets).
DROP TABLE IF EXISTS _budget_dup_del;
CREATE TEMP TABLE _budget_dup_del AS
SELECT lb.id
FROM (
    SELECT b.id, b.tenant_id, b.month, b.year, m.winner_id
    FROM budgets b
    INNER JOIN _mc_dup_map m ON b.customer_id = m.loser_id
) lb
INNER JOIN (
    SELECT winner_id, tenant_id, month, year, MIN(id) AS keep_id
    FROM (
        SELECT b.id, m.winner_id, b.tenant_id, b.month, b.year
        FROM budgets b
        INNER JOIN _mc_dup_map m ON b.customer_id = m.loser_id
    ) x
    GROUP BY winner_id, tenant_id, month, year
) k
    ON k.winner_id = lb.winner_id
    AND k.tenant_id = lb.tenant_id
    AND k.month = lb.month
    AND k.year = lb.year
WHERE lb.id <> k.keep_id;

UPDATE budgets b
SET
    customer_id = k.winner_id,
    total_budget_amount = k.total_amt,
    updated_at = NOW()
FROM (
    SELECT
        winner_id,
        tenant_id,
        month,
        year,
        MIN(id) AS keep_id,
        SUM(total_budget_amount) AS total_amt
    FROM (
        SELECT b.id, b.tenant_id, b.month, b.year, b.total_budget_amount, m.winner_id
        FROM budgets b
        INNER JOIN _mc_dup_map m ON b.customer_id = m.loser_id
    ) lb
    GROUP BY winner_id, tenant_id, month, year
) k
WHERE b.id = k.keep_id;

DELETE FROM budgets b
WHERE b.id IN (SELECT id FROM _budget_dup_del);

DROP TABLE IF EXISTS _budget_dup_del;

UPDATE mobile_customer_offer_usage uw
SET usage_count = uw.usage_count + agg.extra
FROM (
    SELECT
        m.winner_id,
        u.tenant_id,
        u.offer_id,
        SUM(u.usage_count)::integer AS extra
    FROM mobile_customer_offer_usage u
    JOIN _mc_dup_map m ON u.customer_id = m.loser_id
    GROUP BY m.winner_id, u.tenant_id, u.offer_id
) agg
WHERE uw.customer_id = agg.winner_id
  AND uw.tenant_id = agg.tenant_id
  AND uw.offer_id = agg.offer_id;

DELETE FROM mobile_customer_offer_usage u
USING _mc_dup_map m, mobile_customer_offer_usage uw
WHERE u.customer_id = m.loser_id
  AND uw.customer_id = m.winner_id
  AND uw.tenant_id = u.tenant_id
  AND uw.offer_id = u.offer_id;

DROP TABLE IF EXISTS _mc_offer_usage_dup_del;
CREATE TEMP TABLE _mc_offer_usage_dup_del AS
SELECT lu.id
FROM (
    SELECT u.id, u.tenant_id, u.offer_id, m.winner_id
    FROM mobile_customer_offer_usage u
    INNER JOIN _mc_dup_map m ON u.customer_id = m.loser_id
) lu
INNER JOIN (
    SELECT winner_id, tenant_id, offer_id, MIN(id) AS keep_id
    FROM (
        SELECT u.id, m.winner_id, u.tenant_id, u.offer_id
        FROM mobile_customer_offer_usage u
        INNER JOIN _mc_dup_map m ON u.customer_id = m.loser_id
    ) x
    GROUP BY winner_id, tenant_id, offer_id
) k
    ON k.winner_id = lu.winner_id
    AND k.tenant_id = lu.tenant_id
    AND k.offer_id = lu.offer_id
WHERE lu.id <> k.keep_id;

UPDATE mobile_customer_offer_usage u
SET
    customer_id = k.winner_id,
    usage_count = k.total_cnt,
    updated_at = NOW()
FROM (
    SELECT
        winner_id,
        tenant_id,
        offer_id,
        MIN(id) AS keep_id,
        SUM(usage_count)::integer AS total_cnt
    FROM (
        SELECT u.id, u.tenant_id, u.offer_id, u.usage_count, m.winner_id
        FROM mobile_customer_offer_usage u
        INNER JOIN _mc_dup_map m ON u.customer_id = m.loser_id
    ) lu
    GROUP BY winner_id, tenant_id, offer_id
) k
WHERE u.id = k.keep_id;

DELETE FROM mobile_customer_offer_usage u
WHERE u.id IN (SELECT id FROM _mc_offer_usage_dup_del);

DROP TABLE IF EXISTS _mc_offer_usage_dup_del;

DELETE FROM mobile_customers mc
USING _mc_dup_map m
WHERE mc.id = m.loser_id;

DROP TABLE IF EXISTS _mc_dup_map;

-- Rows skipped by the first backfill (normalize returned NULL) still need a customers parent before FK.
INSERT INTO customers (
    id, tenant_id, name, phone_number, password, address, is_loyalty_member, created_from, created_at, updated_at
)
SELECT
    mc.id,
    mc.tenant_id,
    COALESCE(NULLIF(trim(mc.name), ''), 'Customer'),
    COALESCE(
        myshop_normalize_pk_phone_e164(mc.phone),
        NULLIF(trim(mc.phone), ''),
        '__mc_orphan__' || mc.id
    ),
    mc.password,
    NULLIF(trim(mc.address_line1 || COALESCE(' ' || mc.address_line2, '')), ''),
    TRUE,
    'MOBILE',
    mc.created_at,
    mc.updated_at
FROM mobile_customers mc
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = mc.id);

-- Canonical phone format on contacts + mobile_customers
UPDATE contacts
SET contact_no = myshop_normalize_pk_phone_e164(contact_no),
    updated_at = NOW()
WHERE contact_no IS NOT NULL
  AND myshop_normalize_pk_phone_e164(contact_no) IS NOT NULL;

UPDATE mobile_customers mc
SET phone = cu.phone_number,
    updated_at = NOW()
FROM customers cu
WHERE cu.id = mc.id;

-- Enforce identity parent for every mobile app user row
ALTER TABLE mobile_customers
    DROP CONSTRAINT IF EXISTS mobile_customers_customer_fk;

ALTER TABLE mobile_customers
    ADD CONSTRAINT mobile_customers_customer_fk
    FOREIGN KEY (id) REFERENCES customers(id) ON DELETE CASCADE;

-- Search performance on POS customer directory
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_customer_type ON contacts (tenant_id, type)
    WHERE type IN ('Customer', 'Client');
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_name_lower ON contacts (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_contact_no ON contacts (tenant_id, contact_no);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_address_lower ON contacts (tenant_id, lower(COALESCE(address, '')));

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON customers;
CREATE POLICY tenant_isolation ON customers FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON password_reset_requests;
CREATE POLICY tenant_isolation ON password_reset_requests FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
