import * as fs from "fs";
import * as path from "path";
import { exec } from "../../utils/shell.js";
import { SPAVN_DIR, PLANS_DIR } from "../../utils/constants.js";
import { slugify } from "../../utils/strings.js";
import {
  parseFrontmatter as parsePlanFrontmatter,
  upsertFrontmatterField,
  TYPE_TO_PREFIX,
} from "../../utils/plan-extract.js";
import { success, failure, type HandlerResult } from "./types.js";

// ─── Shared pure functions (used by both OpenCode tools and MCP server) ──────

/**
 * Create a plan skeleton with title, type, and optional GitHub issue ref.
 * Auto-inits .spavn/ if needed.
 */
export function executePlanStart(
  worktree: string,
  args: { title: string; type: string; issueRef?: number },
): string {
  const plansPath = path.join(worktree, SPAVN_DIR, PLANS_DIR);
  fs.mkdirSync(plansPath, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const slug = slugify(args.title);
  const filename = `${date}-${args.type}-${slug}.md`;
  const filepath = path.join(plansPath, filename);

  const issueRefLine = args.issueRef ? `\nissue: ${args.issueRef}` : "";

  const content = `---
title: "${args.title}"
type: ${args.type}
created: ${new Date().toISOString()}
status: draft${issueRefLine}
---

# ${args.title}

## Context

<!-- Describe the problem or opportunity -->

## Approach

<!-- Outline the technical approach -->

## Tasks

- [ ] <!-- Task 1 -->
- [ ] <!-- Task 2 -->
- [ ] <!-- Task 3 -->

## Risks

<!-- Identify potential risks -->
`;

  fs.writeFileSync(filepath, content);
  return `✓ Plan skeleton created: ${filename}\n\nEdit the plan, then use plan_interview to refine and plan_approve when ready.`;
}

/**
 * Append Q&A refinement to a draft plan.
 */
export function executePlanInterview(
  worktree: string,
  args: { planFilename: string; question: string; answer: string },
): string {
  const filepath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.planFilename);

  let content: string;
  try {
    content = fs.readFileSync(filepath, "utf-8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return `✗ Plan not found: ${args.planFilename}`;
    }
    throw e;
  }

  // Check it's still draft
  if (!content.includes("status: draft")) {
    return `✗ Plan is not in draft status. Only draft plans can be refined.`;
  }

  const qaSection = `\n\n### Q: ${args.question}\n\n${args.answer}\n`;
  fs.writeFileSync(filepath, content + qaSection);

  return `✓ Refinement added to ${args.planFilename}`;
}

/**
 * Update plan status from draft to approved.
 */
export function executePlanApprove(
  worktree: string,
  args: { planFilename: string },
): string {
  const filepath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.planFilename);

  let content: string;
  try {
    content = fs.readFileSync(filepath, "utf-8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return `✗ Plan not found: ${args.planFilename}`;
    }
    throw e;
  }

  if (!content.includes("status: draft")) {
    return `✗ Plan is not in draft status.`;
  }

  content = content.replace("status: draft", "status: approved");
  fs.writeFileSync(filepath, content);

  return `✓ Plan approved: ${args.planFilename}\n\nReady for coordinate_tasks to break into assignments.`;
}

/**
 * Edit a plan file: overwrite content while preserving/updating frontmatter `updated` timestamp.
 */
export function executePlanEdit(
  worktree: string,
  args: { filename: string; content: string },
): string {
  const plansPath = path.join(worktree, SPAVN_DIR, PLANS_DIR);
  const filepath = path.resolve(plansPath, args.filename);
  const resolvedPlansDir = path.resolve(plansPath);

  // Prevent path traversal
  if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
    return `✗ Invalid plan filename: path traversal not allowed`;
  }

  let existing: string;
  try {
    existing = fs.readFileSync(filepath, "utf-8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return `✗ Plan not found: ${args.filename}`;
    }
    throw e;
  }

  // Read existing file to check for frontmatter
  const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(existing);

  let newContent = args.content;
  if (hasFrontmatter) {
    // Check if the new content also has frontmatter
    const newHasFrontmatter = /^---\n[\s\S]*?\n---/.test(newContent);
    if (newHasFrontmatter) {
      // Upsert the updated timestamp in the new content's frontmatter
      newContent = upsertFrontmatterField(newContent, "updated", new Date().toISOString());
    } else {
      // Extract existing frontmatter and prepend it to the new content
      const fmMatch = existing.match(/^(---\n[\s\S]*?\n---)\n?/);
      if (fmMatch) {
        let frontmatter = fmMatch[1];
        // Upsert updated timestamp
        const withUpdated = upsertFrontmatterField(
          frontmatter + "\n\ncontent",
          "updated",
          new Date().toISOString(),
        );
        // Extract just the frontmatter part back
        const updatedFmMatch = withUpdated.match(/^(---\n[\s\S]*?\n---)/);
        if (updatedFmMatch) {
          frontmatter = updatedFmMatch[1];
        }
        newContent = frontmatter + "\n\n" + newContent;
      }
    }
  }

  fs.writeFileSync(filepath, newContent);
  return `✓ Plan updated: ${args.filename}`;
}

// ─── Handler functions (for MCP server) ──────────────────────────────────────

/**
 * List all plans in .spavn/plans/ with preview.
 */
export function executeList(
  worktree: string,
  args: { limit?: number },
): HandlerResult {
  const plansPath = path.join(worktree, SPAVN_DIR, PLANS_DIR);

  if (!fs.existsSync(plansPath)) {
    return success(`No plans found. Run spavn_init to initialize.`);
  }

  const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).sort().reverse();
  const limit = args.limit || 10;
  const limited = files.slice(0, Math.min(limit, files.length));

  if (limited.length === 0) {
    return success(`No plans saved in .spavn/plans/`);
  }

  let output = `✓ Plans (showing ${limited.length}):\n\n`;
  for (const file of limited) {
    output += `  • ${file}\n`;
  }
  return success(output);
}

/**
 * Load a full plan by filename.
 */
export function executeLoad(
  worktree: string,
  args: { filename: string },
): HandlerResult {
  const filepath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.filename);

  try {
    const content = fs.readFileSync(filepath, "utf-8");
    return success(`✓ Plan: ${args.filename}\n\n${content}`);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return success(`✗ Plan not found: ${args.filename}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Save an implementation plan to .spavn/plans/ with mermaid diagram support.
 */
export function executeSave(
  worktree: string,
  args: { title: string; type: string; content: string },
): HandlerResult {
  const plansPath = path.join(worktree, SPAVN_DIR, PLANS_DIR);

  try {
    fs.mkdirSync(plansPath, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const slug = slugify(args.title);
    const filename = `${date}-${args.type}-${slug}.md`;
    const filepath = path.join(plansPath, filename);

    fs.writeFileSync(filepath, `# ${args.title}\n\n${args.content}`);
    return success(`✓ Plan saved: ${filename}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Delete a plan file.
 */
export function executeDelete(
  worktree: string,
  args: { filename: string },
): HandlerResult {
  const filepath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.filename);

  try {
    fs.unlinkSync(filepath);
    return success(`✓ Deleted plan: ${args.filename}`);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return success(`✗ Plan not found: ${args.filename}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Stage and commit .spavn/ plan artifacts on the current branch.
 * Writes a suggested branch name into frontmatter for handoff.
 */
export async function executeCommit(
  worktree: string,
  args: { planFilename: string },
): Promise<HandlerResult> {
  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
  } catch {
    return success("✗ Error: Not in a git repository.");
  }

  const plansDir = path.join(worktree, SPAVN_DIR, PLANS_DIR);
  const filepath = path.resolve(plansDir, args.planFilename);
  const resolvedPlansDir = path.resolve(plansDir);

  if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
    return success("✗ Invalid plan filename: path traversal not allowed");
  }
  let planContent: string;
  try {
    planContent = fs.readFileSync(filepath, "utf-8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return success(`✗ Plan not found: ${args.planFilename}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return failure(`Error: ${msg}`);
  }
  const fm = parsePlanFrontmatter(planContent);

  const planTitle = fm?.title || "untitled";
  const planType = fm?.type || "feature";

  // Compute suggested branch
  const VALID_PREFIXES = Object.values(TYPE_TO_PREFIX);
  const rawPrefix = TYPE_TO_PREFIX[planType] || "feature";
  const prefix = VALID_PREFIXES.includes(rawPrefix) ? rawPrefix : "feature";
  const slug = planTitle.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 50);
  const suggestedBranch = `${prefix}/${slug}`;

  planContent = upsertFrontmatterField(planContent, "branch", suggestedBranch);
  fs.writeFileSync(filepath, planContent);

  // Stage .spavn/
  try {
    await exec("git", ["add", path.join(worktree, SPAVN_DIR)], { cwd: worktree });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return failure(`Error: ${msg}`);
  }

  // Commit
  const commitMsg = `chore(plan): ${planTitle}`;
  try {
    const { stdout: statusOut } = await exec("git", ["status", "--porcelain"], { cwd: worktree, nothrow: true });
    const stagedLines = statusOut.trim().split("\n").filter((l) => l && l[0] !== " " && l[0] !== "?");
    if (stagedLines.length === 0) {
      return success(`✓ Plan already committed (no new changes)\nSuggested branch: ${suggestedBranch}`);
    }

    await exec("git", ["commit", "-m", commitMsg], { cwd: worktree });
    const { stdout: hashOut } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: worktree, nothrow: true });

    return success(`✓ Plan committed\n\nCommit: ${hashOut.trim()} — ${commitMsg}\nPlan: ${args.planFilename}\nSuggested branch: ${suggestedBranch}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
