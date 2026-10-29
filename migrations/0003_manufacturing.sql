-- Additive manufacturing schema. Existing tables and data are preserved.
CREATE TABLE IF NOT EXISTS mf_materials (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('g','ml','pcs')),
 kind TEXT NOT NULL, specification TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mf_images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS mf_containers (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES mf_materials(id), name TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS mf_moulds (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS mf_cavities (id TEXT PRIMARY KEY, mould_id TEXT NOT NULL REFERENCES mf_moulds(id), name TEXT NOT NULL, count INTEGER NOT NULL CHECK(count>0), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS mf_calibrations (
 id TEXT PRIMARY KEY, cavity_id TEXT NOT NULL REFERENCES mf_cavities(id), wax_id TEXT REFERENCES mf_materials(id), formulation TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('water-volume','water-mass','actual-wax')), measured TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mf_decorations (
 id TEXT PRIMARY KEY, cavity_id TEXT NOT NULL REFERENCES mf_cavities(id), calibration_id TEXT REFERENCES mf_calibrations(id),
 name TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
);
CREATE TABLE IF NOT EXISTS mf_recipes (
 id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), name TEXT NOT NULL, type TEXT NOT NULL,
 data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id,version)
);
CREATE TABLE IF NOT EXISTS mf_components (
 recipe_id TEXT NOT NULL, recipe_version INTEGER NOT NULL, component_id TEXT NOT NULL, kind TEXT NOT NULL,
 material_id TEXT REFERENCES mf_materials(id), decoration_id TEXT REFERENCES mf_decorations(id), data TEXT NOT NULL,
 PRIMARY KEY(recipe_id,recipe_version,component_id), FOREIGN KEY(recipe_id,recipe_version) REFERENCES mf_recipes(id,version)
);
CREATE TABLE IF NOT EXISTS mf_production (
 id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, batch_number TEXT NOT NULL UNIQUE, recipe_id TEXT, recipe_version INTEGER,
 decoration_id TEXT REFERENCES mf_decorations(id), kind TEXT NOT NULL CHECK(kind IN ('candles','decorations','reversal','actual')),
 quantity INTEGER NOT NULL CHECK(quantity>=0), expected_revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), produced_at TEXT NOT NULL, reverses TEXT UNIQUE REFERENCES mf_production(id),
 FOREIGN KEY(recipe_id,recipe_version) REFERENCES mf_recipes(id,version)
);
CREATE TRIGGER IF NOT EXISTS mf_production_revision BEFORE INSERT ON mf_production BEGIN
 SELECT CASE WHEN COALESCE((SELECT revision FROM workspace WHERE id=1),-1) <> NEW.expected_revision THEN RAISE(ABORT,'manufacturing_workspace_conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS mf_production_immutable BEFORE UPDATE ON mf_production BEGIN SELECT RAISE(ABORT,'production_history_is_immutable'); END;
CREATE TRIGGER IF NOT EXISTS mf_recipe_immutable BEFORE UPDATE OF data,name,type ON mf_recipes BEGIN SELECT RAISE(ABORT,'recipe_versions_are_immutable'); END;
CREATE TABLE IF NOT EXISTS mf_decoration_movements (
 id TEXT PRIMARY KEY, decoration_id TEXT NOT NULL REFERENCES mf_decorations(id), production_id TEXT NOT NULL REFERENCES mf_production(id),
 quantity INTEGER NOT NULL CHECK(quantity<>0), decoration_revision INTEGER NOT NULL DEFAULT 1, unit_cost TEXT NOT NULL, notes TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS mf_decoration_stock BEFORE INSERT ON mf_decoration_movements BEGIN
 SELECT CASE WHEN COALESCE((SELECT SUM(quantity) FROM mf_decoration_movements WHERE decoration_id=NEW.decoration_id AND decoration_revision=NEW.decoration_revision),0)+NEW.quantity<0 THEN RAISE(ABORT,'insufficient_decoration_stock') END;
END;
CREATE TABLE IF NOT EXISTS mf_material_movements (
 id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES mf_materials(id), production_id TEXT NOT NULL REFERENCES mf_production(id),
 quantity TEXT NOT NULL, unit TEXT NOT NULL, unit_cost TEXT, supplier_lots TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mf_quality (
 id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, recipe_version INTEGER NOT NULL, production_id TEXT REFERENCES mf_production(id),
 kind TEXT NOT NULL CHECK(kind IN ('burn','compliance','inspection')), outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','pending')),
 data TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id), recorded_at TEXT NOT NULL,
 FOREIGN KEY(recipe_id,recipe_version) REFERENCES mf_recipes(id,version)
);
CREATE TABLE IF NOT EXISTS mf_import_limits (user_id TEXT NOT NULL REFERENCES users(id), window INTEGER NOT NULL, requests INTEGER NOT NULL CHECK(requests<=10), PRIMARY KEY(user_id,window));
CREATE TABLE IF NOT EXISTS mf_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS mf_decoration_ledger ON mf_decoration_movements(decoration_id);
CREATE INDEX IF NOT EXISTS mf_quality_recipe ON mf_quality(recipe_id,recipe_version);
CREATE INDEX IF NOT EXISTS mf_production_date ON mf_production(produced_at);
