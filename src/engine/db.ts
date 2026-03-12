import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Returns the default database path: ~/.config/spavn-agents/spavn.db
 */
export function getDefaultDbPath(): string {
  return path.join(os.homedir(), ".config", "spavn-agents", "spavn.db");
}

/**
 * Creates (or opens) a better-sqlite3 database with WAL mode and foreign keys enabled.
 *
 * @param dbPath - Absolute path to the SQLite file. Defaults to ~/.config/spavn-agents/spavn.db
 * @returns The configured Database instance
 */
export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? getDefaultDbPath();

  // Ensure the parent directory exists
  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Enforce foreign key constraints
  db.pragma("foreign_keys = ON");

  return db;
}
