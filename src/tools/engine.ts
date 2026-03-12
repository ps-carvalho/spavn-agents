// ---------------------------------------------------------------------------
// Engine-backed MCP tools: spavn_get_skill, spavn_list_agents
// ---------------------------------------------------------------------------

import { tool } from "@opencode-ai/plugin";
import { SpavnEngine } from "../engine/index.js";

let _engine: SpavnEngine | null = null;

function getEngine(): SpavnEngine {
  if (!_engine) {
    _engine = new SpavnEngine();
    _engine.initialize();
  }
  return _engine;
}

export const getSkill = tool({
  description:
    "Retrieve the full content of a domain skill by ID. Returns the skill markdown including guidelines, patterns, and best practices.",
  args: {
    skillId: tool.schema
      .string()
      .describe('The skill identifier, e.g. "security-hardening", "api-design"'),
  },
  async execute(args) {
    const engine = getEngine();
    const content = engine.getSkillContent(args.skillId);

    if (!content) {
      const skills = engine.listSkills();
      const available = skills.map((s) => s.id).join(", ");
      return `✗ Skill not found: ${args.skillId}\n\nAvailable skills: ${available}`;
    }

    return content;
  },
});

export const listAgents = tool({
  description:
    "List all registered agents with their mode (primary/subagent), description, and available tools.",
  args: {
    mode: tool.schema
      .enum(["primary", "subagent"])
      .optional()
      .describe("Filter by agent mode"),
  },
  async execute(args) {
    const engine = getEngine();
    const filter = args.mode ? { mode: args.mode } : undefined;
    const agents = engine.listAgents(filter);

    if (agents.length === 0) {
      return "✗ No agents found in the database. Run 'npx spavn-agents install' first.";
    }

    const lines = agents.map((a) => {
      const tools = engine.getAgentTools(a.id);
      const enabledTools = tools
        .filter((t) => t.allowed)
        .map((t) => t.tool_name);
      return `- **${a.id}** (${a.mode}) — ${a.description}\n  Tools: ${enabledTools.join(", ") || "none"}`;
    });

    return `✓ ${agents.length} agents:\n\n${lines.join("\n\n")}`;
  },
});
