import { getEngine } from "./engine-singleton.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * List all registered agents with their mode, description, and available tools.
 */
export async function executeList(args: { mode?: string }): Promise<HandlerResult> {
  try {
    const engine = await getEngine();
    const filter = args.mode ? { mode: args.mode } : undefined;
    const agents = engine.listAgents(filter);

    if (agents.length === 0) return success("✗ No agents found. Run 'npx spavn-agents install' first.");

    const lines = agents.map((a) => {
      const tools = engine.getAgentTools(a.id);
      const enabledTools = tools.filter((t) => t.allowed).map((t) => t.tool_name);
      return `- **${a.id}** (${a.mode}) — ${a.description}\n  Tools: ${enabledTools.join(", ") || "none"}`;
    });

    return success(`✓ ${agents.length} agents:\n\n${lines.join("\n\n")}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Get single agent details from the engine database.
 */
export async function executeGet(args: { agentId: string }): Promise<HandlerResult> {
  try {
    const engine = await getEngine();
    const agent = engine.getAgent(args.agentId);

    if (!agent) {
      const all = engine.listAgents();
      return success(`✗ Agent not found: ${args.agentId}\n\nAvailable: ${all.map((a) => a.id).join(", ")}`);
    }

    const tools = engine.getAgentTools(args.agentId);
    const enabledTools = tools.filter((t) => t.allowed).map((t) => t.tool_name);
    const disabledTools = tools.filter((t) => !t.allowed).map((t) => t.tool_name);

    return success(`✓ Agent: ${agent.id}\n\nMode: ${agent.mode}\nDescription: ${agent.description}\nTemperature: ${agent.temperature}\nEnabled tools: ${enabledTools.join(", ") || "none"}\nDisabled tools: ${disabledTools.join(", ") || "none"}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
