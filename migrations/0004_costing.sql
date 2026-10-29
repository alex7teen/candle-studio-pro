-- Sidecar accounting settings preserve original purchase transactions.
CREATE TABLE IF NOT EXISTS mf_purchase_costing (purchase_id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mf_supplier_limits (user_id TEXT NOT NULL REFERENCES users(id), window INTEGER NOT NULL, requests INTEGER NOT NULL CHECK(requests<=60), PRIMARY KEY(user_id,window));
