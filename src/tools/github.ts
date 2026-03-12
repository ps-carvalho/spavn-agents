import { tool } from "@opencode-ai/plugin";
import {
  checkGhAvailability,
  fetchIssues,
  fetchProjects,
  fetchProjectItems,
  formatIssueList,
  formatIssueForPlan,
  formatProjectItemList,
  type GhStatus,
} from "../utils/github.js";

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

// ─── Tool: github_status ─────────────────────────────────────────────────────

export const status = tool({
  description:
    "Check GitHub CLI availability, authentication, and detect GitHub Projects for the current repository. " +
    "Use this first to verify the repo is connected before listing issues or projects.",
  args: {},
  async execute(_args, context) {
    const status = await checkGhAvailability(context.worktree);

    const lines: string[] = [];

    // Installation
    lines.push(status.installed ? "✓ GitHub CLI installed" : "✗ GitHub CLI not installed");
    if (!status.installed) {
      lines.push("  Install from https://cli.github.com/");
      return lines.join("\n");
    }

    // Authentication
    lines.push(status.authenticated ? "✓ Authenticated" : "✗ Not authenticated");
    if (!status.authenticated) {
      lines.push("  Run: gh auth login");
      return lines.join("\n");
    }

    // Remote
    if (status.hasRemote && status.repoOwner && status.repoName) {
      lines.push(`✓ Repository: ${status.repoOwner}/${status.repoName}`);

      // Fetch projects
      const projects = await fetchProjects(context.worktree, status.repoOwner);
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

    return lines.join("\n");
  },
});

// ─── Tool: github_issues ─────────────────────────────────────────────────────

export const issues = tool({
  description:
    "List GitHub issues for the current repository, filterable by state, labels, milestone, and assignee. " +
    "Returns a formatted list suitable for selecting issues to plan. " +
    "Set `detailed` to true to get full issue descriptions for plan seeding.",
  args: {
    state: tool.schema
      .enum(["open", "closed", "all"])
      .optional()
      .describe("Filter by issue state (default: open)"),
    labels: tool.schema
      .string()
      .optional()
      .describe("Filter by labels (comma-separated, e.g., 'bug,priority:high')"),
    milestone: tool.schema
      .string()
      .optional()
      .describe("Filter by milestone name"),
    assignee: tool.schema
      .string()
      .optional()
      .describe("Filter by assignee username"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of issues to return (default: 20, max: 100)"),
    detailed: tool.schema
      .boolean()
      .optional()
      .describe("If true, return full issue details formatted for plan seeding (default: false)"),
  },
  async execute(args, context) {
    const check = await requireGh(context.worktree);
    if (!check.ok) return check.error;

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    try {
      const issueList = await fetchIssues(context.worktree, {
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
        return `No issues found${filterStr}.`;
      }

      const header = `Found ${issueList.length} issue(s):\n\n`;

      if (args.detailed) {
        // Full detail mode for plan seeding
        const formatted = issueList.map((issue) => formatIssueForPlan(issue)).join("\n\n---\n\n");
        return header + formatted;
      }

      // Compact list mode for selection
      return header + formatIssueList(issueList);
    } catch (error: any) {
      return `✗ Error fetching issues: ${error.message || error}`;
    }
  },
});

// ─── Tool: github_projects ───────────────────────────────────────────────────

export const projects = tool({
  description:
    "List GitHub Project boards and their work items for the current repository. " +
    "Without a projectNumber, lists all projects. " +
    "With a projectNumber, lists items from that specific project board.",
  args: {
    projectNumber: tool.schema
      .number()
      .optional()
      .describe("Specific project number to list items from (omit to list all projects)"),
    status: tool.schema
      .string()
      .optional()
      .describe("Filter project items by status column (e.g., 'Todo', 'In Progress')"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of items to return (default: 30)"),
  },
  async execute(args, context) {
    const check = await requireGh(context.worktree);
    if (!check.ok) return check.error;

    const { status: ghStatus } = check;

    if (!ghStatus.hasRemote || !ghStatus.repoOwner) {
      return "✗ No GitHub remote (origin) configured. Cannot fetch projects.";
    }

    const owner = ghStatus.repoOwner;

    try {
      // If no project number specified, list all projects
      if (args.projectNumber === undefined) {
        const projectList = await fetchProjects(context.worktree, owner);

        if (projectList.length === 0) {
          return `No GitHub Projects found for ${owner}.`;
        }

        const lines = [`GitHub Projects for ${owner} (${projectList.length}):\n`];
        for (const p of projectList) {
          lines.push(`  #${p.number}: ${p.title}`);
        }
        lines.push("");
        lines.push("Use github_projects with a projectNumber to list items from a specific project.");
        return lines.join("\n");
      }

      // Fetch items from a specific project (cap limit for safety)
      const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
      const items = await fetchProjectItems(
        context.worktree,
        owner,
        args.projectNumber,
        {
          status: args.status,
          limit,
        },
      );

      if (items.length === 0) {
        const statusFilter = args.status ? ` with status "${args.status}"` : "";
        return `No items found in project #${args.projectNumber}${statusFilter}.`;
      }

      const statusFilter = args.status ? ` (status: ${args.status})` : "";
      const header = `Project #${args.projectNumber} — ${items.length} item(s)${statusFilter}:\n\n`;

      return header + formatProjectItemList(items);
    } catch (error: any) {
      return `✗ Error fetching projects: ${error.message || error}`;
    }
  },
});
