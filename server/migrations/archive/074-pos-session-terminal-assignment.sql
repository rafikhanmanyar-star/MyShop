-- Bind desktop POS logins to a physical terminal: one active session per terminal license.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS pos_terminal_id TEXT REFERENCES shop_terminals(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_pos_terminal_unique
ON user_sessions (pos_terminal_id)
WHERE pos_terminal_id IS NOT NULL;
