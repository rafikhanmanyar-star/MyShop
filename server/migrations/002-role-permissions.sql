-- Migration to normalize user roles and permissions

-- 1. Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create role_permissions linking table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. Seed basic roles
INSERT INTO roles (id, name, description) VALUES 
('admin', 'Admin', 'Full system access'),
('accountant', 'Accountant', 'Access to accounting and procurement'),
('pos_cashier', 'POS Cashier', 'Access to POS screen only')
ON CONFLICT (id) DO NOTHING;

-- 5. Seed basic permissions
INSERT INTO permissions (id, name, description) VALUES 
('manage_users', 'Manage Users', 'Can create and edit users'),
('manage_branches', 'Manage Branches', 'Can create and edit branches'),
('manage_inventory', 'Manage Inventory', 'Can adjust stock and view products'),
('manage_procurement', 'Manage Procurement', 'Can create purchase orders/vendors'),
('view_reports', 'View Reports', 'Can see BI dashboards'),
('access_pos', 'Access POS', 'Can use the checkout screen'),
('access_accounting', 'Access Accounting', 'Can view ledgers and financial statements')
ON CONFLICT (id) DO NOTHING;

-- 6. Link roles to permissions
-- Admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'admin', id FROM permissions
ON CONFLICT DO NOTHING;

-- Accountant gets specific ones
INSERT INTO role_permissions (role_id, permission_id) VALUES 
('accountant', 'manage_inventory'),
('accountant', 'manage_procurement'),
('accountant', 'view_reports'),
('accountant', 'access_accounting')
ON CONFLICT DO NOTHING;

-- POS Cashier gets only POS
INSERT INTO role_permissions (role_id, permission_id) VALUES 
('pos_cashier', 'access_pos')
ON CONFLICT DO NOTHING;
