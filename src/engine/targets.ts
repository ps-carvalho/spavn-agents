import type BetterSqlite3 from "better-sqlite3";
import type {
  CliTarget,
  AgentTargetConfig,
  Installation,
} from "./types.js";

/** Raw row shape for agent_target_config before JSON parsing. */
interface AgentTargetConfigRow {
  agent_id: string;
  target_id: string;
  native_name: string | null;
  tools_override: string | null;
  disallowed_tools: string | null;
  model_override: string | null;
  extra_frontmatter: string | null;
}

function parseAgentTargetConfig(row: AgentTargetConfigRow): AgentTargetConfig {
  return {
    agent_id: row.agent_id,
    target_id: row.target_id,
    native_name: row.native_name,
    tools_override: row.tools_override
      ? (JSON.parse(row.tools_override) as string[])
      : null,
    disallowed_tools: row.disallowed_tools
      ? (JSON.parse(row.disallowed_tools) as string[])
      : null,
    model_override: row.model_override,
    extra_frontmatter: row.extra_frontmatter
      ? (JSON.parse(row.extra_frontmatter) as Record<string, unknown>)
      : null,
  };
}

export class TargetStore {
  constructor(private db: BetterSqlite3.Database) {}

  // ---- CLI targets ----------------------------------------------------------

  getTarget(id: string): CliTarget | null {
    const stmt = this.db.prepare("SELECT * FROM cli_targets WHERE id = ?");
    return (stmt.get(id) as unknown as CliTarget) ?? null;
  }

  listTargets(): CliTarget[] {
    const stmt = this.db.prepare("SELECT * FROM cli_targets ORDER BY id");
    return stmt.all() as unknown as CliTarget[];
  }

  upsertTarget(target: CliTarget): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO cli_targets (id, display_name, config_dir, agent_file_format, instructions_file)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(
      target.id,
      target.display_name,
      target.config_dir,
      target.agent_file_format,
      target.instructions_file ?? null,
    );
  }

  // ---- Agent target configs -------------------------------------------------

  getAgentTargetConfig(
    agentId: string,
    targetId: string,
  ): AgentTargetConfig | null {
    const stmt = this.db.prepare(
      "SELECT * FROM agent_target_config WHERE agent_id = ? AND target_id = ?",
    );
    const row = stmt.get(agentId, targetId) as
      | unknown as AgentTargetConfigRow
      | undefined;
    return row ? parseAgentTargetConfig(row) : null;
  }

  upsertAgentTargetConfig(config: AgentTargetConfig): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO agent_target_config
       (agent_id, target_id, native_name, tools_override, disallowed_tools, model_override, extra_frontmatter)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      config.agent_id,
      config.target_id,
      config.native_name ?? null,
      config.tools_override ? JSON.stringify(config.tools_override) : null,
      config.disallowed_tools
        ? JSON.stringify(config.disallowed_tools)
        : null,
      config.model_override ?? null,
      config.extra_frontmatter
        ? JSON.stringify(config.extra_frontmatter)
        : null,
    );
  }

  listAgentTargetConfigs(targetId: string): AgentTargetConfig[] {
    const stmt = this.db.prepare(
      "SELECT * FROM agent_target_config WHERE target_id = ?",
    );
    const rows = stmt.all(targetId) as unknown as AgentTargetConfigRow[];
    return rows.map(parseAgentTargetConfig);
  }

  // ---- User config ----------------------------------------------------------

  getConfig(key: string): string | null {
    const stmt = this.db.prepare(
      "SELECT value FROM user_config WHERE key = ?",
    );
    const row = stmt.get(key) as unknown as { value: string } | undefined;
    return row?.value ?? null;
  }

  setConfig(key: string, value: string): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO user_config (key, value)
       VALUES (?, ?)`,
    );
    stmt.run(key, value);
  }

  // ---- Installation tracking ------------------------------------------------

  recordInstallation(
    targetId: string,
    scope: string,
    path: string,
    version: string,
  ): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO installations (target_id, scope, path, installed_at, version)
       VALUES (?, ?, ?, datetime('now'), ?)`,
    );
    stmt.run(targetId, scope, path, version);
  }

  getInstallations(): Installation[] {
    const stmt = this.db.prepare(
      "SELECT * FROM installations ORDER BY installed_at DESC",
    );
    return stmt.all() as unknown as Installation[];
  }
}
