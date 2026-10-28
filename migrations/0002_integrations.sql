-- Additive only: existing users, sessions and workspace are not modified.
CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  browser_hash TEXT NOT NULL,
  payload_ciphertext TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_expiry ON integration_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS integration_accounts (
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  connected_by TEXT NOT NULL REFERENCES users(id),
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, account_id)
);
