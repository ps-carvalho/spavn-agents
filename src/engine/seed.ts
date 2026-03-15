// ---------------------------------------------------------------------------
// Spavn Engine — Seed / Import module
// Reads .opencode/ agent and skill markdown files and imports them into SQLite.
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";
import type Database from "better-sqlite3";
import { AgentStore } from "./agents.js";
import { SkillStore } from "./skills.js";
import { ModelStore } from "./models.js";
import { TargetStore } from "./targets.js";
import { MODEL_REGISTRY } from "../registry.js";
import type { AgentMode, PermissionLevel, SkillKind, AccessLevel, SkillTrigger, TriggerPhase } from "./types.js";

// ---- Public interface ------------------------------------------------------

export interface SeedResult {
  agents: number;
  skills: number;
  models: number;
  targets: number;
}

/**
 * Populate the database from .opencode/ markdown files and static registries.
 * All operations are idempotent (INSERT OR REPLACE) and wrapped in a single
 * transaction for atomicity.
 */
export function seedDatabase(db: Database.Database, opencodeDir: string): SeedResult {
  const agents = new AgentStore(db);
  const skills = new SkillStore(db);
  const models = new ModelStore(db);
  const targets = new TargetStore(db);

  const result: SeedResult = { agents: 0, skills: 0, models: 0, targets: 0 };

  const run = db.transaction(() => {
    result.agents = seedAgents(agents, opencodeDir);
    result.skills = seedSkills(skills, opencodeDir);
    result.models = seedModels(models);
    result.targets = seedTargets(targets);
  });

  run();
  return result;
}

// ---- Agent seeding ---------------------------------------------------------

function seedAgents(store: AgentStore, opencodeDir: string): number {
  const agentsDir = path.join(opencodeDir, "agents");
  if (!fs.existsSync(agentsDir)) return 0;

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  let count = 0;

  for (const file of files) {
    const id = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(agentsDir, file), "utf-8");
    const parsed = parseFrontmatter(raw);

    if (!parsed) continue;

    const { frontmatter, body } = parsed;

    store.upsert({
      id,
      description: (frontmatter.description as string) ?? "",
      mode: (frontmatter.mode as AgentMode) ?? "subagent",
      temperature: parseFloat(String(frontmatter.temperature ?? "0")),
      system_prompt: body.trim(),
    });

    // -- Tools --
    const tools = frontmatter.tools as Record<string, unknown> | undefined;
    if (tools && typeof tools === "object") {
      const toolMap: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(tools)) {
        toolMap[k] = v === true || v === "true";
      }
      store.setTools(id, toolMap);
    }

    // -- Bash permissions --
    const permission = frontmatter.permission as
      | Record<string, unknown>
      | undefined;
    if (permission && typeof permission === "object") {
      const bashPerms: Record<string, string> = {};

      // edit permission → stored as a bash permission with pattern "__edit__"
      if (permission.edit !== undefined) {
        bashPerms["__edit__"] = String(permission.edit) as PermissionLevel;
      }

      const bash = permission.bash;
      if (typeof bash === "string") {
        // Simple string value: all patterns get this permission (e.g. "deny", "ask")
        bashPerms["*"] = bash;
      } else if (bash && typeof bash === "object") {
        // Record<pattern, permission>
        for (const [pattern, perm] of Object.entries(
          bash as Record<string, unknown>,
        )) {
          bashPerms[pattern] = String(perm);
        }
      }

      if (Object.keys(bashPerms).length > 0) {
        store.setBashPermissions(id, bashPerms);
      }
    }

    count++;
  }

  return count;
}

// ---- Skill seeding ---------------------------------------------------------

function seedSkills(store: SkillStore, opencodeDir: string): number {
  const skillsDir = path.join(opencodeDir, "skills");
  if (!fs.existsSync(skillsDir)) return 0;

  const dirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  let count = 0;

  for (const dir of dirs) {
    const skillFile = path.join(skillsDir, dir.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const raw = fs.readFileSync(skillFile, "utf-8");
    const parsed = parseFrontmatter(raw);
    const fm = parsed?.frontmatter ?? {};

    const kind = (fm.kind as SkillKind) ?? "knowledge";
    const isEnhanced = kind === "enhanced";

    // For enhanced skills, split body into system_prompt (behavioral)
    // and keep full raw as content. For knowledge skills, content is the full file.
    let systemPrompt: string | null = null;
    if (isEnhanced && parsed) {
      systemPrompt = parsed.body.trim() || null;
    }

    // Parse trigger config from frontmatter
    let triggerConfig: SkillTrigger | null = null;
    const trigger = fm.trigger as Record<string, unknown> | undefined;
    if (trigger && typeof trigger === "object") {
      triggerConfig = {
        scopes: Array.isArray(trigger.scopes)
          ? (trigger.scopes as string[])
          : typeof trigger.scopes === "string"
            ? (trigger.scopes as string).split(",").map((s: string) => s.trim())
            : undefined,
        file_patterns: Array.isArray(trigger.file_patterns)
          ? (trigger.file_patterns as string[])
          : typeof trigger.file_patterns === "string"
            ? (trigger.file_patterns as string).split(",").map((s: string) => s.trim())
            : undefined,
        phase: (trigger.phase as TriggerPhase) ?? undefined,
      };
    }

    // Parse linked_skills
    let linkedSkills: string[] | null = null;
    const rawLinked = fm.linked_skills;
    if (Array.isArray(rawLinked)) {
      linkedSkills = rawLinked as string[];
    } else if (typeof rawLinked === "string" && rawLinked.length > 0) {
      linkedSkills = rawLinked.split(",").map((s) => s.trim());
    }

    store.upsert({
      id: dir.name,
      name: fm.name ? String(fm.name) : dir.name,
      description: fm.description ? String(fm.description) : null,
      content: raw,
      kind,
      temperature: fm.temperature !== undefined
        ? parseFloat(String(fm.temperature))
        : null,
      access_level: (fm.access_level as AccessLevel) ?? null,
      trigger_config: triggerConfig,
      output_format: fm.output_format ? String(fm.output_format) : null,
      linked_skills: linkedSkills,
      system_prompt: systemPrompt,
    });

    // Populate mode access for enhanced skills
    if (isEnhanced && fm.access_level) {
      store.populateModeAccess(dir.name);
    }

    count++;
  }

  return count;
}

// ---- Model seeding ---------------------------------------------------------

function seedModels(store: ModelStore): number {
  for (const entry of MODEL_REGISTRY) {
    store.upsert({
      id: entry.id,
      name: entry.name,
      provider: entry.provider,
      tier: entry.tier,
      description: entry.description,
    });
  }
  return MODEL_REGISTRY.length;
}

// ---- Target seeding --------------------------------------------------------

const BUILTIN_TARGETS = [
  {
    id: "opencode",
    display_name: "OpenCode",
    config_dir: "~/.config/opencode",
    agent_file_format: "opencode_md",
    instructions_file: null,
  },
] as const;

function seedTargets(store: TargetStore): number {
  for (const target of BUILTIN_TARGETS) {
    store.upsertTarget({
      id: target.id,
      display_name: target.display_name,
      config_dir: target.config_dir,
      agent_file_format: target.agent_file_format,
      instructions_file: target.instructions_file,
    });
  }
  return BUILTIN_TARGETS.length;
}

// ---- Simple YAML frontmatter parser ----------------------------------------

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse YAML-like frontmatter delimited by `---`.
 * Handles:
 *   - Top-level key: value pairs
 *   - Nested objects via indentation (one level deep)
 *   - Boolean (true/false), number, and string values
 *   - Comments (lines starting with #)
 *
 * This is intentionally minimal to avoid a YAML library dependency.
 */
function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;

  // Find the closing --- delimiter
  const afterFirst = trimmed.indexOf("\n");
  if (afterFirst === -1) return null;

  const rest = trimmed.slice(afterFirst + 1);
  const closingIdx = rest.indexOf("\n---");
  if (closingIdx === -1) return null;

  const frontmatterStr = rest.slice(0, closingIdx);
  const body = rest.slice(closingIdx + 4); // skip past "\n---"

  const result: Record<string, unknown> = {};
  const lines = frontmatterStr.split("\n");

  // Track up to 3 levels: top (indent 0), level1 (indent 2), level2 (indent 4+)
  let l0Key: string | null = null;
  let l0Obj: Record<string, unknown> | null = null;
  let l1Key: string | null = null;
  let l1Obj: Record<string, unknown> | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const kv = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (!kv) continue;

    const rawKey = kv[1].trim();
    // Strip surrounding quotes from key (e.g., "git status*" → git status*)
    const key = (rawKey.startsWith('"') && rawKey.endsWith('"'))
      || (rawKey.startsWith("'") && rawKey.endsWith("'"))
      ? rawKey.slice(1, -1)
      : rawKey;
    const val = kv[2].trim();

    if (indent === 0) {
      // Top-level key
      l1Key = null;
      l1Obj = null;
      if (val === "") {
        l0Key = key;
        l0Obj = null; // will be created on first nested line
      } else {
        l0Key = key;
        l0Obj = null;
        result[key] = parseScalar(val);
      }
    } else if (indent >= 2 && indent < 4 && l0Key !== null) {
      // Level 1 nested (2 spaces) — belongs to l0Key
      l1Key = null;
      l1Obj = null;
      if (l0Obj === null) {
        l0Obj = {};
        result[l0Key] = l0Obj;
      }
      if (val === "") {
        l1Key = key;
        l1Obj = null;
      } else {
        l1Key = key;
        l1Obj = null;
        l0Obj[key] = parseScalar(val);
      }
    } else if (indent >= 4 && l0Key !== null && l1Key !== null) {
      // Level 2 nested (4+ spaces) — belongs to l1Key within l0Key
      if (l0Obj === null) {
        l0Obj = {};
        result[l0Key] = l0Obj;
      }
      if (l1Obj === null) {
        l1Obj = {};
        l0Obj[l1Key] = l1Obj;
      }
      l1Obj[key] = parseScalar(val);
    } else if (indent >= 2 && l0Key !== null) {
      // Fallback for deeper nesting without l1Key
      if (l0Obj === null) {
        l0Obj = {};
        result[l0Key] = l0Obj;
      }
      l0Obj[key] = parseScalar(val);
    }
  }

  return { frontmatter: result, body };
}

/**
 * Parse a scalar value from a YAML-like string.
 * Returns boolean, number, string, or string[] (for inline arrays).
 */
function parseScalar(val: string): boolean | number | string | string[] {
  // Remove surrounding quotes if present
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }

  // Inline YAML arrays: [a, b, c] or ["a", "b"]
  if (val.startsWith("[") && val.endsWith("]")) {
    const inner = val.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => {
      const trimmed = item.trim();
      // Strip surrounding quotes from each element
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    });
  }

  // Booleans
  if (val === "true") return true;
  if (val === "false") return false;

  // Null
  if (val === "null" || val === "~") return "";

  // Numbers
  const num = Number(val);
  if (!Number.isNaN(num) && val !== "") return num;

  // Strip inline comments: "value # comment" -> "value"
  const commentIdx = val.indexOf(" #");
  if (commentIdx !== -1) {
    return parseScalar(val.slice(0, commentIdx).trim());
  }

  return val;
}
