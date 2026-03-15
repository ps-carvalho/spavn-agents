import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  PRIMARY_AGENTS,
  SUBAGENTS,
  MODEL_REGISTRY,
} from "../registry.js";
import * as spavnHandlers from "./handlers/spavn.js";

export const init = tool({
  description:
    "Initialize .spavn directory in project root for plan storage, session history, and configuration",
  args: {},
  async execute(args, context) {
    const result = spavnHandlers.executeInit(context.worktree);
    return result.text;
  },
});

export const status = tool({
  description:
    "Check .spavn directory status - whether it exists, plan count, session count",
  args: {},
  async execute(args, context) {
    const result = spavnHandlers.executeStatus(context.worktree);
    return result.text;
  },
});

/**
 * spavn_configure — Write per-project model configuration to ./opencode.json.
 *
 * Accepts a primary model (for architect/implement/fix) and a subagent model
 * (for worker). Merges into any existing
 * opencode.json at the project root, preserving other settings.
 */
export const configure = tool({
  description:
    "Save per-project model configuration to ./opencode.json. " +
    "Sets the model for primary agents (architect, implement, fix) and subagents (worker). " +
    "Available models — Premium: " +
    MODEL_REGISTRY.filter((m) => m.tier === "premium")
      .map((m) => `${m.name} (${m.id})`)
      .join(", ") +
    ". Standard: " +
    MODEL_REGISTRY.filter((m) => m.tier === "standard")
      .map((m) => `${m.name} (${m.id})`)
      .join(", ") +
    ". Fast: " +
    MODEL_REGISTRY.filter((m) => m.tier === "fast")
      .map((m) => `${m.name} (${m.id})`)
      .join(", ") +
    ".",
  args: {
    primaryModel: z
      .string()
      .describe(
        "Model ID for primary agents (architect, implement, fix). Format: provider/model-name"
      ),
    subagentModel: z
      .string()
      .describe(
        "Model ID for subagents (worker). Format: provider/model-name"
      ),
  },
  async execute(args, context) {
    const configPath = path.join(context.worktree, "opencode.json");

    // Read existing config or start fresh
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        // Malformed JSON — start fresh but warn
        config = {};
      }
    }

    // Ensure schema and plugin
    if (!config.$schema) {
      config.$schema = "https://opencode.ai/config.json";
    }
    const plugins = (config.plugin as string[] | undefined) ?? [];
    if (!plugins.includes("spavn-agents")) {
      plugins.push("spavn-agents");
    }
    config.plugin = plugins;

    // Build agent config
    const agent = (config.agent as Record<string, Record<string, unknown>> | undefined) ?? {};

    for (const name of PRIMARY_AGENTS) {
      if (!agent[name]) agent[name] = {};
      agent[name].model = args.primaryModel;
    }

    for (const name of SUBAGENTS) {
      if (!agent[name]) agent[name] = {};
      agent[name].model = args.subagentModel;
    }

    config.agent = agent;

    // Write to project root (runtime config — what OpenCode reads)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

    // Also write .opencode/models.json (per-project source of truth, version controlled)
    const modelsPath = path.join(context.worktree, ".opencode", "models.json");
    const modelsDir = path.dirname(modelsPath);
    if (fs.existsSync(modelsDir)) {
      const modelsConfig: Record<string, unknown> = {
        primary: { model: args.primaryModel },
        subagent: { model: args.subagentModel },
        agents: {} as Record<string, { model: string }>,
      };
      const agentsMap: Record<string, { model: string }> = {};
      for (const name of PRIMARY_AGENTS) {
        agentsMap[name] = { model: args.primaryModel };
      }
      for (const name of SUBAGENTS) {
        agentsMap[name] = { model: args.subagentModel };
      }
      modelsConfig.agents = agentsMap;
      fs.writeFileSync(modelsPath, JSON.stringify(modelsConfig, null, 2) + "\n");
    }

    // Build summary
    const primaryDisplay =
      MODEL_REGISTRY.find((m) => m.id === args.primaryModel)?.name ??
      args.primaryModel;
    const subagentDisplay =
      MODEL_REGISTRY.find((m) => m.id === args.subagentModel)?.name ??
      args.subagentModel;

    const savedTo = fs.existsSync(modelsDir)
      ? `${configPath}\n  .opencode/models.json`
      : configPath;

    return `✓ Model configuration saved to:
  ${savedTo}

Primary agents (architect, implement, fix):
  → ${primaryDisplay} (${args.primaryModel})

Subagents (worker):
  → ${subagentDisplay} (${args.subagentModel})

Restart OpenCode to apply changes.`;
  },
});
