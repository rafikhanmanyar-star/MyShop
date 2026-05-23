-- Users-branch assignment and optional user-selected branch for multi-branch access control.
-- If users_branches has no rows for a user, they can access all branches of their tenant (current behavior).

CREATE TABLE IF NOT EXISTS users_branches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES shop_branches(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_users_branches_user_id ON users_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_users_branches_branch_id ON users_branches(branch_id);

-- Optional: store user's last selected branch (client can still persist in localStorage; this allows server to return it)
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_selected_branch_id TEXT REFERENCES shop_branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_selected_branch ON users(user_selected_branch_id);

COMMENT ON TABLE users_branches IS 'Optional: restrict user access to specific branches. Empty = access all branches of tenant.';
COMMENT ON COLUMN users.user_selected_branch_id IS 'Optional: last branch selected by user (can be used to pre-fill branch context).';
