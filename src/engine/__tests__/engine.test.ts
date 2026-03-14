import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import Database from "better-sqlite3";
import { createDatabase, getDefaultDbPath } from "../db.js";
import { initializeSchema, getSchemaVersion, CURRENT_SCHEMA_VERSION } from "../schema.js";
import { AgentStore } from "../agents.js";
import { SkillStore } from "../skills.js";
import { ModelStore } from "../models.js";
import { TargetStore } from "../targets.js";
import { seedDatabase } from "../seed.js";
import { SpavnEngine } from "../index.js";
import { getRenderer } from "../renderers/index.js";
// Side-effect imports: register renderers
import "../renderers/claude.js";
import "../renderers/opencode.js";
import type {
  Agent,
  AgentInput,
  Skill,
  SkillInput,
  Model,
  CliTarget,
  AgentTargetConfig,
} from "../types.js";

// Path to the real .opencode directory shipped with the package
const OPENCODE_DIR = path.resolve(__dirname, "..", "..", "..", ".opencode");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDbPath(): string {
  return path.join(
    os.tmpdir(),
    `spavn-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
}

function createTestDb(): Database.Database {
  const dbPath = tmpDbPath();
  const db = createDatabase(dbPath);
  initializeSchema(db);
  return db;
}

function cleanupDb(db: Database.Database): void {
  const dbPath = (db as unknown as { name: string }).name;
  try {
    db.close();
  } catch {
    // already closed
  }
  try {
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    // WAL and SHM sidecar files
    if (dbPath && fs.existsSync(dbPath + "-wal")) fs.unlinkSync(dbPath + "-wal");
    if (dbPath && fs.existsSync(dbPath + "-shm")) fs.unlinkSync(dbPath + "-shm");
  } catch {
    // best effort
  }
}

// ==========================================================================
// 1. Database & Schema
// ==========================================================================

describe("Database & Schema", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dbPath = tmpDbPath();
  });

  afterEach(() => {
    if (db) cleanupDb(db);
  });

  it("createDatabase creates the SQLite file on disk", () => {
    db = createDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("createDatabase enables WAL journal mode", () => {
    db = createDatabase(dbPath);
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
  });

  it("createDatabase enables foreign keys", () => {
    db = createDatabase(dbPath);
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("getDefaultDbPath returns a path under ~/.config/spavn-agents", () => {
    const p = getDefaultDbPath();
    expect(p).toContain(path.join(".config", "spavn-agents", "spavn.db"));
  });

  it("getSchemaVersion returns 0 on a fresh database before init", () => {
    db = createDatabase(dbPath);
    expect(getSchemaVersion(db)).toBe(0);
  });

  it("initializeSchema creates tables and sets schema version to 1", () => {
    db = createDatabase(dbPath);
    initializeSchema(db);
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("initializeSchema is idempotent — running twice does not throw or change version", () => {
    db = createDatabase(dbPath);
    initializeSchema(db);
    const v1 = getSchemaVersion(db);
    initializeSchema(db);
    const v2 = getSchemaVersion(db);
    expect(v1).toBe(v2);
    expect(v2).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("initializeSchema creates the expected tables", () => {
    db = createDatabase(dbPath);
    initializeSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "agent_bash_permissions",
        "agent_skills",
        "agent_target_config",
        "agent_tools",
        "agents",
        "cli_targets",
        "installations",
        "models",
        "schema_version",
        "skills",
        "user_config",
      ]),
    );
  });
});

// ==========================================================================
// 2. AgentStore
// ==========================================================================

describe("AgentStore", () => {
  let db: Database.Database;
  let store: AgentStore;

  beforeEach(() => {
    db = createTestDb();
    store = new AgentStore(db);
  });

  afterEach(() => cleanupDb(db));

  const sampleAgent: AgentInput = {
    id: "test-agent",
    description: "A test agent",
    mode: "subagent",
    temperature: 0.5,
    system_prompt: "You are a test agent.",
  };

  it("upsert + get round-trip preserves all fields", () => {
    store.upsert(sampleAgent);
    const agent = store.get("test-agent");
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe("test-agent");
    expect(agent!.description).toBe("A test agent");
    expect(agent!.mode).toBe("subagent");
    expect(agent!.temperature).toBe(0.5);
    expect(agent!.system_prompt).toBe("You are a test agent.");
    expect(agent!.created_at).toBeTruthy();
    expect(agent!.updated_at).toBeTruthy();
  });

  it("get returns null for non-existent agent", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("upsert overwrites existing agent on conflict", () => {
    store.upsert(sampleAgent);
    store.upsert({ ...sampleAgent, description: "Updated" });
    const agent = store.get("test-agent");
    expect(agent!.description).toBe("Updated");
  });

  it("list returns all agents ordered by id", () => {
    store.upsert({ ...sampleAgent, id: "b-agent" });
    store.upsert({ ...sampleAgent, id: "a-agent" });
    const agents = store.list();
    expect(agents).toHaveLength(2);
    expect(agents[0].id).toBe("a-agent");
    expect(agents[1].id).toBe("b-agent");
  });

  it("list filters by mode", () => {
    store.upsert({ ...sampleAgent, id: "primary-one", mode: "primary" });
    store.upsert({ ...sampleAgent, id: "sub-one", mode: "subagent" });
    store.upsert({ ...sampleAgent, id: "sub-two", mode: "subagent" });

    const primaries = store.list({ mode: "primary" });
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe("primary-one");

    const subs = store.list({ mode: "subagent" });
    expect(subs).toHaveLength(2);
  });

  it("setTools + getTools round-trip", () => {
    store.upsert(sampleAgent);
    store.setTools("test-agent", { read: true, write: false, bash: true });

    const tools = store.getTools("test-agent");
    expect(tools).toHaveLength(3);

    const toolMap = Object.fromEntries(tools.map((t) => [t.tool_name, t.allowed]));
    expect(toolMap.read).toBe(1); // SQLite stores as integer
    expect(toolMap.write).toBe(0);
    expect(toolMap.bash).toBe(1);
  });

  it("setTools batch-replaces existing tools", () => {
    store.upsert(sampleAgent);
    store.setTools("test-agent", { read: true, write: true });
    store.setTools("test-agent", { bash: true }); // replaces all

    const tools = store.getTools("test-agent");
    expect(tools).toHaveLength(1);
    expect(tools[0].tool_name).toBe("bash");
  });

  it("setBashPermissions + getBashPermissions round-trip", () => {
    store.upsert(sampleAgent);
    store.setBashPermissions("test-agent", {
      "*": "ask",
      "git status*": "allow",
    });

    const perms = store.getBashPermissions("test-agent");
    expect(perms).toHaveLength(2);

    const permMap = Object.fromEntries(perms.map((p) => [p.pattern, p.permission]));
    expect(permMap["*"]).toBe("ask");
    expect(permMap["git status*"]).toBe("allow");
  });

  it("setBashPermissions batch-replaces existing permissions", () => {
    store.upsert(sampleAgent);
    store.setBashPermissions("test-agent", { "*": "ask", "ls*": "allow" });
    store.setBashPermissions("test-agent", { "npm test*": "allow" });

    const perms = store.getBashPermissions("test-agent");
    expect(perms).toHaveLength(1);
    expect(perms[0].pattern).toBe("npm test*");
  });

  it("getSkills returns empty array when no skills bound", () => {
    store.upsert(sampleAgent);
    expect(store.getSkills("test-agent")).toEqual([]);
  });
});

// ==========================================================================
// 3. SkillStore
// ==========================================================================

describe("SkillStore", () => {
  let db: Database.Database;
  let store: SkillStore;

  beforeEach(() => {
    db = createTestDb();
    store = new SkillStore(db);
  });

  afterEach(() => cleanupDb(db));

  const sampleSkill: SkillInput = {
    id: "testing-strategies",
    name: "Testing Strategies",
    description: "Comprehensive testing patterns",
    content: "# Testing Strategies\n\nContent here.",
  };

  it("upsert + get round-trip preserves all fields", () => {
    store.upsert(sampleSkill);
    const skill = store.get("testing-strategies");
    expect(skill).not.toBeNull();
    expect(skill!.id).toBe("testing-strategies");
    expect(skill!.name).toBe("Testing Strategies");
    expect(skill!.description).toBe("Comprehensive testing patterns");
    expect(skill!.content).toBe("# Testing Strategies\n\nContent here.");
  });

  it("get returns null for non-existent skill", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("list returns skills ordered by id", () => {
    store.upsert({ ...sampleSkill, id: "z-skill" });
    store.upsert({ ...sampleSkill, id: "a-skill" });
    const skills = store.list();
    expect(skills).toHaveLength(2);
    expect(skills[0].id).toBe("a-skill");
    expect(skills[1].id).toBe("z-skill");
  });

  it("getContent returns content string for existing skill", () => {
    store.upsert(sampleSkill);
    const content = store.getContent("testing-strategies");
    expect(content).toBe("# Testing Strategies\n\nContent here.");
  });

  it("getContent returns null for non-existent skill", () => {
    expect(store.getContent("nonexistent")).toBeNull();
  });

  it("upsert with null description stores null", () => {
    store.upsert({ id: "no-desc", name: "No Desc", content: "body" });
    const skill = store.get("no-desc");
    expect(skill!.description).toBeNull();
  });
});

// ==========================================================================
// 4. ModelStore
// ==========================================================================

describe("ModelStore", () => {
  let db: Database.Database;
  let store: ModelStore;

  beforeEach(() => {
    db = createTestDb();
    store = new ModelStore(db);
  });

  afterEach(() => cleanupDb(db));

  const sampleModel: Model = {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    tier: "standard",
    description: "Best balance of intelligence and speed",
  };

  it("upsert + get round-trip preserves all fields", () => {
    store.upsert(sampleModel);
    const model = store.get("anthropic/claude-sonnet-4");
    expect(model).not.toBeNull();
    expect(model!.id).toBe("anthropic/claude-sonnet-4");
    expect(model!.name).toBe("Claude Sonnet 4");
    expect(model!.provider).toBe("Anthropic");
    expect(model!.tier).toBe("standard");
  });

  it("get returns null for non-existent model", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("list returns all models ordered by provider then name", () => {
    store.upsert(sampleModel);
    store.upsert({
      id: "openai/gpt-4",
      name: "GPT-4",
      provider: "OpenAI",
      tier: "premium",
      description: "OpenAI flagship",
    });

    const models = store.list();
    expect(models).toHaveLength(2);
    // Anthropic < OpenAI alphabetically
    expect(models[0].provider).toBe("Anthropic");
    expect(models[1].provider).toBe("OpenAI");
  });

  it("list filters by tier", () => {
    store.upsert(sampleModel); // standard
    store.upsert({
      id: "anthropic/haiku",
      name: "Haiku",
      provider: "Anthropic",
      tier: "fast",
      description: "Fast model",
    });

    const fast = store.list({ tier: "fast" });
    expect(fast).toHaveLength(1);
    expect(fast[0].id).toBe("anthropic/haiku");

    const standard = store.list({ tier: "standard" });
    expect(standard).toHaveLength(1);
    expect(standard[0].id).toBe("anthropic/claude-sonnet-4");
  });
});

// ==========================================================================
// 5. TargetStore
// ==========================================================================

describe("TargetStore", () => {
  let db: Database.Database;
  let store: TargetStore;

  beforeEach(() => {
    db = createTestDb();
    store = new TargetStore(db);
  });

  afterEach(() => cleanupDb(db));

  const sampleTarget: CliTarget = {
    id: "claude",
    display_name: "Claude Code",
    config_dir: "~/.claude",
    agent_file_format: "claude_md",
    instructions_file: "CLAUDE.md",
  };

  it("upsertTarget + getTarget round-trip", () => {
    store.upsertTarget(sampleTarget);
    const target = store.getTarget("claude");
    expect(target).not.toBeNull();
    expect(target!.id).toBe("claude");
    expect(target!.display_name).toBe("Claude Code");
    expect(target!.config_dir).toBe("~/.claude");
    expect(target!.instructions_file).toBe("CLAUDE.md");
  });

  it("getTarget returns null for non-existent target", () => {
    expect(store.getTarget("nonexistent")).toBeNull();
  });

  it("listTargets returns all targets ordered by id", () => {
    store.upsertTarget(sampleTarget);
    store.upsertTarget({
      id: "opencode",
      display_name: "OpenCode",
      config_dir: "~/.config/opencode",
      agent_file_format: "opencode_md",
      instructions_file: null,
    });
    const targets = store.listTargets();
    expect(targets).toHaveLength(2);
    expect(targets[0].id).toBe("claude");
    expect(targets[1].id).toBe("opencode");
  });

  it("AgentTargetConfig with JSON fields round-trips correctly", () => {
    // Need an agent and target first for FK constraints
    const agents = new AgentStore(db);
    agents.upsert({
      id: "architect",
      description: "Architect agent",
      mode: "primary",
      system_prompt: "Plan things.",
    });
    store.upsertTarget(sampleTarget);

    const config: AgentTargetConfig = {
      agent_id: "architect",
      target_id: "claude",
      native_name: null,
      tools_override: ["Read", "Glob", "Grep", "mcp__spavn-agents__plan_save"],
      disallowed_tools: ["Write", "Edit", "Bash"],
      model_override: "inherit",
      extra_frontmatter: { mcpServers: "spavn-agents" },
    };

    store.upsertAgentTargetConfig(config);
    const result = store.getAgentTargetConfig("architect", "claude");

    expect(result).not.toBeNull();
    expect(result!.tools_override).toEqual(config.tools_override);
    expect(result!.disallowed_tools).toEqual(config.disallowed_tools);
    expect(result!.extra_frontmatter).toEqual({ mcpServers: "spavn-agents" });
    expect(result!.model_override).toBe("inherit");
  });

  it("listAgentTargetConfigs returns configs for a given target", () => {
    const agents = new AgentStore(db);
    agents.upsert({ id: "a1", description: "A1", mode: "primary", system_prompt: "..." });
    agents.upsert({ id: "a2", description: "A2", mode: "subagent", system_prompt: "..." });
    store.upsertTarget(sampleTarget);

    store.upsertAgentTargetConfig({
      agent_id: "a1", target_id: "claude", native_name: null,
      tools_override: null, disallowed_tools: null, model_override: null, extra_frontmatter: null,
    });
    store.upsertAgentTargetConfig({
      agent_id: "a2", target_id: "claude", native_name: null,
      tools_override: null, disallowed_tools: null, model_override: null, extra_frontmatter: null,
    });

    const configs = store.listAgentTargetConfigs("claude");
    expect(configs).toHaveLength(2);
  });

  it("getConfig / setConfig stores and retrieves key-value pairs", () => {
    expect(store.getConfig("theme")).toBeNull();
    store.setConfig("theme", "dark");
    expect(store.getConfig("theme")).toBe("dark");
    store.setConfig("theme", "light"); // overwrite
    expect(store.getConfig("theme")).toBe("light");
  });

  it("recordInstallation + getInstallations round-trip", () => {
    store.upsertTarget(sampleTarget);
    store.recordInstallation("claude", "global", "/home/user/.claude", "4.2.0");

    const installs = store.getInstallations();
    expect(installs).toHaveLength(1);
    expect(installs[0].target_id).toBe("claude");
    expect(installs[0].scope).toBe("global");
    expect(installs[0].version).toBe("4.2.0");
    expect(installs[0].installed_at).toBeTruthy();
  });

  it("recordInstallation upserts on duplicate key", () => {
    store.upsertTarget(sampleTarget);
    store.recordInstallation("claude", "global", "/home/user/.claude", "4.1.0");
    store.recordInstallation("claude", "global", "/home/user/.claude", "4.2.0");

    const installs = store.getInstallations();
    expect(installs).toHaveLength(1);
    expect(installs[0].version).toBe("4.2.0");
  });
});

// ==========================================================================
// 6. Seed — uses real .opencode/ directory
// ==========================================================================

describe("Seed", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => cleanupDb(db));

  it("seedDatabase returns correct counts", () => {
    const result = seedDatabase(db, OPENCODE_DIR);
    expect(result.agents).toBe(4);    // 3 primary + 1 worker
    expect(result.skills).toBe(26);   // 17 knowledge + 9 enhanced
    expect(result.models).toBe(13);
    expect(result.targets).toBe(4);
  });

  it("architect agent has correct mode and temperature", () => {
    seedDatabase(db, OPENCODE_DIR);
    const agents = new AgentStore(db);
    const architect = agents.get("architect");

    expect(architect).not.toBeNull();
    expect(architect!.mode).toBe("primary");
    expect(architect!.temperature).toBeCloseTo(0.2);
  });

  it("architect has write=false, edit=false, bash=false in tools", () => {
    seedDatabase(db, OPENCODE_DIR);
    const agents = new AgentStore(db);
    const tools = agents.getTools("architect");

    const toolMap = Object.fromEntries(tools.map((t) => [t.tool_name, t.allowed]));
    expect(toolMap.write).toBe(0);
    expect(toolMap.edit).toBe(0);
    expect(toolMap.bash).toBe(0);
    expect(toolMap.read).toBe(1);
    expect(toolMap.skill).toBe(1);
  });

  it("worker agent has bash permissions with expected patterns", () => {
    seedDatabase(db, OPENCODE_DIR);
    const agents = new AgentStore(db);
    const perms = agents.getBashPermissions("worker");

    const permMap = Object.fromEntries(perms.map((p) => [p.pattern, p.permission]));
    expect(permMap["*"]).toBe("ask");
    expect(permMap["git status*"]).toBe("allow");
    expect(permMap["git log*"]).toBe("allow");
    expect(permMap["git diff*"]).toBe("allow");
    expect(permMap["__edit__"]).toBe("allow");
  });

  it("skills have non-empty content", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);
    const allSkills = skills.list();

    expect(allSkills.length).toBe(26);  // 17 knowledge + 9 enhanced
    for (const skill of allSkills) {
      expect(skill.content.length).toBeGreaterThan(0);
    }
  });

  it("enhanced skills have correct kind and fields", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);
    const enhanced = skills.listEnhanced();

    expect(enhanced.length).toBe(9);
    for (const skill of enhanced) {
      expect(skill.kind).toBe("enhanced");
      expect(skill.access_level).toBeTruthy();
      expect(skill.system_prompt).toBeTruthy();
    }
  });

  it("testing enhanced skill has correct trigger config", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);
    const testing = skills.get("testing");

    expect(testing).not.toBeNull();
    expect(testing!.kind).toBe("enhanced");
    expect(testing!.access_level).toBe("write");
    expect(testing!.trigger_config).not.toBeNull();
    expect(testing!.trigger_config!.scopes).toEqual(["low", "standard", "high"]);
    expect(testing!.trigger_config!.phase).toBe("quality-gate");
    expect(testing!.linked_skills).toEqual(["testing-strategies"]);
  });

  it("getByTrigger returns matching skills", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);

    const standardQG = skills.getByTrigger("standard", "quality-gate");
    const skillIds = standardQG.map((s) => s.id).sort();
    expect(skillIds).toContain("testing");
    expect(skillIds).toContain("security");
    expect(skillIds).toContain("audit");
  });

  it("getEffectiveAccess intersects with mode ceiling", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);

    // testing has access_level: write
    // architect mode ceiling: read-only → min(write, read-only) = read-only
    expect(skills.getEffectiveAccess("testing", "architect")).toBe("read-only");
    // implement mode ceiling: full → min(write, full) = write
    expect(skills.getEffectiveAccess("testing", "implement")).toBe("write");
  });

  it("getWithLinked resolves linked skills", () => {
    seedDatabase(db, OPENCODE_DIR);
    const skills = new SkillStore(db);

    const result = skills.getWithLinked("testing");
    expect(result).not.toBeNull();
    expect(result!.skill.id).toBe("testing");
    expect(result!.linked.length).toBe(1);
    expect(result!.linked[0].id).toBe("testing-strategies");
  });

  it("targets are seeded with claude and opencode", () => {
    seedDatabase(db, OPENCODE_DIR);
    const targets = new TargetStore(db);

    const claude = targets.getTarget("claude");
    expect(claude).not.toBeNull();
    expect(claude!.display_name).toBe("Claude Code");
    expect(claude!.instructions_file).toBe("CLAUDE.md");

    const opencode = targets.getTarget("opencode");
    expect(opencode).not.toBeNull();
    expect(opencode!.display_name).toBe("OpenCode");
    expect(opencode!.instructions_file).toBeNull();
  });

  it("seedDatabase is idempotent — running twice gives same counts", () => {
    const r1 = seedDatabase(db, OPENCODE_DIR);
    const r2 = seedDatabase(db, OPENCODE_DIR);

    expect(r1).toEqual(r2);

    // Verify no duplicates in the DB
    const agents = new AgentStore(db);
    expect(agents.list()).toHaveLength(4);
  });

  it("agent target configs are created for claude target", () => {
    seedDatabase(db, OPENCODE_DIR);
    const targets = new TargetStore(db);

    const configs = targets.listAgentTargetConfigs("claude");
    // Every agent should have a claude target config (4 agents)
    expect(configs.length).toBe(4);
  });

  it("architect claude target config has correct disallowed tools", () => {
    seedDatabase(db, OPENCODE_DIR);
    const targets = new TargetStore(db);

    const config = targets.getAgentTargetConfig("architect", "claude");
    expect(config).not.toBeNull();
    expect(config!.disallowed_tools).toEqual(
      expect.arrayContaining(["Write", "Edit", "Bash"]),
    );
  });
});

// ==========================================================================
// 7. Claude Renderer
// ==========================================================================

describe("Claude Renderer", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db, OPENCODE_DIR);
  });

  afterEach(() => cleanupDb(db));

  it("renderAgent produces frontmatter with required fields", () => {
    const renderer = getRenderer("claude", db);
    expect(renderer).not.toBeNull();

    const output = renderer!.renderAgent("architect");

    expect(output).toMatch(/^---\n/);
    expect(output).toContain("name:");
    expect(output).toContain("description:");
    expect(output).toContain("model:");
    expect(output).toContain("mcpServers:");
  });

  it("architect rendered output has disallowedTools with Write, Edit, Bash", () => {
    const renderer = getRenderer("claude", db)!;
    const output = renderer.renderAgent("architect");

    expect(output).toContain("disallowedTools:");
    expect(output).toMatch(/disallowedTools:.*Write/);
    expect(output).toMatch(/disallowedTools:.*Edit/);
    expect(output).toMatch(/disallowedTools:.*Bash/);
  });

  it("architect rendered output has tools with MCP-prefixed spavn tools", () => {
    const renderer = getRenderer("claude", db)!;
    const output = renderer.renderAgent("architect");

    // Native tools mapped correctly
    expect(output).toContain("Read");
    expect(output).toContain("Glob");
    expect(output).toContain("Grep");
    // MCP tools
    expect(output).toContain("mcp__spavn-agents__plan_save");
  });

  it("renderAgent throws for non-existent agent", () => {
    const renderer = getRenderer("claude", db)!;
    expect(() => renderer.renderAgent("nonexistent")).toThrow("Agent not found");
  });

  it("renderInstructions includes skills and enhanced skills", () => {
    const renderer = getRenderer("claude", db)!;
    const output = renderer.renderInstructions();

    expect(output).toContain("Spavn Agents");
    expect(output).toContain("Available Skills");
    expect(output).toContain("testing-strategies");
    expect(output).toContain("Custom Agents");
    // Enhanced skills listed instead of subagent names
    expect(output).toContain("testing");
    expect(output).toContain("security");
    expect(output).toContain("audit");
  });
});

// ==========================================================================
// 8. OpenCode Renderer
// ==========================================================================

describe("OpenCode Renderer", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedDatabase(db, OPENCODE_DIR);
  });

  afterEach(() => cleanupDb(db));

  it("renderAgent produces frontmatter with description, mode, temperature", () => {
    const renderer = getRenderer("opencode", db)!;
    const output = renderer.renderAgent("worker");

    expect(output).toMatch(/^---\n/);
    expect(output).toContain("description:");
    expect(output).toContain("mode: subagent");
    expect(output).toContain("temperature: 0.2");
  });

  it("renderAgent includes tools block", () => {
    const renderer = getRenderer("opencode", db)!;
    const output = renderer.renderAgent("worker");

    expect(output).toContain("tools:");
    expect(output).toContain("  read: true");
    expect(output).toContain("  write: true");
  });

  it("renderAgent includes permission block with edit and bash patterns", () => {
    const renderer = getRenderer("opencode", db)!;
    const output = renderer.renderAgent("worker");

    expect(output).toContain("permission:");
    expect(output).toContain("edit: allow");
    expect(output).toContain("bash:");
    // Patterns with wildcards or spaces should be quoted
    expect(output).toMatch(/"git status\*": allow/);
  });

  it("renderInstructions returns empty string for opencode", () => {
    const renderer = getRenderer("opencode", db)!;
    expect(renderer.renderInstructions()).toBe("");
  });

  it("renderAgent throws for non-existent agent", () => {
    const renderer = getRenderer("opencode", db)!;
    expect(() => renderer.renderAgent("nonexistent")).toThrow("Agent not found");
  });
});

// ==========================================================================
// 9. SpavnEngine Facade
// ==========================================================================

describe("SpavnEngine", () => {
  let dbPath: string;
  let engine: SpavnEngine;

  beforeEach(() => {
    dbPath = tmpDbPath();
  });

  afterEach(() => {
    try {
      engine.close();
    } catch {
      // already closed
    }
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + "-wal")) fs.unlinkSync(dbPath + "-wal");
      if (fs.existsSync(dbPath + "-shm")) fs.unlinkSync(dbPath + "-shm");
    } catch {
      // best effort
    }
  });

  it("initialize seeds on first run and returns SeedResult", () => {
    engine = new SpavnEngine(dbPath);
    const result = engine.initialize();

    expect(result).not.toBeNull();
    expect(result!.agents).toBe(4);    // 3 primary + 1 worker
    expect(result!.skills).toBe(26);   // 17 knowledge + 9 enhanced
    expect(result!.models).toBe(13);
    expect(result!.targets).toBe(4);
  });

  it("initialize returns null on second run (already seeded)", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const result2 = engine.initialize();
    expect(result2).toBeNull();
  });

  it("listAgents returns all agents after initialization", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const agents = engine.listAgents();
    expect(agents).toHaveLength(4);
  });

  it("listAgents filters by mode", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const primaries = engine.listAgents({ mode: "primary" });
    expect(primaries).toHaveLength(3);
    const ids = primaries.map((a) => a.id).sort();
    expect(ids).toEqual(["architect", "fix", "implement"]);
  });

  it("listSkills returns all skills after initialization", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const skills = engine.listSkills();
    expect(skills).toHaveLength(26);  // 17 knowledge + 9 enhanced
  });

  it("listEnhancedSkills returns only enhanced skills", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const enhanced = engine.listEnhancedSkills();
    expect(enhanced).toHaveLength(9);
    for (const s of enhanced) {
      expect(s.kind).toBe("enhanced");
    }
  });

  it("getSkillsForTrigger returns matching skills", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const qgSkills = engine.getSkillsForTrigger("standard", "quality-gate");
    expect(qgSkills.length).toBeGreaterThanOrEqual(3);
    const ids = qgSkills.map((s) => s.id);
    expect(ids).toContain("testing");
    expect(ids).toContain("security");
    expect(ids).toContain("audit");
  });

  it("getEffectiveAccess respects mode ceilings", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    // security has access_level: read-only, architect ceiling: read-only
    expect(engine.getEffectiveAccess("security", "architect")).toBe("read-only");
    // coder has access_level: write, implement ceiling: full
    expect(engine.getEffectiveAccess("coder", "implement")).toBe("write");
    // coder has access_level: write, architect ceiling: read-only
    expect(engine.getEffectiveAccess("coder", "architect")).toBe("read-only");
  });

  it("getSkillWithLinked resolves linked skills", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const result = engine.getSkillWithLinked("audit");
    expect(result).not.toBeNull();
    expect(result!.skill.id).toBe("audit");
    expect(result!.linked.length).toBe(2);
    const linkedIds = result!.linked.map((s) => s.id).sort();
    expect(linkedIds).toEqual(["code-quality", "design-patterns"]);
  });

  it("listModels returns all models after initialization", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const models = engine.listModels();
    expect(models).toHaveLength(13);
  });

  it("getAgent returns a specific agent", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const agent = engine.getAgent("architect");
    expect(agent).not.toBeNull();
    expect(agent!.mode).toBe("primary");
  });

  it("getSkillContent returns content for an existing skill", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const content = engine.getSkillContent("testing-strategies");
    expect(content).not.toBeNull();
    expect(content!.length).toBeGreaterThan(100);
  });

  it("getConfig / setConfig works through the facade", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    expect(engine.getConfig("mykey")).toBeNull();
    engine.setConfig("mykey", "myvalue");
    expect(engine.getConfig("mykey")).toBe("myvalue");
  });

  it("close prevents further operations", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    engine.close();
    expect(() => engine.listAgents()).toThrow();
  });

  it("renderAgent delegates to the Claude renderer", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    const output = engine.renderAgent("architect", "claude");
    expect(output).toContain("name: architect");
    expect(output).toContain("disallowedTools:");
  });

  it("renderAgent throws for unknown target", () => {
    engine = new SpavnEngine(dbPath);
    engine.initialize();
    expect(() => engine.renderAgent("architect", "unknown-target")).toThrow(
      "No renderer for target",
    );
  });
});
