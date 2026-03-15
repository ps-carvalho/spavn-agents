// ---------------------------------------------------------------------------
// Engine-backed MCP tools: spavn_get_skill, spavn_list_agents
// ---------------------------------------------------------------------------

import { tool } from "@opencode-ai/plugin";
import * as skillHandlers from "./handlers/skill.js";
import * as agentHandlers from "./handlers/agent.js";

export const getSkill = tool({
  description:
    "Retrieve the full content of a domain skill by ID. Returns the skill markdown including guidelines, patterns, and best practices.",
  args: {
    skillId: tool.schema
      .string()
      .describe('The skill identifier, e.g. "security-hardening", "api-design"'),
  },
  async execute(args) {
    const result = await skillHandlers.executeGet({ skillId: args.skillId });
    return result.text;
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
    const result = await agentHandlers.executeList({ mode: args.mode });
    return result.text;
  },
});
