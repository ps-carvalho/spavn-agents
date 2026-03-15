// ---------------------------------------------------------------------------
// SpavnEngine — Facade class
// Single entry point for all engine operations: DB lifecycle, CRUD, rendering.
// ---------------------------------------------------------------------------

import * as path from "path";
import { fileURLToPath } from "url";
import type BetterSqlite3 from "better-sqlite3";
import { createDatabase, getDefaultDbPath } from "./db.js";
import { initializeSchema } from "./schema.js";
import { seedDatabase, type SeedResult } from "./seed.js";
import { AgentStore } from "./agents.js";
import { SkillStore } from "./skills.js";
import { ModelStore } from "./models.js";
import { TargetStore } from "./targets.js";
import { getRenderer } from "./renderers/index.js";

// Side-effect imports: register renderers
import "./renderers/opencode.js";

import type {
  Agent,
  AgentInput,
  AgentTool,
  BashPermission,
  AgentSkill,
  Skill,
  SkillInput,
  SkillKind,
  AccessLevel,
  SkillTrigger,
  TriggerPhase,
  CliTarget,
  AgentTargetConfig,
  Model,
  Installation,
  SyncResult,
} from "./types.js";

// Re-export types for consumers
export type {
  Agent,
  AgentInput,
  AgentTool,
  BashPermission,
  AgentSkill,
  Skill,
  SkillInput,
  SkillKind,
  AccessLevel,
  SkillTrigger,
  TriggerPhase,
  CliTarget,
  AgentTargetConfig,
  Model,
  Installation,
  SyncResult,
  SeedResult,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the .opencode/ directory shipped with the package. */
const PACKAGE_OPENCODE_DIR = path.resolve(__dirname, "..", "..", ".opencode");

export class SpavnEngine {
  private db: BetterSqlite3.Database;
  private _agents: AgentStore;
  private _skills: SkillStore;
  private _models: ModelStore;
  private _targets: TargetStore;

  constructor(dbPath?: string) {
    this.db = createDatabase(dbPath ?? getDefaultDbPath());
    this._agents = new AgentStore(this.db);
    this._skills = new SkillStore(this.db);
    this._models = new ModelStore(this.db);
    this._targets = new TargetStore(this.db);
  }

  // ---- Lifecycle -----------------------------------------------------------

  /** Create tables, run migrations, seed if empty. */
  initialize(): SeedResult | null {
    initializeSchema(this.db);

    // Seed only if agents table is empty (first run)
    const count = this._agents.list().length;
    if (count === 0) {
      return this.seed();
    }
    return null;
  }

  /** Re-seed the database from .opencode/ files. */
  seed(opencodeDir?: string): SeedResult {
    return seedDatabase(this.db, opencodeDir ?? PACKAGE_OPENCODE_DIR);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  // ---- Agents --------------------------------------------------------------

  getAgent(id: string): Agent | null {
    return this._agents.get(id);
  }

  listAgents(filter?: { mode?: string }): Agent[] {
    return this._agents.list(filter);
  }

  upsertAgent(agent: AgentInput): void {
    this._agents.upsert(agent);
  }

  getAgentTools(agentId: string): AgentTool[] {
    return this._agents.getTools(agentId);
  }

  getAgentBashPermissions(agentId: string): BashPermission[] {
    return this._agents.getBashPermissions(agentId);
  }

  // ---- Skills --------------------------------------------------------------

  getSkill(id: string): Skill | null {
    return this._skills.get(id);
  }

  listSkills(): Skill[] {
    return this._skills.list();
  }

  getSkillContent(id: string): string | null {
    return this._skills.getContent(id);
  }

  upsertSkill(skill: SkillInput): void {
    this._skills.upsert(skill);
  }

  /** List only enhanced skills (kind = 'enhanced'). */
  listEnhancedSkills(): Skill[] {
    return this._skills.listEnhanced();
  }

  /** Find enhanced skills matching a trigger scope and phase. */
  getSkillsForTrigger(scope: string, phase: string): Skill[] {
    return this._skills.getByTrigger(scope, phase);
  }

  /** Compute effective access by intersecting skill access_level with mode ceiling. */
  getEffectiveAccess(skillId: string, mode: string): AccessLevel | null {
    return this._skills.getEffectiveAccess(skillId, mode);
  }

  /** Return a skill plus its resolved linked knowledge skills. */
  getSkillWithLinked(skillId: string): { skill: Skill; linked: Skill[] } | null {
    return this._skills.getWithLinked(skillId);
  }

  getAgentSkills(agentId: string): AgentSkill[] {
    return this._agents.getSkills(agentId);
  }

  // ---- Targets -------------------------------------------------------------

  getTarget(id: string): CliTarget | null {
    return this._targets.getTarget(id);
  }

  listTargets(): CliTarget[] {
    return this._targets.listTargets();
  }

  getAgentTargetConfig(agentId: string, targetId: string): AgentTargetConfig | null {
    return this._targets.getAgentTargetConfig(agentId, targetId);
  }

  // ---- Rendering & Sync ----------------------------------------------------

  renderAgent(agentId: string, targetId: string): string {
    const renderer = getRenderer(targetId, this.db);
    if (!renderer) throw new Error(`No renderer for target: ${targetId}`);
    return renderer.renderAgent(agentId);
  }

  renderInstructions(targetId: string): string {
    const renderer = getRenderer(targetId, this.db);
    if (!renderer) throw new Error(`No renderer for target: ${targetId}`);
    return renderer.renderInstructions();
  }

  syncTarget(targetId: string, opts?: { scope?: string; projectPath?: string }): SyncResult {
    const renderer = getRenderer(targetId, this.db);
    if (!renderer) throw new Error(`No renderer for target: ${targetId}`);
    return renderer.sync(opts);
  }

  // ---- Models --------------------------------------------------------------

  listModels(filter?: { tier?: string }): Model[] {
    return this._models.list(filter);
  }

  // ---- Config --------------------------------------------------------------

  getConfig(key: string): string | null {
    return this._targets.getConfig(key);
  }

  setConfig(key: string, value: string): void {
    this._targets.setConfig(key, value);
  }

  // ---- Installation tracking -----------------------------------------------

  recordInstallation(targetId: string, scope: string, path: string, version: string): void {
    this._targets.recordInstallation(targetId, scope, path, version);
  }

  getInstallations(): Installation[] {
    return this._targets.getInstallations();
  }
}
