ALTER TABLE user_sessions ADD COLUMN pos_terminal_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_pos_terminal_unique
ON user_sessions (pos_terminal_id)
WHERE pos_terminal_id IS NOT NULL;
