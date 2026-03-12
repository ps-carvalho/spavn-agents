import type BetterSqlite3 from "better-sqlite3";
import type {
  Agent,
  AgentInput,
  AgentTool,
  BashPermission,
  AgentSkill,
} from "./types.js";

export class AgentStore {
  constructor(private db: BetterSqlite3.Database) {}

  get(id: string): Agent | null {
    const stmt = this.db.prepare("SELECT * FROM agents WHERE id = ?");
    return (stmt.get(id) as unknown as Agent) ?? null;
  }

  list(filter?: { mode?: string }): Agent[] {
    if (filter?.mode) {
      const stmt = this.db.prepare(
        "SELECT * FROM agents WHERE mode = ? ORDER BY id",
      );
      return stmt.all(filter.mode) as unknown as Agent[];
    }
    const stmt = this.db.prepare("SELECT * FROM agents ORDER BY id");
    return stmt.all() as unknown as Agent[];
  }

  upsert(agent: AgentInput): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO agents (id, description, mode, temperature, system_prompt, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    );
    stmt.run(
      agent.id,
      agent.description,
      agent.mode,
      agent.temperature ?? 0,
      agent.system_prompt,
    );
  }

  getTools(agentId: string): AgentTool[] {
    const stmt = this.db.prepare(
      "SELECT * FROM agent_tools WHERE agent_id = ?",
    );
    return stmt.all(agentId) as unknown as AgentTool[];
  }

  setTool(agentId: string, toolName: string, allowed: boolean): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO agent_tools (agent_id, tool_name, allowed)
       VALUES (?, ?, ?)`,
    );
    stmt.run(agentId, toolName, allowed ? 1 : 0);
  }

  setTools(agentId: string, tools: Record<string, boolean>): void {
    const deleteStmt = this.db.prepare(
      "DELETE FROM agent_tools WHERE agent_id = ?",
    );
    const insertStmt = this.db.prepare(
      `INSERT INTO agent_tools (agent_id, tool_name, allowed)
       VALUES (?, ?, ?)`,
    );

    const batch = this.db.transaction(() => {
      deleteStmt.run(agentId);
      for (const [toolName, allowed] of Object.entries(tools)) {
        insertStmt.run(agentId, toolName, allowed ? 1 : 0);
      }
    });

    batch();
  }

  getBashPermissions(agentId: string): BashPermission[] {
    const stmt = this.db.prepare(
      "SELECT * FROM agent_bash_permissions WHERE agent_id = ?",
    );
    return stmt.all(agentId) as unknown as BashPermission[];
  }

  setBashPermission(
    agentId: string,
    pattern: string,
    permission: string,
  ): void {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO agent_bash_permissions (agent_id, pattern, permission)
       VALUES (?, ?, ?)`,
    );
    stmt.run(agentId, pattern, permission);
  }

  setBashPermissions(
    agentId: string,
    permissions: Record<string, string>,
  ): void {
    const deleteStmt = this.db.prepare(
      "DELETE FROM agent_bash_permissions WHERE agent_id = ?",
    );
    const insertStmt = this.db.prepare(
      `INSERT INTO agent_bash_permissions (agent_id, pattern, permission)
       VALUES (?, ?, ?)`,
    );

    const batch = this.db.transaction(() => {
      deleteStmt.run(agentId);
      for (const [pattern, permission] of Object.entries(permissions)) {
        insertStmt.run(agentId, pattern, permission);
      }
    });

    batch();
  }

  getSkills(agentId: string): AgentSkill[] {
    const stmt = this.db.prepare(
      "SELECT * FROM agent_skills WHERE agent_id = ?",
    );
    return stmt.all(agentId) as unknown as AgentSkill[];
  }
}
