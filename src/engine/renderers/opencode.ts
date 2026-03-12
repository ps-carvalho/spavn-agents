// ---------------------------------------------------------------------------
// Spavn Engine — OpenCode renderer
// Produces ~/.config/opencode/agents/*.md and skills/*/SKILL.md
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type BetterSqlite3 from "better-sqlite3";
import type { Renderer } from "./index.js";
import type { SyncResult } from "../types.js";
import { AgentStore } from "../agents.js";
import { SkillStore } from "../skills.js";
import { TargetStore } from "../targets.js";
import { registerRenderer } from "./index.js";

// ---------------------------------------------------------------------------
// OpencodeRenderer
// ---------------------------------------------------------------------------

class OpencodeRenderer implements Renderer {
  private agents: AgentStore;
  private skills: SkillStore;
  private targets: TargetStore;

  constructor(private db: BetterSqlite3.Database) {
    this.agents = new AgentStore(db);
    this.skills = new SkillStore(db);
    this.targets = new TargetStore(db);
  }

  renderAgent(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const tools = this.agents.getTools(agentId);
    const bashPerms = this.agents.getBashPermissions(agentId);

    const lines: string[] = ["---"];
    lines.push(`description: ${agent.description}`);
    lines.push(`mode: ${agent.mode}`);
    lines.push(`temperature: ${agent.temperature}`);

    // Tools block
    if (tools.length > 0) {
      lines.push("tools:");
      for (const t of tools) {
        lines.push(`  ${t.tool_name}: ${t.allowed ? "true" : "false"}`);
      }
    }

    // Permission block
    const editPerm = bashPerms.find((p) => p.pattern === "__edit__");
    const bashPatterns = bashPerms.filter((p) => p.pattern !== "__edit__");

    if (editPerm || bashPatterns.length > 0) {
      lines.push("permission:");

      if (editPerm) {
        lines.push(`  edit: ${editPerm.permission}`);
      }

      if (bashPatterns.length === 1 && bashPatterns[0].pattern === "*") {
        // Simple string form: bash: ask
        lines.push(`  bash: ${bashPatterns[0].permission}`);
      } else if (bashPatterns.length > 0) {
        // Object form with patterns
        lines.push("  bash:");
        for (const bp of bashPatterns) {
          const pattern = bp.pattern.includes("*") || bp.pattern.includes(" ")
            ? `"${bp.pattern}"` : bp.pattern;
          lines.push(`    ${pattern}: ${bp.permission}`);
        }
      }
    }

    lines.push("---");

    return lines.join("\n") + "\n" + agent.system_prompt;
  }

  renderInstructions(): string {
    return ""; // OpenCode doesn't use an instructions file
  }

  sync(opts?: { scope?: string; projectPath?: string }): SyncResult {
    const target = this.targets.getTarget("opencode");
    if (!target) throw new Error("OpenCode target not configured");

    const configDir = target.config_dir.replace("~", os.homedir());
    const agentsDir = path.join(configDir, "agents");
    const skillsDir = path.join(configDir, "skills");

    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    const result: SyncResult = {
      target: "opencode",
      agentsWritten: [],
      skillsWritten: [],
      instructionsWritten: false,
      errors: [],
    };

    // Render each agent
    const agents = this.agents.list();
    for (const agent of agents) {
      try {
        const content = this.renderAgent(agent.id);
        const filePath = path.join(agentsDir, `${agent.id}.md`);
        fs.writeFileSync(filePath, content);
        result.agentsWritten.push(agent.id);
      } catch (err) {
        result.errors.push(`Agent ${agent.id}: ${(err as Error).message}`);
      }
    }

    // Write skills
    const skills = this.skills.list();
    for (const skill of skills) {
      try {
        const skillDir = path.join(skillsDir, skill.id);
        fs.mkdirSync(skillDir, { recursive: true });
        const filePath = path.join(skillDir, "SKILL.md");
        fs.writeFileSync(filePath, skill.content);
        result.skillsWritten.push(skill.id);
      } catch (err) {
        result.errors.push(`Skill ${skill.id}: ${(err as Error).message}`);
      }
    }

    return result;
  }
}

// Self-register on import.
registerRenderer("opencode", (db) => new OpencodeRenderer(db));

export { OpencodeRenderer };
