import type BetterSqlite3 from "better-sqlite3";
import type { Skill, SkillInput, SkillTrigger, AccessLevel } from "./types.js";

/** Mode access ceilings — the maximum access level each mode allows. */
const MODE_CEILINGS: Record<string, AccessLevel> = {
  architect: "read-only",
  implement: "full",
  fix: "full",
};

/** Access level ordering for intersection: read-only < write < full. */
const ACCESS_ORDER: Record<string, number> = {
  "read-only": 0,
  write: 1,
  full: 2,
};

function minAccess(a: AccessLevel, b: AccessLevel): AccessLevel {
  return ACCESS_ORDER[a] <= ACCESS_ORDER[b] ? a : b;
}

function parseJsonColumn<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function rowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    content: row.content as string,
    kind: (row.kind as Skill["kind"]) ?? "knowledge",
    temperature: (row.temperature as number) ?? null,
    access_level: (row.access_level as Skill["access_level"]) ?? null,
    trigger_config: parseJsonColumn<SkillTrigger>(row.trigger_config),
    output_format: (row.output_format as string) ?? null,
    linked_skills: parseJsonColumn<string[]>(row.linked_skills),
    system_prompt: (row.system_prompt as string) ?? null,
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
  };
}

export class SkillStore {
  constructor(private db: BetterSqlite3.Database) {}

  get(id: string): Skill | null {
    const stmt = this.db.prepare("SELECT * FROM skills WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? rowToSkill(row) : null;
  }

  list(): Skill[] {
    const stmt = this.db.prepare("SELECT * FROM skills ORDER BY id");
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  getContent(id: string): string | null {
    const stmt = this.db.prepare("SELECT content FROM skills WHERE id = ?");
    const row = stmt.get(id) as unknown as { content: string } | undefined;
    return row?.content ?? null;
  }

  upsert(skill: SkillInput): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO skills (id, name, description, content, kind, temperature, access_level, trigger_config, output_format, linked_skills, system_prompt, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    );
    stmt.run(
      skill.id,
      skill.name,
      skill.description ?? null,
      skill.content,
      skill.kind ?? "knowledge",
      skill.temperature ?? null,
      skill.access_level ?? null,
      skill.trigger_config ? JSON.stringify(skill.trigger_config) : null,
      skill.output_format ?? null,
      skill.linked_skills ? JSON.stringify(skill.linked_skills) : null,
      skill.system_prompt ?? null,
    );
  }

  /** List only enhanced skills (kind = 'enhanced'). */
  listEnhanced(): Skill[] {
    const stmt = this.db.prepare(
      "SELECT * FROM skills WHERE kind = 'enhanced' ORDER BY id",
    );
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(rowToSkill);
  }

  /** Find enhanced skills matching a trigger scope and phase. */
  getByTrigger(scope: string, phase: string): Skill[] {
    // SQLite JSON extraction: trigger_config is a JSON string.
    // We fetch all enhanced skills and filter in-app for simplicity
    // (the set is small: 9 enhanced skills max).
    const all = this.listEnhanced();
    return all.filter((s) => {
      const tc = s.trigger_config;
      if (!tc) return false;
      const scopeMatch = !tc.scopes || tc.scopes.includes(scope);
      const phaseMatch = !tc.phase || tc.phase === phase;
      return scopeMatch && phaseMatch;
    });
  }

  /** Return a skill plus its resolved linked knowledge skills. */
  getWithLinked(id: string): { skill: Skill; linked: Skill[] } | null {
    const skill = this.get(id);
    if (!skill) return null;

    const linked: Skill[] = [];
    if (skill.linked_skills && skill.linked_skills.length > 0) {
      for (const linkedId of skill.linked_skills) {
        const ls = this.get(linkedId);
        if (ls) linked.push(ls);
      }
    }

    return { skill, linked };
  }

  /** Compute effective access by intersecting skill access_level with mode ceiling. */
  getEffectiveAccess(skillId: string, mode: string): AccessLevel | null {
    const skill = this.get(skillId);
    if (!skill || !skill.access_level) return null;

    const ceiling = MODE_CEILINGS[mode];
    if (!ceiling) return skill.access_level;

    return minAccess(skill.access_level, ceiling);
  }

  /** Populate the skill_mode_access table for a skill. */
  populateModeAccess(skillId: string): void {
    const skill = this.get(skillId);
    if (!skill || skill.kind !== "enhanced" || !skill.access_level) return;

    const deleteStmt = this.db.prepare(
      "DELETE FROM skill_mode_access WHERE skill_id = ?",
    );
    const insertStmt = this.db.prepare(
      "INSERT INTO skill_mode_access (skill_id, mode, effective_access) VALUES (?, ?, ?)",
    );

    deleteStmt.run(skillId);
    for (const mode of Object.keys(MODE_CEILINGS)) {
      const effective = minAccess(skill.access_level, MODE_CEILINGS[mode]);
      insertStmt.run(skillId, mode, effective);
    }
  }
}
