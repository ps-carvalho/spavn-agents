import {
  checkGhAvailability,
  fetchIssues,
  fetchProjects,
  fetchProjectItems,
  formatIssueList,
  formatIssueForPlan,
  formatProjectItemList,
  type GhStatus,
} from "../../utils/github.js";
import { success, failure, type HandlerResult } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validate GitHub CLI availability and return status.
 * Returns a formatted error string if not available, or the status object.
 */
async function requireGh(cwd: string): Promise<{ ok: true; status: GhStatus } | { ok: false; error: string }> {
  const status = await checkGhAvailability(cwd);

  if (!status.installed) {
    return {
      ok: false,
      error: "✗ GitHub CLI (gh) is not installed.\n\nInstall it from https://cli.github.com/ and run `gh auth login`.",
    };
  }

  if (!status.authenticated) {
    return {
      ok: false,
      error: "✗ GitHub CLI is not authenticated.\n\nRun `gh auth login` to authenticate.",
    };
  }

  return { ok: true, status };
}

/**
 * Check GitHub CLI availability and authentication.
 */
export async function executeStatus(worktree: string): Promise<HandlerResult> {
  const status = await checkGhAvailability(worktree);

  const lines: string[] = [];

  // Installation
  lines.push(status.installed ? "✓ GitHub CLI installed" : "✗ GitHub CLI not installed");
  if (!status.installed) {
    lines.push("  Install from https://cli.github.com/");
    return success(lines.join("\n"));
  }

  // Authentication
  lines.push(status.authenticated ? "✓ Authenticated" : "✗ Not authenticated");
  if (!status.authenticated) {
    lines.push("  Run: gh auth login");
    return success(lines.join("\n"));
  }

  // Remote
  if (status.hasRemote && status.repoOwner && status.repoName) {
    lines.push(`✓ Repository: ${status.repoOwner}/${status.repoName}`);

    // Fetch projects
    const projects = await fetchProjects(worktree, status.repoOwner);
    status.projects = projects;

    if (projects.length > 0) {
      lines.push("");
      lines.push(`GitHub Projects (${projects.length}):`);
      for (const p of projects) {
        lines.push(`  #${p.number}: ${p.title}`);
      }
    } else {
      lines.push("  No GitHub Projects found for this repository owner.");
    }
  } else {
    lines.push("✗ No GitHub remote (origin) configured");
    lines.push("  Add one with: git remote add origin <url>");
  }

  return success(lines.join("\n"));
}

/**
 * List GitHub issues for the current repository, filterable by state, labels, milestone, and assignee.
 */
export async function executeIssues(
  worktree: string,
  args: { state?: string; labels?: string; milestone?: string; assignee?: string; limit?: number; detailed?: boolean },
): Promise<HandlerResult> {
  const check = await requireGh(worktree);
  if (!check.ok) return success(check.error);

  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

  try {
    const issueList = await fetchIssues(worktree, {
      state: args.state ?? "open",
      labels: args.labels,
      milestone: args.milestone,
      assignee: args.assignee,
      limit,
    });

    if (issueList.length === 0) {
      const filters: string[] = [];
      if (args.state) filters.push(`state: ${args.state}`);
      if (args.labels) filters.push(`labels: ${args.labels}`);
      if (args.milestone) filters.push(`milestone: ${args.milestone}`);
      if (args.assignee) filters.push(`assignee: ${args.assignee}`);
      const filterStr = filters.length > 0 ? ` (filters: ${filters.join(", ")})` : "";
      return success(`No issues found${filterStr}.`);
    }

    const header = `Found ${issueList.length} issue(s):\n\n`;

    if (args.detailed) {
      // Full detail mode for plan seeding
      const formatted = issueList.map((issue) => formatIssueForPlan(issue)).join("\n\n---\n\n");
      return success(header + formatted);
    }

    // Compact list mode for selection
    return success(header + formatIssueList(issueList));
  } catch (error: any) {
    return success(`✗ Error fetching issues: ${error.message || error}`);
  }
}

/**
 * List GitHub Project boards and their work items.
 */
export async function executeProjects(
  worktree: string,
  args: { projectNumber?: number; status?: string; limit?: number },
): Promise<HandlerResult> {
  const check = await requireGh(worktree);
  if (!check.ok) return success(check.error);

  const { status: ghStatus } = check;

  if (!ghStatus.hasRemote || !ghStatus.repoOwner) {
    return success("✗ No GitHub remote (origin) configured. Cannot fetch projects.");
  }

  const owner = ghStatus.repoOwner;

  try {
    // If no project number specified, list all projects
    if (args.projectNumber === undefined) {
      const projectList = await fetchProjects(worktree, owner);

      if (projectList.length === 0) {
        return success(`No GitHub Projects found for ${owner}.`);
      }

      const lines = [`GitHub Projects for ${owner} (${projectList.length}):\n`];
      for (const p of projectList) {
        lines.push(`  #${p.number}: ${p.title}`);
      }
      lines.push("");
      lines.push("Use github_projects with a projectNumber to list items from a specific project.");
      return success(lines.join("\n"));
    }

    // Fetch items from a specific project (cap limit for safety)
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
    const items = await fetchProjectItems(
      worktree,
      owner,
      args.projectNumber,
      {
        status: args.status,
        limit,
      },
    );

    if (items.length === 0) {
      const statusFilter = args.status ? ` with status "${args.status}"` : "";
      return success(`No items found in project #${args.projectNumber}${statusFilter}.`);
    }

    const statusFilter = args.status ? ` (status: ${args.status})` : "";
    const header = `Project #${args.projectNumber} — ${items.length} item(s)${statusFilter}:\n\n`;

    return success(header + formatProjectItemList(items));
  } catch (error: any) {
    return success(`✗ Error fetching projects: ${error.message || error}`);
  }
}
