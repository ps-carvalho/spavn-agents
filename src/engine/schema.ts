import type Database from "better-sqlite3";

export const CURRENT_SCHEMA_VERSION = 1;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('primary','subagent')),
  temperature REAL DEFAULT 0.3,
  system_prompt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_tools (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (agent_id, tool_name)
);

CREATE TABLE IF NOT EXISTS agent_bash_permissions (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('allow','ask','deny')),
  PRIMARY KEY (agent_id, pattern)
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  binding TEXT NOT NULL CHECK(binding IN ('auto','recommended')),
  PRIMARY KEY (agent_id, skill_id)
);

CREATE TABLE IF NOT EXISTS cli_targets (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  config_dir TEXT NOT NULL,
  agent_file_format TEXT NOT NULL,
  instructions_file TEXT
);

CREATE TABLE IF NOT EXISTS agent_target_config (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES cli_targets(id) ON DELETE CASCADE,
  native_name TEXT,
  tools_override TEXT,
  disallowed_tools TEXT,
  model_override TEXT,
  extra_frontmatter TEXT,
  PRIMARY KEY (agent_id, target_id)
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('premium','standard','fast')),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installations (
  target_id TEXT NOT NULL REFERENCES cli_targets(id),
  scope TEXT NOT NULL CHECK(scope IN ('global','project')),
  path TEXT NOT NULL,
  installed_at TEXT DEFAULT (datetime('now')),
  version TEXT NOT NULL,
  PRIMARY KEY (target_id, scope, path)
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);
`;

/**
 * Reads the current schema version from the database.
 * Returns 0 if the schema_version table does not exist yet (fresh database).
 */
export function getSchemaVersion(db: Database.Database): number {
  // Check whether the schema_version table exists
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get();

  if (!tableExists) {
    return 0;
  }

  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_version")
    .get() as { version: number | null } | undefined;

  return row?.version ?? 0;
}

/**
 * Creates all tables (if they don't already exist) and records the schema version.
 * All DDL runs inside a transaction for atomicity.
 */
export function initializeSchema(db: Database.Database): void {
  const migrate = db.transaction(() => {
    // Create all tables
    db.exec(CREATE_TABLES_SQL);

    // Check current version and apply migrations
    const version = getSchemaVersion(db);

    if (version === 0) {
      // Fresh database — record initial schema version
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
        CURRENT_SCHEMA_VERSION
      );
    }

    // Future migrations would go here:
    // if (version < 2) { migrateTo2(db); }
    // if (version < 3) { migrateTo3(db); }
  });

  migrate();
}
