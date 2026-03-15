import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { git } from "../utils/shell.js";
import {
  TYPE_TO_PREFIX,
  parseFrontmatter,
  upsertFrontmatterField,
} from "../utils/plan-extract.js";

const SPAVN_DIR = ".spavn";
const PLANS_DIR = "plans";

const PROTECTED_BRANCHES = ["main", "master", "develop", "production", "staging"];

// Extract client type from the plugin input via inference
type Client = PluginInput["client"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

function getDatePrefix(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // YYYY-MM-DD
}

function ensureSpavnDir(worktree: string): string {
  const spavnPath = path.join(worktree, SPAVN_DIR);
  const plansPath = path.join(spavnPath, PLANS_DIR);

  if (!fs.existsSync(plansPath)) {
    fs.mkdirSync(plansPath, { recursive: true });
  }

  return plansPath;
}

export const save = tool({
  description:
    "Save an implementation plan to .spavn/plans/ with mermaid diagram support",
  args: {
    title: tool.schema.string().describe("Plan title (e.g., 'User Authentication System')"),
    type: tool.schema
      .enum(["feature", "bugfix", "refactor", "architecture", "spike", "docs"])
      .describe("Plan type"),
    content: tool.schema
      .string()
      .describe("Full plan content in markdown (can include mermaid diagrams)"),
    tasks: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional list of tasks"),
    branch: tool.schema
      .string()
      .optional()
      .describe("Optional branch name to store in frontmatter (set by plan_commit)"),
  },
  async execute(args, context) {
    const { title, type, content, tasks, branch } = args;
    
    const plansPath = ensureSpavnDir(context.worktree);
    const datePrefix = getDatePrefix();
    const slug = slugify(title);
    const filename = `${datePrefix}-${type}-${slug}.md`;
    const filepath = path.join(plansPath, filename);

    // Build frontmatter
    const branchLine = branch ? `\nbranch: ${branch}` : "";
    const frontmatter = `---
title: "${title}"
type: ${type}
created: ${new Date().toISOString()}
status: draft${branchLine}
---

`;

    // Build task list if provided
    let taskSection = "";
    if (tasks && tasks.length > 0) {
      taskSection = `\n## Tasks\n\n${tasks.map((t) => `- [ ] ${t}`).join("\n")}\n`;
    }

    // Combine content
    const fullContent = frontmatter + `# ${title}\n\n` + content + taskSection;

    // Write file
    fs.writeFileSync(filepath, fullContent);

    return `✓ Plan saved successfully

File: ${filename}
Path: ${filepath}

The plan includes:
- Title: ${title}
- Type: ${type}
- Tasks: ${tasks?.length || 0}

You can load this plan later with plan_load or view all plans with plan_list.`;
  },
});

export const list = tool({
  description: "List all saved plans in .spavn/plans/",
  args: {
    type: tool.schema
      .enum(["feature", "bugfix", "refactor", "architecture", "spike", "docs", "all"])
      .optional()
      .describe("Filter by plan type (default: all)"),
  },
  async execute(args, context) {
    const { type = "all" } = args;
    const plansPath = path.join(context.worktree, SPAVN_DIR, PLANS_DIR);

    if (!fs.existsSync(plansPath)) {
      return `No plans found. The .spavn/plans/ directory doesn't exist.

Use plan_save to create your first plan, or spavn_init to initialize the directory.`;
    }

    const files = fs
      .readdirSync(plansPath)
      .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
      .sort()
      .reverse();

    if (files.length === 0) {
      return "No plans found in .spavn/plans/";
    }

    let output = "📋 Saved Plans:\n\n";

    for (const file of files) {
      const filepath = path.join(plansPath, file);
      const content = fs.readFileSync(filepath, "utf-8");

      // Parse frontmatter
      let title = file;
      let planType = "unknown";
      let created = "";
      let status = "draft";

      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const fm = frontmatterMatch[1];
        const titleMatch = fm.match(/title:\s*"?([^"\n]+)"?/);
        const typeMatch = fm.match(/type:\s*(\w+)/);
        const createdMatch = fm.match(/created:\s*(\S+)/);
        const statusMatch = fm.match(/status:\s*(\w+)/);

        if (titleMatch) title = titleMatch[1];
        if (typeMatch) planType = typeMatch[1];
        if (createdMatch) created = createdMatch[1].split("T")[0];
        if (statusMatch) status = statusMatch[1];
      }

      // Filter by type if specified
      if (type !== "all" && planType !== type) {
        continue;
      }

      output += `• ${title}\n`;
      output += `  File: ${file}\n`;
      output += `  Type: ${planType} | Created: ${created} | Status: ${status}\n\n`;
    }

    return output.trim();
  },
});

export const load = tool({
  description: "Load a saved plan by filename",
  args: {
    filename: tool.schema.string().describe("Plan filename (e.g., '2024-02-22-feature-auth.md')"),
  },
  async execute(args, context) {
    const { filename } = args;
    const plansPath = path.join(context.worktree, SPAVN_DIR, PLANS_DIR);
    const filepath = path.resolve(plansPath, filename);
    const resolvedPlansDir = path.resolve(plansPath);

    // Prevent path traversal (../ or absolute paths)
    if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
      return `✗ Invalid plan filename: path traversal not allowed`;
    }

    if (!fs.existsSync(filepath)) {
      return `✗ Plan not found: ${filename}

Use plan_list to see available plans.`;
    }

    const content = fs.readFileSync(filepath, "utf-8");

    return `📋 Plan: ${filename}
${"=".repeat(50)}

${content}`;
  },
});

export const delete_ = tool({
  description: "Delete a saved plan",
  args: {
    filename: tool.schema.string().describe("Plan filename to delete"),
  },
  async execute(args, context) {
    const { filename } = args;
    const plansPath = path.join(context.worktree, SPAVN_DIR, PLANS_DIR);
    const filepath = path.resolve(plansPath, filename);
    const resolvedPlansDir = path.resolve(plansPath);

    // Prevent path traversal (../ or absolute paths)
    if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
      return `✗ Invalid plan filename: path traversal not allowed`;
    }

    if (!fs.existsSync(filepath)) {
      return `✗ Plan not found: ${filename}`;
    }

    fs.unlinkSync(filepath);

    return `✓ Deleted plan: ${filename}`;
  },
});

/**
 * Factory function that creates the plan_commit tool with access
 * to the OpenCode client for toast notifications.
 *
 * Stages .spavn/ artifacts and commits them on the current branch.
 * Writes a suggested branch name into the plan frontmatter for handoff.
 * Branch creation is deferred to the handoff step (worktree_create,
 * branch_create, or "continue in this session").
 */
export function createCommit(client: Client) {
  return tool({
    description:
      "Stage and commit .spavn/ plan artifacts on the current branch. " +
      "Writes a suggested branch name into frontmatter for handoff. " +
      "Does NOT create or switch branches.",
    args: {
      planFilename: tool.schema
        .string()
        .describe("Plan filename from .spavn/plans/ (e.g., '2026-02-26-feature-auth.md')"),
    },
    async execute(args, context) {
      const { planFilename } = args;
      const cwd = context.worktree;

      // ── 1. Validate: git repo ─────────────────────────────────
      try {
        await git(cwd, "rev-parse", "--git-dir");
      } catch {
        return "✗ Error: Not in a git repository. Initialize git first.";
      }

      // ── 2. Read and parse the plan ────────────────────────────
      const plansPath = path.join(cwd, SPAVN_DIR, PLANS_DIR);
      const filepath = path.resolve(plansPath, planFilename);
      const resolvedPlansDir = path.resolve(plansPath);

      // Prevent path traversal (../ or absolute paths)
      if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
        return `✗ Invalid plan filename: path traversal not allowed`;
      }

      if (!fs.existsSync(filepath)) {
        return `✗ Plan not found: ${planFilename}

Use plan_list to see available plans.`;
      }

      let planContent = fs.readFileSync(filepath, "utf-8");
      const fm = parseFrontmatter(planContent);

      if (!fm) {
        return `✗ Plan has no frontmatter: ${planFilename}

Expected YAML frontmatter with title and type fields.`;
      }

      const planTitle = fm.title || "untitled";
      const planType = fm.type || "feature";

      // ── 3. Compute suggested branch name (stored for handoff) ──
      const VALID_PREFIXES = Object.values(TYPE_TO_PREFIX);
      const rawPrefix = TYPE_TO_PREFIX[planType] || "feature";
      const prefix = VALID_PREFIXES.includes(rawPrefix) ? rawPrefix : "feature";
      const slug = slugify(planTitle);
      const suggestedBranch = `${prefix}/${slug}`;

      // Write suggested branch into frontmatter so handoff knows what to create
      planContent = upsertFrontmatterField(planContent, "branch", suggestedBranch);
      fs.writeFileSync(filepath, planContent);

      // ── 4. Get current branch for reporting ────────────────────
      let currentBranch = "";
      try {
        const { stdout } = await git(cwd, "branch", "--show-current");
        currentBranch = stdout.trim();
      } catch {
        currentBranch = "(detached)";
      }

      // ── 5. Stage .spavn/ directory ───────────────────────────
      try {
        await git(cwd, "add", path.join(cwd, SPAVN_DIR));
      } catch (stageErr: any) {
        return `✗ Error staging .spavn/ directory: ${stageErr.message || stageErr}`;
      }

      // ── 6. Commit ─────────────────────────────────────────────
      const commitMsg = `chore(plan): ${planTitle}`;
      let commitHash = "";

      try {
        // Check if there's anything staged
        const { stdout: statusOut } = await git(cwd, "status", "--porcelain");
        const stagedLines = statusOut
          .trim()
          .split("\n")
          .filter((l) => l && l[0] !== " " && l[0] !== "?");

        if (stagedLines.length === 0) {
          // Nothing to commit — plan already committed
          try {
            const { stdout: hashOut } = await git(cwd, "rev-parse", "--short", "HEAD");
            commitHash = hashOut.trim();
          } catch {
            commitHash = "(unknown)";
          }

          try {
            await client.tui.showToast({
              body: {
                title: `Plan: ${planFilename}`,
                message: "Already committed — no new changes",
                variant: "info",
                duration: 4000,
              },
            });
          } catch {
            // Toast failure is non-fatal
          }

          return `✓ Plan already committed

On: ${currentBranch} (no new changes)
Commit: ${commitHash}
Plan: ${planFilename}
Suggested branch: ${suggestedBranch}

Ready for handoff — branch will be created when you proceed to implementation.`;
        }

        await git(cwd, "commit", "-m", commitMsg);
        const { stdout: hashOut } = await git(cwd, "rev-parse", "--short", "HEAD");
        commitHash = hashOut.trim();
      } catch (commitErr: any) {
        try {
          await client.tui.showToast({
            body: {
              title: `Plan Commit`,
              message: `Commit failed: ${commitErr.message || commitErr}`,
              variant: "error",
              duration: 8000,
            },
          });
        } catch {
          // Toast failure is non-fatal
        }
        return `✗ Error committing: ${commitErr.message || commitErr}`;
      }

      // ── 7. Success notification ───────────────────────────────
      try {
        await client.tui.showToast({
          body: {
            title: `Plan Committed`,
            message: `${currentBranch} — ${commitHash}`,
            variant: "success",
            duration: 5000,
          },
        });
      } catch {
        // Toast failure is non-fatal
      }

      return `✓ Plan committed

On: ${currentBranch}
Commit: ${commitHash} — ${commitMsg}
Plan: ${planFilename}
Suggested branch: ${suggestedBranch}

The .spavn/ artifacts are committed. Branch creation happens during handoff.`;
    },
  });
}

// ─── Shared pure functions (used by both OpenCode tools and MCP server) ──────

/**
 * Create a plan skeleton with title, type, and optional GitHub issue ref.
 * Auto-inits .spavn/ if needed.
 */
export function executePlanStart(
  worktree: string,
  args: { title: string; type: string; issueRef?: number },
): string {
  const plansPath = ensureSpavnDir(worktree);

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

  if (!fs.existsSync(filepath)) {
    return `✗ Plan not found: ${args.planFilename}`;
  }

  const content = fs.readFileSync(filepath, "utf-8");

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

  if (!fs.existsSync(filepath)) {
    return `✗ Plan not found: ${args.planFilename}`;
  }

  let content = fs.readFileSync(filepath, "utf-8");

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

  if (!fs.existsSync(filepath)) {
    return `✗ Plan not found: ${args.filename}`;
  }

  // Read existing file to check for frontmatter
  const existing = fs.readFileSync(filepath, "utf-8");
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

// ─── OpenCode tool wrappers ──────────────────────────────────────────────────

export const start = tool({
  description:
    "Create a plan skeleton with title, type, and optional GitHub issue ref. Auto-inits .spavn/ if needed.",
  args: {
    title: tool.schema.string().describe("Plan title"),
    type: tool.schema
      .enum(["feature", "bugfix", "refactor", "architecture", "spike", "docs"])
      .describe("Plan type"),
    issueRef: tool.schema.number().optional().describe("GitHub issue number to reference"),
  },
  async execute(args, context) {
    return executePlanStart(context.worktree, args);
  },
});

export const interview = tool({
  description: "Append Q&A refinement to a draft plan",
  args: {
    planFilename: tool.schema.string().describe("Plan filename from .spavn/plans/"),
    question: tool.schema.string().describe("Refinement question"),
    answer: tool.schema.string().describe("Answer to the question"),
  },
  async execute(args, context) {
    return executePlanInterview(context.worktree, args);
  },
});

export const approve = tool({
  description: "Update plan status from draft to approved",
  args: {
    planFilename: tool.schema.string().describe("Plan filename from .spavn/plans/"),
  },
  async execute(args, context) {
    return executePlanApprove(context.worktree, args);
  },
});

export const edit = tool({
  description:
    "Edit a plan file: overwrite content while preserving/updating frontmatter updated timestamp",
  args: {
    filename: tool.schema.string().describe("Plan filename from .spavn/plans/"),
    content: tool.schema.string().describe("New plan content"),
  },
  async execute(args, context) {
    return executePlanEdit(context.worktree, args);
  },
});

// Export with underscore suffix to avoid reserved word
export { delete_ as delete };
