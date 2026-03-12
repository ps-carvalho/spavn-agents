import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import {
  PRIMARY_AGENTS,
  SUBAGENTS,
  MODEL_REGISTRY,
} from "../registry.js";

const SPAVN_DIR = ".spavn";
const DEFAULT_CONFIG = {
  version: "1.0.0",
  worktree: {
    root: ".worktrees",
    autoCleanup: false,
  },
  branches: {
    protected: ["main", "master", "develop"],
    defaultType: "feature",
  },
  plans: {
    namingPattern: "{date}-{type}-{slug}",
    includeMermaid: true,
  },
  sessions: {
    retention: 30,
    includeDecisions: true,
  },
};

const GITIGNORE_CONTENT = `# Keep plans (they're valuable documentation)
!plans/

# Ignore session files (local context)
sessions/

# Ignore local config overrides
config.local.json
`;

const README_CONTENT = `# .spavn

This directory contains project context for the Spavn development agents.

## Structure

- \`plans/\` - Saved implementation plans (version controlled)
- \`sessions/\` - Session summaries (gitignored)
- \`config.json\` - Project configuration

## Plans

Plans are saved by the Plan agent and can be loaded by Build/Debug agents.
They include:
- Architecture diagrams (mermaid)
- Task breakdowns
- Technical decisions

## Sessions

Session summaries capture key decisions made during development.
They are gitignored by default but can be kept if needed.

## Usage

The Spavn agents will automatically use this directory for:
- Saving implementation plans before coding
- Recording session summaries with key decisions
- Managing worktree and branch workflows
`;

export const init = tool({
  description:
    "Initialize .spavn directory in project root for plan storage, session history, and configuration",
  args: {},
  async execute(args, context) {
    const spavnPath = path.join(context.worktree, SPAVN_DIR);
    const plansPath = path.join(spavnPath, "plans");
    const sessionsPath = path.join(spavnPath, "sessions");

    // Check if already exists
    if (fs.existsSync(spavnPath)) {
      const hasConfig = fs.existsSync(path.join(spavnPath, "config.json"));
      const hasPlans = fs.existsSync(plansPath);
      const hasSessions = fs.existsSync(sessionsPath);

      if (hasConfig && hasPlans && hasSessions) {
        return `✓ .spavn directory already initialized at ${spavnPath}`;
      }
    }

    // Create directories
    fs.mkdirSync(plansPath, { recursive: true });
    fs.mkdirSync(sessionsPath, { recursive: true });

    // Create config.json
    fs.writeFileSync(
      path.join(spavnPath, "config.json"),
      JSON.stringify(DEFAULT_CONFIG, null, 2)
    );

    // Create .gitignore
    fs.writeFileSync(path.join(spavnPath, ".gitignore"), GITIGNORE_CONTENT);

    // Create README.md
    fs.writeFileSync(path.join(spavnPath, "README.md"), README_CONTENT);

    // Create .gitkeep in plans to ensure it's tracked
    fs.writeFileSync(path.join(plansPath, ".gitkeep"), "");

    return `✓ Initialized .spavn directory at ${spavnPath}

Created:
- .spavn/config.json (configuration)
- .spavn/plans/ (implementation plans)
- .spavn/sessions/ (session summaries)
- .spavn/.gitignore (ignores sessions, keeps plans)
- .spavn/README.md (documentation)

Plans will be version controlled. Sessions are gitignored by default.`;
  },
});

export const status = tool({
  description:
    "Check .spavn directory status - whether it exists, plan count, session count",
  args: {},
  async execute(args, context) {
    const spavnPath = path.join(context.worktree, SPAVN_DIR);

    if (!fs.existsSync(spavnPath)) {
      return `✗ .spavn directory not found at ${spavnPath}

Run spavn_init to initialize.`;
    }

    const plansPath = path.join(spavnPath, "plans");
    const sessionsPath = path.join(spavnPath, "sessions");

    let planCount = 0;
    let sessionCount = 0;
    let recentPlans: string[] = [];
    let recentSessions: string[] = [];

    if (fs.existsSync(plansPath)) {
      const plans = fs
        .readdirSync(plansPath)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      planCount = plans.length;
      recentPlans = plans.slice(0, 3);
    }

    if (fs.existsSync(sessionsPath)) {
      const sessions = fs
        .readdirSync(sessionsPath)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .reverse();
      sessionCount = sessions.length;
      recentSessions = sessions.slice(0, 3);
    }

    let output = `✓ .spavn directory found at ${spavnPath}

Plans: ${planCount}`;

    if (recentPlans.length > 0) {
      output += `\n  Recent: ${recentPlans.join(", ")}`;
    }

    output += `\n\nSessions: ${sessionCount}`;

    if (recentSessions.length > 0) {
      output += `\n  Recent: ${recentSessions.join(", ")}`;
    }

    return output;
  },
});

/**
 * spavn_configure — Write per-project model configuration to ./opencode.json.
 *
 * Accepts a primary model (for implement/architect/fix/audit) and a subagent model
 * (for crosslayer/qa/guard/ship). Merges into any existing
 * opencode.json at the project root, preserving other settings.
 */
export const configure = tool({
  description:
    "Save per-project model configuration to ./opencode.json. " +
    "Sets the model for primary agents (implement, architect, fix, audit) and subagents (crosslayer, qa, guard, ship). " +
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
        "Model ID for primary agents (implement, architect, fix, audit). Format: provider/model-name"
      ),
    subagentModel: z
      .string()
      .describe(
        "Model ID for subagents (crosslayer, qa, guard, ship). Format: provider/model-name"
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

Primary agents (implement, architect, fix, audit):
  → ${primaryDisplay} (${args.primaryModel})

Subagents (crosslayer, qa, guard, ship):
  → ${subagentDisplay} (${args.subagentModel})

Restart OpenCode to apply changes.`;
  },
});
