import { tool } from "@opencode-ai/plugin";
import * as githubHandlers from "./handlers/github.js";

// ─── Tool: github_status ─────────────────────────────────────────────────────

export const status = tool({
  description:
    "Check GitHub CLI availability, authentication, and detect GitHub Projects for the current repository. " +
    "Use this first to verify the repo is connected before listing issues or projects.",
  args: {},
  async execute(_args, context) {
    const result = await githubHandlers.executeStatus(context.worktree);
    return result.text;
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
    const result = await githubHandlers.executeIssues(context.worktree, {
      state: args.state,
      labels: args.labels,
      milestone: args.milestone,
      assignee: args.assignee,
      limit: args.limit,
      detailed: args.detailed,
    });
    return result.text;
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
    const result = await githubHandlers.executeProjects(context.worktree, {
      projectNumber: args.projectNumber,
      status: args.status,
      limit: args.limit,
    });
    return result.text;
  },
});
