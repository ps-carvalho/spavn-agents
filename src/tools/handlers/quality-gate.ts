import * as fs from "fs";
import * as path from "path";
import { SPAVN_DIR, PLANS_DIR } from "../../utils/constants.js";
import { classifyChangeScope } from "../../utils/change-scope.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Aggregate sub-agent quality gate findings into a unified report
 * with go/no-go recommendation.
 */
export function executeSummary(
  worktree: string,
  args: {
    scope?: string;
    changedFiles?: string[];
    testing?: string;
    security?: string;
    audit?: string;
    perf?: string;
    devops?: string;
    docsWriter?: string;
  },
): HandlerResult {
  let resolvedScope = args.scope ?? "unknown";
  if (args.changedFiles && args.changedFiles.length > 0) {
    const classification = classifyChangeScope(args.changedFiles);
    resolvedScope = classification.scope;
  }

  const agentEntries: [string, string | undefined][] = [
    ["testing", args.testing],
    ["security", args.security],
    ["audit", args.audit],
    ["perf", args.perf],
    ["devops", args.devops],
    ["docs-writer", args.docsWriter],
  ];

  const reports: Array<{ agent: string; raw: string }> = [];
  for (const [agent, raw] of agentEntries) {
    if (raw) reports.push({ agent, raw });
  }

  if (reports.length === 0) {
    return success("✗ No sub-agent reports provided.");
  }

  // Simple aggregation: count severity markers
  let hasCritical = false;
  let hasHigh = false;
  let hasMedium = false;
  const lines: string[] = [];
  lines.push("✓ Quality Gate Summary");
  lines.push(`\nScope: ${resolvedScope}`);
  lines.push(`Agents: ${reports.map((r) => r.agent).join(", ")}`);

  for (const { agent, raw } of reports) {
    const criticalCount = (raw.match(/\[(CRITICAL|BLOCKING|ERROR)\]/gi) || []).length;
    const highCount = (raw.match(/\[HIGH\]/gi) || []).length;
    const mediumCount = (raw.match(/\[(MEDIUM|WARNING|SUGGESTION)\]/gi) || []).length;
    if (criticalCount > 0) hasCritical = true;
    if (highCount > 0) hasHigh = true;
    if (mediumCount > 0) hasMedium = true;
    lines.push(`\n**@${agent}**: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium`);
  }

  const recommendation = hasCritical || hasHigh ? "NO-GO" : hasMedium ? "GO-WITH-WARNINGS" : "GO";
  lines.push(`\n**Recommendation: ${recommendation}**`);

  // Persist state
  const qgDir = path.join(worktree, SPAVN_DIR);
  fs.mkdirSync(qgDir, { recursive: true });
  fs.writeFileSync(path.join(qgDir, "quality-gate.json"), JSON.stringify({
    timestamp: new Date().toISOString(),
    scope: resolvedScope,
    recommendation,
    agents: reports.map((r) => r.agent),
  }, null, 2));

  return success(lines.join("\n"));
}

/**
 * Record an individual quality check result (testing/security/audit/perf/docs).
 */
export function executeReport(
  worktree: string,
  args: { agent: string; verdict: string; findings: string },
): HandlerResult {
  const qgDir = path.join(worktree, SPAVN_DIR);
  fs.mkdirSync(qgDir, { recursive: true });

  const reportsDir = path.join(qgDir, "quality-reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const filename = `${args.agent}-${new Date().toISOString().split("T")[0]}.md`;
  const content = `# Quality Report: ${args.agent}\n\n**Verdict:** ${args.verdict}\n\n## Findings\n\n${args.findings}`;
  fs.writeFileSync(path.join(reportsDir, filename), content);

  return success(`✓ Quality report saved: ${filename}\n\nVerdict: ${args.verdict}`);
}

/**
 * Mark quality gate as complete and update plan status.
 */
export function executeFinalize(
  worktree: string,
  args: { planFilename?: string; recommendation: string },
): HandlerResult {
  // Update quality-gate.json with final status
  const qgPath = path.join(worktree, SPAVN_DIR, "quality-gate.json");
  let qgState: Record<string, unknown> = {};
  try {
    qgState = JSON.parse(fs.readFileSync(qgPath, "utf-8"));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // corrupted file — start fresh
    }
  }
  qgState.finalizedAt = new Date().toISOString();
  qgState.recommendation = args.recommendation;
  qgState.status = "complete";
  fs.writeFileSync(qgPath, JSON.stringify(qgState, null, 2));

  // Update plan status if provided
  if (args.planFilename) {
    const planPath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.planFilename);
    try {
      let content = fs.readFileSync(planPath, "utf-8");
      content = content.replace(/status:\s*\w+/, `status: quality-${args.recommendation.toLowerCase()}`);
      fs.writeFileSync(planPath, content);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      // Plan file doesn't exist — skip status update
    }
  }

  return success(`✓ Quality gate finalized: ${args.recommendation}`);
}
