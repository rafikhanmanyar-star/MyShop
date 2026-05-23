-- ============================================================================
-- MIGRATION 086: Customer feedback & product request module
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_feedback (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES mobile_orders(id) ON DELETE SET NULL,
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'product_request', 'complaint', 'suggestion', 'delivery_feedback', 'app_feedback', 'feature_request'
    )),
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'under_review', 'responded', 'resolved'
    )),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    severity_score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_status
    ON customer_feedback (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_tenant_type
    ON customer_feedback (tenant_id, feedback_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_customer
    ON customer_feedback (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_priority
    ON customer_feedback (tenant_id, priority, created_at DESC)
    WHERE status NOT IN ('resolved');

ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON customer_feedback;
CREATE POLICY tenant_isolation ON customer_feedback FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Ratings (1 row per feedback)
CREATE TABLE IF NOT EXISTS feedback_ratings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
    overall_rating SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
    delivery_rating SMALLINT CHECK (delivery_rating BETWEEN 1 AND 5),
    product_quality_rating SMALLINT CHECK (product_quality_rating BETWEEN 1 AND 5),
    UNIQUE (feedback_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_ratings_tenant ON feedback_ratings (tenant_id, feedback_id);

ALTER TABLE feedback_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON feedback_ratings;
CREATE POLICY tenant_isolation ON feedback_ratings FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Product requests linked to feedback
CREATE TABLE IF NOT EXISTS product_requests (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES mobile_customers(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    notes TEXT,
    barcode TEXT,
    normalized_key TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_requests_tenant_key
    ON product_requests (tenant_id, normalized_key);
CREATE INDEX IF NOT EXISTS idx_product_requests_feedback
    ON product_requests (tenant_id, feedback_id);

ALTER TABLE product_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON product_requests;
CREATE POLICY tenant_isolation ON product_requests FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Attachments (photos)
CREATE TABLE IF NOT EXISTS feedback_attachments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'recommendation')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_feedback
    ON feedback_attachments (tenant_id, feedback_id);

ALTER TABLE feedback_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON feedback_attachments;
CREATE POLICY tenant_isolation ON feedback_attachments FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());

-- Staff / customer replies
CREATE TABLE IF NOT EXISTS feedback_replies (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feedback_id TEXT NOT NULL REFERENCES customer_feedback(id) ON DELETE CASCADE,
    author_type TEXT NOT NULL CHECK (author_type IN ('staff', 'customer')),
    author_id TEXT,
    author_name TEXT,
    message TEXT NOT NULL,
    is_thank_you BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback
    ON feedback_replies (tenant_id, feedback_id, created_at);

ALTER TABLE feedback_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON feedback_replies;
CREATE POLICY tenant_isolation ON feedback_replies FOR ALL
    USING (tenant_id = get_current_tenant_id())
    WITH CHECK (tenant_id = get_current_tenant_id());
