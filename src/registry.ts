/**
 * Static model registry for spavn-agents.
 *
 * A curated list of well-known providers and their popular models.
 * Used by the `configure` CLI command to present interactive selection.
 * Users can always enter a custom model ID for unlisted providers.
 */

export interface ModelEntry {
  /** Full model identifier in "provider/model" format */
  id: string;
  /** Human-friendly display name */
  name: string;
  /** Provider display name */
  provider: string;
  /** Model tier for categorised selection */
  tier: "premium" | "standard" | "fast";
  /** Short description shown in the selection menu */
  description: string;
}

export const MODEL_REGISTRY: ModelEntry[] = [
  // ── Anthropic ──────────────────────────────────────────────
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    tier: "standard",
    description: "Best balance of intelligence and speed",
  },
  {
    id: "anthropic/claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "Anthropic",
    tier: "premium",
    description: "Most capable, best for complex architecture",
  },
  {
    id: "anthropic/claude-haiku-3.5",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
    tier: "fast",
    description: "Fast and cost-effective for focused tasks",
  },

  // ── OpenAI ─────────────────────────────────────────────────
  {
    id: "openai/o3",
    name: "o3",
    provider: "OpenAI",
    tier: "premium",
    description: "Advanced reasoning model",
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    tier: "standard",
    description: "Fast multimodal model",
  },
  {
    id: "openai/o4-mini",
    name: "o4 Mini",
    provider: "OpenAI",
    tier: "fast",
    description: "Fast reasoning, cost-effective",
  },

  // ── Google ─────────────────────────────────────────────────
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    tier: "premium",
    description: "Large context window, strong reasoning",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    tier: "fast",
    description: "Fast and efficient",
  },

  // ── Kimi ───────────────────────────────────────────────────
  {
    id: "kimi-for-coding/k2p5",
    name: "Kimi K2P5",
    provider: "Kimi",
    tier: "standard",
    description: "Optimized for code generation",
  },

  // ── xAI ────────────────────────────────────────────────────
  {
    id: "xai/grok-3",
    name: "Grok 3",
    provider: "xAI",
    tier: "premium",
    description: "Powerful general-purpose model",
  },
  {
    id: "xai/grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xAI",
    tier: "fast",
    description: "Lightweight and fast",
  },

  // ── DeepSeek ───────────────────────────────────────────────
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    tier: "premium",
    description: "Strong reasoning, open-source foundation",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    tier: "fast",
    description: "Fast general-purpose chat model",
  },
];

/** Primary agents receive the best available model */
export const PRIMARY_AGENTS = ["architect", "implement", "fix"] as const;

/** Subagents receive a fast/cost-effective model */
export const SUBAGENTS = ["debug", "coder", "testing", "security", "devops", "audit", "refactor", "docs-writer", "perf", "worker"] as const;

/** All agent names combined */
export const ALL_AGENTS = [...PRIMARY_AGENTS, ...SUBAGENTS] as const;

/** OpenCode built-in agents disabled when spavn-agents is installed.
 *  Replaced by spavn equivalents: build → implement, plan → architect */
export const DISABLED_BUILTIN_AGENTS = ["build", "plan"] as const;

/** Old agent files to clean up from previous spavn-agents versions */
export const STALE_AGENT_FILES = [
  "build.md",
  "plan.md",
  "review.md",
  "fullstack.md",
  "crosslayer.md",
  "qa.md",
  "guard.md",
  "ship.md",
] as const;

/**
 * Build the interactive choices list for primary model selection.
 * Shows premium and standard tier models (excluding fast).
 */
export function getPrimaryChoices() {
  return MODEL_REGISTRY.filter((m) => m.tier !== "fast").map((m) => ({
    title: `${m.name}  (${m.provider.toLowerCase()})`,
    description: m.description,
    value: m.id,
  }));
}

/**
 * Build the interactive choices list for subagent model selection.
 * Shows fast tier models plus a "Same as primary" option.
 */
export function getSubagentChoices(primaryModelId: string) {
  const choices = MODEL_REGISTRY.filter((m) => m.tier === "fast").map((m) => ({
    title: `${m.name}  (${m.provider.toLowerCase()})`,
    description: m.description,
    value: m.id,
  }));

  choices.push({
    title: "Same as primary",
    description: primaryModelId,
    value: "__same__",
  });

  return choices;
}
