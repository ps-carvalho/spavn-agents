/**
 * Change Scope Detection
 *
 * Categorizes changed files by risk level to determine which sub-agents
 * should be triggered during the quality gate. Avoids wasting tokens on
 * trivial changes while ensuring high-risk changes get full coverage.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChangeScope = "trivial" | "low" | "standard" | "high";

export interface ChangeScopeResult {
  /** Overall risk classification */
  scope: ChangeScope;
  /** Human-readable rationale for the classification */
  rationale: string;
  /** Which sub-agents should be launched based on the scope */
  agents: ScopedAgents;
}

export interface ScopedAgents {
  testing: boolean;
  security: boolean;
  audit: boolean;
  devops: boolean;
  perf: boolean;
  docsWriter: boolean;
}

// ─── File Pattern Matchers ───────────────────────────────────────────────────

/** Patterns that indicate trivial changes — docs, comments, formatting only */
const TRIVIAL_PATTERNS = [
  /\.md$/i,
  /\.txt$/i,
  /\.mdx$/i,
  /LICENSE/i,
  /CHANGELOG/i,
  /\.prettierrc/,
  /\.editorconfig/,
  /\.vscode\//,
  /\.idea\//,
];

/** Patterns that indicate test/config-only changes — low risk */
const LOW_RISK_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
  /test\//,
  /tests\//,
  /\.eslintrc/,
  /\.prettierrc/,
  /tsconfig.*\.json$/,
  /jest\.config/,
  /vitest\.config/,
  /\.gitignore$/,
];

/** Patterns that indicate high-risk changes — auth, payments, infra, security */
const HIGH_RISK_PATTERNS = [
  // Auth & security — match directory boundaries, not arbitrary substrings
  /\bauth[/\-._]/i,
  /\/auth\b/i,
  /login/i,
  /\/session\b/i,
  /password/i,
  /\/tokens?\b/i,
  /\bcrypto[/\-._]/i,
  /encrypt/i,
  /permission/i,
  /rbac/i,
  /oauth/i,
  /jwt/i,
  /middleware\/auth/i,

  // Payment & sensitive data
  /payment/i,
  /billing/i,
  /stripe/i,
  /\/checkout\b/i,

  // Infrastructure & deployment
  /Dockerfile/i,
  /docker-compose/i,
  /\.github\/workflows\//,
  /\.gitlab-ci/,
  /Jenkinsfile/i,
  /\.circleci\//,
  /terraform\//,
  /pulumi\//,
  /k8s\//,
  /deploy\//,
  /infra\//,
  /nginx\.conf/i,
  /Caddyfile/i,
  /Procfile/i,
  /fly\.toml/i,
];

/** Patterns that indicate DevOps file changes */
const DEVOPS_PATTERNS = [
  /Dockerfile/i,
  /docker-compose/i,
  /\.dockerignore/i,
  /\.github\/workflows\//,
  /\.gitlab-ci/,
  /Jenkinsfile/i,
  /\.circleci\//,
  /terraform\//,
  /pulumi\//,
  /cdk\//,
  /k8s\//,
  /deploy\//,
  /infra\//,
  /nginx\.conf/i,
  /Caddyfile/i,
  /Procfile/i,
  /fly\.toml/i,
  /railway\.json/i,
  /render\.yaml/i,
];

/** Patterns that indicate performance-sensitive changes */
const PERF_PATTERNS = [
  /\/queries?\b/i,
  /database/i,
  /migration/i,
  /\.sql$/i,
  /prisma/i,
  /drizzle/i,
  /repository/i,
  /\/cache[/\-._]/i,
  /algorithm/i,
  /worker/i,
  /stream/i,
  /batch/i,
  /queue/i,
];

// ─── Classification ──────────────────────────────────────────────────────────

// ─── Project-level overrides ─────────────────────────────────────────────

interface ScopeOverrides {
  high_risk?: string[];
  low_risk?: string[];
  trivial?: string[];
  devops?: string[];
  perf?: string[];
}

/**
 * Load project-level scope pattern overrides from .spavn/scope-config.json.
 */
function loadScopeOverrides(projectRoot?: string): ScopeOverrides | null {
  if (!projectRoot) return null;
  const configPath = path.join(projectRoot, ".spavn", "scope-config.json");
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as ScopeOverrides;
  } catch {
    return null;
  }
}

function toPatterns(strings: string[] | undefined): RegExp[] {
  if (!strings) return [];
  return strings.map((s) => new RegExp(s));
}

/**
 * Classify a set of changed files into a risk scope and determine
 * which sub-agents should be triggered.
 *
 * @param changedFiles - Array of file paths that were created or modified
 * @param projectRoot - Optional project root to load .spavn/scope-config.json overrides
 * @returns Classification result with scope, rationale, and agent triggers
 */
export function classifyChangeScope(changedFiles: string[], projectRoot?: string): ChangeScopeResult {
  if (changedFiles.length === 0) {
    return {
      scope: "trivial",
      rationale: "No files changed",
      agents: noAgents(),
    };
  }

  // Merge default patterns with project-level overrides
  const overrides = loadScopeOverrides(projectRoot);
  const highRiskPatterns = [...HIGH_RISK_PATTERNS, ...toPatterns(overrides?.high_risk)];
  const lowRiskPatterns = [...LOW_RISK_PATTERNS, ...toPatterns(overrides?.low_risk)];
  const trivialPatterns = [...TRIVIAL_PATTERNS, ...toPatterns(overrides?.trivial)];
  const devopsPatterns = [...DEVOPS_PATTERNS, ...toPatterns(overrides?.devops)];
  const perfPatterns = [...PERF_PATTERNS, ...toPatterns(overrides?.perf)];

  const hasHighRisk = changedFiles.some((f) => highRiskPatterns.some((p) => p.test(f)));
  const hasDevOps = changedFiles.some((f) => devopsPatterns.some((p) => p.test(f)));
  const hasPerf = changedFiles.some((f) => perfPatterns.some((p) => p.test(f)));
  const allTrivial = changedFiles.every((f) => trivialPatterns.some((p) => p.test(f)));
  const allLowRisk = changedFiles.every((f) =>
    lowRiskPatterns.some((p) => p.test(f)) || trivialPatterns.some((p) => p.test(f)),
  );

  // Trivial — docs/comments only
  if (allTrivial) {
    return {
      scope: "trivial",
      rationale: "Documentation/formatting changes only — no quality gate needed",
      agents: {
        ...noAgents(),
        docsWriter: true,
      },
    };
  }

  // Low risk — tests/config only
  if (allLowRisk) {
    return {
      scope: "low",
      rationale: "Test/config changes only — minimal quality gate",
      agents: {
        ...noAgents(),
        testing: true,
      },
    };
  }

  // High risk — auth, payments, infra
  if (hasHighRisk) {
    return {
      scope: "high",
      rationale: "High-risk changes detected (auth/security/payments/infra) — full quality gate",
      agents: {
        testing: true,
        security: true,
        audit: true,
        devops: hasDevOps,
        perf: hasPerf,
        docsWriter: true,
      },
    };
  }

  // Standard — everything else
  return {
    scope: "standard",
    rationale: "Standard code changes — normal quality gate",
    agents: {
      testing: true,
      security: true,
      audit: true,
      devops: hasDevOps,
      perf: hasPerf,
      docsWriter: true,
    },
  };
}

/** Helper: no agents triggered */
function noAgents(): ScopedAgents {
  return {
    testing: false,
    security: false,
    audit: false,
    devops: false,
    perf: false,
    docsWriter: false,
  };
}
