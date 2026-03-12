import type BetterSqlite3 from "better-sqlite3";
import type { Model } from "./types.js";

export class ModelStore {
  constructor(private db: BetterSqlite3.Database) {}

  get(id: string): Model | null {
    const stmt = this.db.prepare("SELECT * FROM models WHERE id = ?");
    return (stmt.get(id) as unknown as Model) ?? null;
  }

  list(filter?: { tier?: string }): Model[] {
    if (filter?.tier) {
      const stmt = this.db.prepare(
        "SELECT * FROM models WHERE tier = ? ORDER BY provider, name",
      );
      return stmt.all(filter.tier) as unknown as Model[];
    }
    const stmt = this.db.prepare(
      "SELECT * FROM models ORDER BY provider, name",
    );
    return stmt.all() as unknown as Model[];
  }

  upsert(model: Model): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO models (id, name, provider, tier, description)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(model.id, model.name, model.provider, model.tier, model.description);
  }
}
