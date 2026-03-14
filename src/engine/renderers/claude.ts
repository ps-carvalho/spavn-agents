// ---------------------------------------------------------------------------
// Spavn Engine — Claude Code renderer
// Produces ~/.claude/agents/*.md files (YAML frontmatter + system prompt)
// and a CLAUDE.md instructions file.
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
// Tool-name mapping: OpenCode name -> Claude PascalCase name
// ---------------------------------------------------------------------------

const NATIVE_TOOL_MAP: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Bash",
  glob: "Glob",
  grep: "Grep",
  task: "Agent",
  // Note: `skill` is NOT mapped here — it's an MCP tool (mcp__spavn-agents__skill),
  // not Claude's native Skill tool which only handles slash commands.
};

const NATIVE_TOOL_NAMES = new Set(Object.keys(NATIVE_TOOL_MAP));

/**
 * Map an OpenCode tool name to its Claude representation.
 *
 * - Native tools (read, write, ...) become PascalCase (Read, Write, ...).
 * - The special `task` tool maps to `Agent`.
 * - Everything else is a Spavn MCP tool: `mcp__spavn-agents__{name}`.
 */
function mapToolName(toolName: string): string {
  if (NATIVE_TOOL_NAMES.has(toolName)) {
    return NATIVE_TOOL_MAP[toolName];
  }
  return `mcp__spavn-agents__${toolName}`;
}

// ---------------------------------------------------------------------------
// YAML helpers — lightweight, no external dep
// ---------------------------------------------------------------------------

/** Escape a YAML string value. Wraps in quotes when necessary. */
function yamlValue(v: string): string {
  // If it contains characters that could confuse a YAML parser, quote it.
  if (
    v === "" ||
    v.includes(":") ||
    v.includes("#") ||
    v.includes("{") ||
    v.includes("}") ||
    v.includes("[") ||
    v.includes("]") ||
    v.includes(",") ||
    v.includes("&") ||
    v.includes("*") ||
    v.includes("!") ||
    v.includes("|") ||
    v.includes(">") ||
    v.includes("'") ||
    v.includes('"') ||
    v.includes("%") ||
    v.includes("@") ||
    v.includes("`") ||
    v.startsWith(" ") ||
    v.endsWith(" ")
  ) {
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return v;
}

// ---------------------------------------------------------------------------
// ClaudeRenderer
// ---------------------------------------------------------------------------

class ClaudeRenderer implements Renderer {
  private agents: AgentStore;
  private skills: SkillStore;
  private targets: TargetStore;

  constructor(private db: BetterSqlite3.Database) {
    this.agents = new AgentStore(db);
    this.skills = new SkillStore(db);
    this.targets = new TargetStore(db);
  }

  // ---- renderAgent ----------------------------------------------------------

  renderAgent(agentId: string): string {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const targetConfig = this.targets.getAgentTargetConfig(agentId, "claude");
    const agentTools = this.agents.getTools(agentId);

    // ----- Determine tools and disallowedTools lists -----

    let toolsList: string[];
    let disallowedList: string[];

    if (targetConfig?.tools_override) {
      // Explicit override from the agent_target_config table — use as-is.
      toolsList = targetConfig.tools_override;
    } else {
      // Derive from agent_tools: every tool where allowed = true.
      toolsList = agentTools
        .filter((t) => t.allowed)
        .map((t) => mapToolName(t.tool_name));
    }

    if (targetConfig?.disallowed_tools) {
      disallowedList = targetConfig.disallowed_tools;
    } else {
      // Derive from agent_tools: every tool where allowed = false,
      // but only native tools make sense in disallowedTools.
      disallowedList = agentTools
        .filter((t) => !t.allowed && NATIVE_TOOL_NAMES.has(t.tool_name))
        .map((t) => NATIVE_TOOL_MAP[t.tool_name]);
    }

    // ----- Model -----

    const model = targetConfig?.model_override ?? "inherit";

    // ----- Description -----

    const description = targetConfig?.native_name ?? agent.description;

    // ----- Build frontmatter -----

    const lines: string[] = ["---"];
    lines.push(`name: ${yamlValue(agentId)}`);
    lines.push(`description: ${yamlValue(description)}`);

    if (toolsList.length > 0) {
      lines.push(`tools: ${toolsList.map(yamlValue).join(", ")}`);
    }

    if (disallowedList.length > 0) {
      lines.push(
        `disallowedTools: ${disallowedList.map(yamlValue).join(", ")}`,
      );
    }

    lines.push(`model: ${yamlValue(model)}`);
    // Extra frontmatter from target config (arbitrary keys).
    // Seed stores mcpServers here; fall back to default if absent.
    const extra = targetConfig?.extra_frontmatter ?? {};
    if (!("mcpServers" in extra)) {
      lines.push("mcpServers: spavn-agents");
    }
    for (const [key, value] of Object.entries(extra)) {
      lines.push(`${key}: ${yamlValue(String(value))}`);
    }

    lines.push("---");

    // ----- System prompt body -----

    return lines.join("\n") + "\n" + agent.system_prompt;
  }

  // ---- renderInstructions ---------------------------------------------------

  renderInstructions(): string {
    const skills = this.skills.list();
    const knowledgeSkills = skills.filter((s) => s.kind === "knowledge");
    const enhancedSkills = skills.filter((s) => s.kind === "enhanced");

    return `# Spavn Agents — Global Configuration

> Auto-generated by \`npx spavn-agents install --target claude --global\`. Do not edit manually.

## Overview

Spavn Agents provides structured development workflows: plan \u2192 build \u2192 quality gate \u2192 ship.
All 33 tools are available via MCP server (\`npx spavn-agents mcp\`).

## Default Workflow

When starting a new task or session, always default to the \`/architect\` workflow first to plan the work before implementing. Only skip planning for trivial changes (typo fixes, single-line edits).

1. **Plan** \u2014 Use \`/architect\` to analyze requirements and create an implementation plan
2. **Implement** \u2014 Use \`/implement\` to execute the plan with iterative build+test verification
3. **Fix** \u2014 Use \`/fix\` for quick bug fixes with minimal changes

## Available Skills

${knowledgeSkills.map((s) => `  - ${s.id}`).join("\n")}

## Custom Agents (available in /agents)

${enhancedSkills.map((s) => s.id).join(", ")}

## Quality Gate

After implementation, assess change scope and launch parallel Agent tool calls:
- **Trivial** (docs only): Skip quality gate
- **Low** (tests/config): Testing worker only
- **Standard** (normal code): Testing + Security + Audit + Docs workers
- **High** (auth/payments/infra): All workers including Perf and DevOps
`;
  }

  // ---- sync -----------------------------------------------------------------

  sync(opts?: { scope?: string; projectPath?: string }): SyncResult {
    const target = this.targets.getTarget("claude");
    if (!target) throw new Error("Claude target not configured");

    const configDir = target.config_dir.replace("~", os.homedir());
    const agentsDir = path.join(configDir, "agents");

    fs.mkdirSync(agentsDir, { recursive: true });

    const result: SyncResult = {
      target: "claude",
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

    // Render instructions file
    if (target.instructions_file) {
      try {
        const content = this.renderInstructions();
        const filePath = path.join(configDir, target.instructions_file);
        fs.writeFileSync(filePath, content);
        result.instructionsWritten = true;
      } catch (err) {
        result.errors.push(`Instructions: ${(err as Error).message}`);
      }
    }

    return result;
  }
}

// Self-register on import.
registerRenderer("claude", (db) => new ClaudeRenderer(db));

export { ClaudeRenderer };
