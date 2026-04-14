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
