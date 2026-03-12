import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { detectWorktreeInfo } from "../utils/worktree-detect.js";
import {
  findPlanContent,
  extractPlanSections,
  extractIssueRefs,
  buildPrBodyFromPlan,
} from "../utils/plan-extract.js";
import { git, gh } from "../utils/shell.js";
import { checkGhAvailability } from "../utils/github.js";

const SPAVN_DIR = ".spavn";
const PROTECTED_BRANCHES = ["main", "master", "develop", "production", "staging"];
const DOCS_DIR = "docs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check if a remote named "origin" is configured.
 */
async function checkRemote(cwd: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { stdout } = await git(cwd, "remote", "-v");
    if (!stdout.includes("origin")) {
      return {
        ok: false,
        error:
          "No 'origin' remote configured. Add one with: git remote add origin <url>",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not check git remotes." };
  }
}

/**
 * Check whether docs/ has any content beyond .gitkeep files.
 */
function checkDocsExist(worktree: string): { exists: boolean; count: number } {
  const docsRoot = path.join(worktree, DOCS_DIR);
  if (!fs.existsSync(docsRoot)) {
    return { exists: false, count: 0 };
  }

  let count = 0;
  const subDirs = ["decisions", "features", "flows"];
  for (const sub of subDirs) {
    const subPath = path.join(docsRoot, sub);
    if (fs.existsSync(subPath)) {
      const files = fs.readdirSync(subPath).filter((f) => f.endsWith(".md") && f !== ".gitkeep");
      count += files.length;
    }
  }

  return { exists: count > 0, count };
}

/**
 * Get a summary of commits that will be in the PR (commits ahead of base).
 */
async function getCommitLog(cwd: string, baseBranch: string): Promise<string> {
  try {
    const { stdout } = await git(cwd, "log", `${baseBranch}..HEAD`, "--oneline");
    return stdout.trim();
  } catch {
    // If base branch doesn't exist locally, try origin/<base>
    try {
      const { stdout } = await git(cwd, "log", `origin/${baseBranch}..HEAD`, "--oneline");
      return stdout.trim();
    } catch {
      return "";
    }
  }
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export const finalize = tool({
  description:
    "Finalize a completed task: stage all changes, commit, push to origin, and create a PR via GitHub CLI. " +
    "Auto-detects worktrees and targets the main branch. " +
    "Auto-populates the PR body from .spavn/plans/ if a plan exists. " +
    "Run docs_list and session_save BEFORE calling this tool.",
  args: {
    commitMessage: tool.schema
      .string()
      .describe(
        "Commit message in conventional format (e.g., 'feat: add worktree launch tool')",
      ),
    prTitle: tool.schema
      .string()
      .optional()
      .describe("PR title (defaults to the commit message)"),
    prBody: tool.schema
      .string()
      .optional()
      .describe("Custom PR body in markdown. If omitted, auto-generated from .spavn/plans/ or commit log."),
    baseBranch: tool.schema
      .string()
      .optional()
      .describe("Target branch for PR (auto-detected: 'main' for worktrees, default branch otherwise)"),
    planFilename: tool.schema
      .string()
      .optional()
      .describe("Plan filename from .spavn/plans/ to include in PR body"),
    draft: tool.schema
      .boolean()
      .optional()
      .describe("Create as draft PR (default: false)"),
    issueRefs: tool.schema
      .array(tool.schema.number())
      .optional()
      .describe("GitHub issue numbers to link in PR body (adds 'Closes #N' for each)"),
  },
  async execute(args, context) {
    const {
      commitMessage,
      prTitle,
      prBody: customPrBody,
      baseBranch: customBaseBranch,
      planFilename,
      draft = false,
      issueRefs: explicitIssueRefs,
    } = args;

    const cwd = context.worktree;
    const output: string[] = [];
    const warnings: string[] = [];

    // ── 1. Validate: git repo ─────────────────────────────────
    try {
      await git(cwd, "rev-parse", "--git-dir");
    } catch {
      return "✗ Error: Not in a git repository.";
    }

    // ── 2. Detect worktree + branch ───────────────────────────
    const wtInfo = await detectWorktreeInfo(cwd);
    const branchName = wtInfo.currentBranch;

    if (!branchName || branchName === "(unknown)") {
      return "✗ Error: Could not determine current branch.";
    }

    if (PROTECTED_BRANCHES.includes(branchName)) {
      return `✗ Error: Cannot finalize on protected branch '${branchName}'.
Create a feature/bugfix branch first with branch_create or worktree_create.`;
    }

    // ── 3. Determine base branch ──────────────────────────────
    let baseBranch = customBaseBranch || "";

    if (!baseBranch) {
      if (wtInfo.isWorktree) {
        baseBranch = "main";
      } else {
        // Try to detect default branch from origin
        try {
          const { stdout } = await git(cwd, "symbolic-ref", "refs/remotes/origin/HEAD");
          baseBranch = stdout.trim().replace("refs/remotes/origin/", "");
        } catch {
          baseBranch = "main"; // Sensible default
        }
      }
    }

    output.push(`Branch: ${branchName} → ${baseBranch}`);
    if (wtInfo.isWorktree) {
      output.push(`Worktree detected (main tree: ${wtInfo.mainWorktreePath})`);
    }

    // ── 4. Check prerequisites ────────────────────────────────
    const ghStatus = await checkGhAvailability(cwd);
    if (!ghStatus.installed) {
      return "✗ GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run `gh auth login`.";
    }
    if (!ghStatus.authenticated) {
      return "✗ GitHub CLI is not authenticated. Run `gh auth login` to authenticate.";
    }

    const remoteCheck = await checkRemote(cwd);
    if (!remoteCheck.ok) {
      return `✗ ${remoteCheck.error}`;
    }

    // ── 5. Check docs (warning only) ─────────────────────────
    const docsCheck = checkDocsExist(cwd);
    if (!docsCheck.exists) {
      warnings.push(
        "No documentation found in docs/. Consider creating docs with docs_save before finalizing.",
      );
    } else {
      output.push(`Documentation: ${docsCheck.count} doc(s) found`);
    }

    // ── 6. Stage changes safely ─────────────────────────────
    try {
      // Stage tracked file changes (safe — won't pick up new untracked files)
      await git(cwd, "add", "-u");
      // Stage .spavn/ directory explicitly (plans, state, etc.)
      const spavnPath = path.join(cwd, SPAVN_DIR);
      if (fs.existsSync(spavnPath)) {
        await git(cwd, "add", SPAVN_DIR);
      }

      // Warn about untracked files that won't be staged
      const { stdout: untrackedOut } = await git(cwd, "ls-files", "--others", "--exclude-standard");
      const untrackedFiles = untrackedOut.trim().split("\n").filter(Boolean);
      if (untrackedFiles.length > 0) {
        warnings.push(
          `${untrackedFiles.length} untracked file(s) not staged: ${untrackedFiles.slice(0, 5).join(", ")}${untrackedFiles.length > 5 ? ` (and ${untrackedFiles.length - 5} more)` : ""}. Stage them manually with \`git add <file>\` if needed.`
        );
      }
    } catch (error: any) {
      return `✗ Error staging changes: ${error.message || error}`;
    }

    // ── 7. Commit ─────────────────────────────────────────────
    let commitHash = "";
    let commitSkipped = false;

    try {
      // Check if there's anything to commit
      const { stdout: statusOut } = await git(cwd, "status", "--porcelain");
      if (!statusOut.trim()) {
        commitSkipped = true;
        output.push("No new changes to commit (working tree clean)");
      } else {
        await git(cwd, "commit", "-m", commitMessage);
        const { stdout: hashOut } = await git(cwd, "rev-parse", "--short", "HEAD");
        commitHash = hashOut.trim();
        output.push(`Committed: ${commitHash} — ${commitMessage}`);
      }
    } catch (error: any) {
      return `✗ Error committing: ${error.message || error}`;
    }

    // ── 8. Push to origin ─────────────────────────────────────
    try {
      await git(cwd, "push", "-u", "origin", branchName);
      output.push(`Pushed to origin/${branchName}`);
    } catch (error: any) {
      return `✗ Error pushing to origin: ${error.message || error}

All previous steps succeeded (changes committed). Try pushing manually:
  git push -u origin ${branchName}`;
    }

    // ── 9. Build PR body ──────────────────────────────────────
    let prBodyContent = customPrBody || "";
    let issueRefs: number[] = explicitIssueRefs ?? [];

    if (!prBodyContent) {
      // Try to build from plan
      const plan = findPlanContent(cwd, planFilename, branchName);
      if (plan) {
        const sections = extractPlanSections(plan.content, plan.filename);
        prBodyContent = buildPrBodyFromPlan(sections);
        output.push(`PR body generated from plan: ${plan.filename}`);

        // Extract issue refs from plan frontmatter if not explicitly provided
        if (issueRefs.length === 0) {
          issueRefs = extractIssueRefs(plan.content);
        }
      } else {
        // Fall back to commit log
        const commitLog = await getCommitLog(cwd, baseBranch);
        if (commitLog) {
          prBodyContent = `## Changes\n\n\`\`\`\n${commitLog}\n\`\`\``;
        } else {
          prBodyContent = `Implementation on branch \`${branchName}\``;
        }
      }
    }

    // Append issue closing references to PR body
    if (issueRefs.length > 0) {
      const closingRefs = issueRefs.map((n) => `Closes #${n}`).join("\n");
      prBodyContent += `\n\n## Linked Issues\n\n${closingRefs}`;
      output.push(`Linked issues: ${issueRefs.map((n) => `#${n}`).join(", ")}`);
    }

    // ── 10. Create PR via gh ──────────────────────────────────
    const finalPrTitle = prTitle || commitMessage;
    let prUrl = "";

    try {
      // Check if PR already exists for this branch
      const { stdout: existingPr } = await gh(cwd, "pr", "view", branchName, "--json", "url", "--jq", ".url");

      if (existingPr.trim()) {
        prUrl = existingPr.trim();
        output.push(`PR already exists: ${prUrl}`);
      } else {
        prUrl = await createPr(cwd, baseBranch, finalPrTitle, prBodyContent, draft);
        output.push(`PR created: ${prUrl}`);
      }
    } catch {
      // PR doesn't exist yet, create it
      try {
        prUrl = await createPr(cwd, baseBranch, finalPrTitle, prBodyContent, draft);
        output.push(`PR created: ${prUrl}`);
      } catch (error: any) {
        // PR creation failed but everything else succeeded
        output.push(`⚠ PR creation failed: ${error.message || error}`);
        output.push("");
        output.push("Changes are committed and pushed. Create the PR manually:");
        output.push(`  gh pr create --base ${baseBranch} --title "${finalPrTitle}"`);
      }
    }

    // ── Build final output ────────────────────────────────────
    let finalOutput = `✓ Task finalized\n\n`;
    finalOutput += output.join("\n");

    if (warnings.length > 0) {
      finalOutput += `\n\nWarnings:\n${warnings.map((w) => `  ⚠ ${w}`).join("\n")}`;
    }

    if (wtInfo.isWorktree) {
      finalOutput += `\n\nThis is a worktree. When the PR is merged, you can clean up with:
  worktree_remove (name: "${path.basename(cwd)}", deleteBranch: true)`;
    }

    return finalOutput;
  },
});

/**
 * Create a PR using gh CLI with array-based args (no shell injection).
 * Uses a temp body file to avoid shell escaping issues with PR body content.
 */
async function createPr(
  cwd: string,
  baseBranch: string,
  title: string,
  body: string,
  draft: boolean,
): Promise<string> {
  const bodyFile = path.join(cwd, ".spavn", ".pr-body-tmp.md");
  const spavnDir = path.join(cwd, ".spavn");
  if (!fs.existsSync(spavnDir)) {
    fs.mkdirSync(spavnDir, { recursive: true });
  }
  fs.writeFileSync(bodyFile, body);

  try {
    const createArgs = [
      "pr", "create",
      "--base", baseBranch,
      "--title", title,
      "--body-file", bodyFile,
    ];
    if (draft) createArgs.push("--draft");

    const { stdout } = await gh(cwd, ...createArgs);
    return stdout.trim();
  } finally {
    if (fs.existsSync(bodyFile)) {
      fs.unlinkSync(bodyFile);
    }
  }
}
