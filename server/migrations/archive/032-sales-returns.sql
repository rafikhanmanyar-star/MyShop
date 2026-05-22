-- Sales returns / refunds (POS shop_sales only)

CREATE TABLE IF NOT EXISTS shop_sales_returns (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    return_number TEXT NOT NULL,
    original_sale_id TEXT NOT NULL REFERENCES shop_sales(id) ON DELETE RESTRICT,
    customer_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES shop_branches(id) ON DELETE SET NULL,
    return_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    return_type TEXT NOT NULL CHECK (return_type IN ('FULL', 'PARTIAL')),
    refund_method TEXT NOT NULL CHECK (refund_method IN ('CASH', 'BANK', 'WALLET', 'ADJUSTMENT')),
    total_return_amount DECIMAL(15, 2) NOT NULL,
    notes TEXT,
    bank_account_id TEXT REFERENCES shop_bank_accounts(id) ON DELETE SET NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_shop_sales_returns_tenant_date ON shop_sales_returns (tenant_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_shop_sales_returns_original_sale ON shop_sales_returns (tenant_id, original_sale_id);

CREATE TABLE IF NOT EXISTS shop_sales_return_items (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sales_return_id TEXT NOT NULL REFERENCES shop_sales_returns(id) ON DELETE CASCADE,
    sale_line_item_id TEXT NOT NULL REFERENCES shop_sale_items(id) ON DELETE RESTRICT,
    product_id TEXT NOT NULL REFERENCES shop_products(id) ON DELETE RESTRICT,
    quantity DECIMAL(15, 2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(15, 2) NOT NULL,
    total_price DECIMAL(15, 2) NOT NULL,
    reason TEXT,
    restock BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_sales_return_items_return ON shop_sales_return_items (tenant_id, sales_return_id);
CREATE INDEX IF NOT EXISTS idx_shop_sales_return_items_line ON shop_sales_return_items (sale_line_item_id);
