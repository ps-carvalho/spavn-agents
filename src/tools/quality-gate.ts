/**
 * Quality Gate Summary Tool
 *
 * Aggregates sub-agent findings into a unified report with severity sorting,
 * go/no-go recommendation, and PR body content.
 *
 * The OpenCode plugin version has richer parsing (per-finding extraction,
 * deduplication, PR body section) than the simplified handler. We keep the
 * full logic here and delegate only the state persistence to the handler.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { classifyChangeScope } from "../utils/change-scope.js";
import { SPAVN_DIR } from "../utils/constants.js";
const QUALITY_GATE_FILE = "quality-gate.json";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Finding {
  agent: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  location?: string;
  description: string;
}

interface AgentReport {
  agent: string;
  verdict: string;
  findings: Finding[];
  raw: string;
}

interface QualityGateState {
  timestamp: string;
  scope: string;
  reports: AgentReport[];
  recommendation: "GO" | "NO-GO" | "GO-WITH-WARNINGS";
}

// ─── Severity ordering ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

// ─── quality_gate_summary ────────────────────────────────────────────────────

export const qualityGateSummary = tool({
  description:
    "Aggregate sub-agent quality gate findings into a unified report. " +
    "Parses findings from @testing, @security, @audit, @perf, @devops, and @docs-writer, " +
    "sorts by severity, provides a go/no-go recommendation, and generates PR body content. " +
    "Pass each agent's raw report text as a separate entry.",
  args: {
    scope: tool.schema
      .string()
      .optional()
      .describe("Change scope classification: trivial, low, standard, high. If changedFiles is provided, this is auto-classified and this field is ignored."),
    changedFiles: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Array of changed file paths. When provided, scope is auto-classified using classifyChangeScope."),
    testing: tool.schema
      .string()
      .optional()
      .describe("Raw report from @testing sub-agent"),
    security: tool.schema
      .string()
      .optional()
      .describe("Raw report from @security sub-agent"),
    audit: tool.schema
      .string()
      .optional()
      .describe("Raw report from @audit sub-agent"),
    perf: tool.schema
      .string()
      .optional()
      .describe("Raw report from @perf sub-agent"),
    devops: tool.schema
      .string()
      .optional()
      .describe("Raw report from @devops sub-agent"),
    docsWriter: tool.schema
      .string()
      .optional()
      .describe("Raw report from @docs-writer sub-agent"),
  },
  async execute(args, context) {
    const cwd = context.worktree;
    const reports: AgentReport[] = [];

    // Auto-classify scope from changed files if provided
    let resolvedScope = args.scope ?? "unknown";
    if (args.changedFiles && args.changedFiles.length > 0) {
      const classification = classifyChangeScope(args.changedFiles);
      resolvedScope = classification.scope;
    }

    // Parse each provided report
    const agentEntries: [string, string | undefined][] = [
      ["testing", args.testing],
      ["security", args.security],
      ["audit", args.audit],
      ["perf", args.perf],
      ["devops", args.devops],
      ["docs-writer", args.docsWriter],
    ];

    for (const [agent, raw] of agentEntries) {
      if (!raw) continue;
      reports.push(parseReport(agent, raw));
    }

    if (reports.length === 0) {
      return `\u2717 No sub-agent reports provided. Pass at least one agent report to aggregate.`;
    }

    // Collect all findings, deduplicate, and sort by severity
    const rawFindings = reports.flatMap((r) => r.findings);
    const allFindings = deduplicateFindings(rawFindings);
    allFindings.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

    // Determine recommendation
    const hasCritical = allFindings.some((f) => f.severity === "CRITICAL");
    const hasHigh = allFindings.some((f) => f.severity === "HIGH");
    const hasMedium = allFindings.some((f) => f.severity === "MEDIUM");

    let recommendation: "GO" | "NO-GO" | "GO-WITH-WARNINGS";
    if (hasCritical || hasHigh) {
      recommendation = "NO-GO";
    } else if (hasMedium) {
      recommendation = "GO-WITH-WARNINGS";
    } else {
      recommendation = "GO";
    }

    // Build state for persistence
    const state: QualityGateState = {
      timestamp: new Date().toISOString(),
      scope: resolvedScope,
      reports,
      recommendation,
    };

    // Persist state
    persistState(cwd, state);

    // Format output
    const lines: string[] = [];
    lines.push(`\u2713 Quality Gate Summary`);
    lines.push("");
    lines.push(`**Recommendation: ${recommendation}**`);
    lines.push(`Scope: ${resolvedScope}`);
    lines.push(`Agents: ${reports.map((r) => r.agent).join(", ")}`);
    lines.push(`Total findings: ${allFindings.length}`);
    lines.push("");

    // Per-agent verdicts
    lines.push("## Agent Results");
    for (const report of reports) {
      const agentFindings = report.findings;
      const counts = countBySeverity(agentFindings);
      lines.push(`- **@${report.agent}**: ${report.verdict} — ${formatCounts(counts)}`);
    }

    // All findings sorted by severity
    if (allFindings.length > 0) {
      lines.push("");
      lines.push("## Findings (sorted by severity)");
      for (const finding of allFindings) {
        const loc = finding.location ? ` (${finding.location})` : "";
        lines.push(`- **[${finding.severity}]** @${finding.agent}: ${finding.title}${loc}`);
        if (finding.description) {
          lines.push(`  ${finding.description.substring(0, 200)}`);
        }
      }
    }

    // Blockers
    const blockers = allFindings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH");
    if (blockers.length > 0) {
      lines.push("");
      lines.push("## Blockers (must fix before merge)");
      for (const b of blockers) {
        lines.push(`- **[${b.severity}]** @${b.agent}: ${b.title}`);
      }
    }

    // PR body section
    lines.push("");
    lines.push("## PR Body Quality Gate Section");
    lines.push("```");
    lines.push("## Quality Gate");
    for (const report of reports) {
      const counts = countBySeverity(report.findings);
      lines.push(`- ${capitalize(report.agent)}: ${report.verdict} — ${formatCounts(counts)}`);
    }
    lines.push(`- **Recommendation: ${recommendation}**`);
    lines.push("```");

    return lines.join("\n");
  },
});

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseReport(agent: string, raw: string): AgentReport {
  const findings: Finding[] = [];

  // Extract verdict
  let verdict = "Unknown";
  const verdictMatch = raw.match(/\*\*Verdict\*\*:\s*(.+)/i)
    ?? raw.match(/Verdict:\s*(.+)/i);
  if (verdictMatch) {
    verdict = verdictMatch[1].trim();
  }

  // Extract findings by severity markers
  const findingRegex = /####?\s*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO|BLOCKING|WARNING|ERROR|SUGGESTION|NITPICK|PRAISE)\]\s*(.+)/gi;
  let match;
  while ((match = findingRegex.exec(raw)) !== null) {
    const rawSeverity = match[1].toUpperCase();
    const title = match[2].trim();

    // Normalize severity
    let severity: Finding["severity"];
    switch (rawSeverity) {
      case "CRITICAL":
      case "BLOCKING":
      case "ERROR":
        severity = "CRITICAL";
        break;
      case "HIGH":
        severity = "HIGH";
        break;
      case "MEDIUM":
      case "WARNING":
      case "SUGGESTION":
        severity = "MEDIUM";
        break;
      case "LOW":
      case "NITPICK":
        severity = "LOW";
        break;
      default:
        severity = "INFO";
    }

    // Try to extract location from lines following the finding
    const afterMatch = raw.substring(match.index + match[0].length, match.index + match[0].length + 500);
    const locationMatch = afterMatch.match(/\*\*Location\*\*:\s*`?([^`\n]+)/i)
      ?? afterMatch.match(/\*\*File\*\*:\s*`?([^`\n]+)/i);
    const descMatch = afterMatch.match(/\*\*Description\*\*:\s*(.+)/i);

    findings.push({
      agent,
      severity,
      title,
      location: locationMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim() ?? "",
    });
  }

  return { agent, verdict, findings, raw };
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  const parts: string[] = [];
  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]) {
    if (counts[sev]) {
      parts.push(`${counts[sev]} ${sev.toLowerCase()}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "no findings";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Deduplicate findings by file+line+message hash.
 * When multiple agents flag the same issue, keep the highest severity.
 */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.location ?? ""}::${f.title}`;
    const existing = seen.get(key);
    if (!existing || (SEVERITY_ORDER[f.severity] ?? 99) < (SEVERITY_ORDER[existing.severity] ?? 99)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

function persistState(cwd: string, state: QualityGateState): void {
  const dir = path.join(cwd, SPAVN_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filepath = path.join(dir, QUALITY_GATE_FILE);
  fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
}
