import type BetterSqlite3 from "better-sqlite3";
import type { Skill, SkillInput } from "./types.js";

export class SkillStore {
  constructor(private db: BetterSqlite3.Database) {}

  get(id: string): Skill | null {
    const stmt = this.db.prepare("SELECT * FROM skills WHERE id = ?");
    return (stmt.get(id) as unknown as Skill) ?? null;
  }

  list(): Skill[] {
    const stmt = this.db.prepare("SELECT * FROM skills ORDER BY id");
    return stmt.all() as unknown as Skill[];
  }

  getContent(id: string): string | null {
    const stmt = this.db.prepare("SELECT content FROM skills WHERE id = ?");
    const row = stmt.get(id) as unknown as { content: string } | undefined;
    return row?.content ?? null;
  }

  upsert(skill: SkillInput): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO skills (id, name, description, content, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    );
    stmt.run(skill.id, skill.name, skill.description ?? null, skill.content);
  }
}
