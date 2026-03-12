import { gh, which, git } from "./shell.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  hasRemote: boolean;
  repoOwner?: string;
  repoName?: string;
  projects: { id: string; number: number; title: string }[];
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubProjectItem {
  id: string;
  title: string;
  type: "ISSUE" | "PULL_REQUEST" | "DRAFT_ISSUE";
  status?: string;
  assignees: string[];
  labels: string[];
  issueNumber?: number;
  url?: string;
  body?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum character length for issue body in list views to avoid overwhelming context. */
const BODY_TRUNCATE_LENGTH = 200;

/** Maximum character length for issue body in detail views (plan formatting). */
const BODY_DETAIL_LENGTH = 2000;

// ─── GitHub CLI Availability ─────────────────────────────────────────────────

/**
 * Check full GitHub CLI availability and repo context.
 * Returns a status object with installation, authentication, and repo info.
 */
export async function checkGhAvailability(cwd: string): Promise<GhStatus> {
  const status: GhStatus = {
    installed: false,
    authenticated: false,
    hasRemote: false,
    projects: [],
  };

  // 1. Check if gh is installed
  const ghPath = await which("gh");
  if (!ghPath) return status;
  status.installed = true;

  // 2. Check if authenticated
  try {
    await gh(cwd, "auth", "status");
    status.authenticated = true;
  } catch {
    return status;
  }

  // 3. Extract repo owner/name from remote
  try {
    const { stdout } = await git(cwd, "remote", "get-url", "origin");
    const parsed = parseRepoUrl(stdout.trim());
    if (parsed) {
      status.hasRemote = true;
      status.repoOwner = parsed.owner;
      status.repoName = parsed.name;
    }
  } catch {
    // No remote configured — hasRemote stays false
  }

  return status;
}

/**
 * Parse a git remote URL to extract owner and repo name.
 * Handles HTTPS, SSH, and GitHub CLI formats.
 * Supports both github.com and GitHub Enterprise Server URLs (e.g., github.mycompany.com).
 *
 * The regex requires "github" to appear at a hostname boundary (after `//` or `@`)
 * to prevent false positives like "notgithub.com" or "fakegithub.evil.com".
 */
export function parseRepoUrl(url: string): { owner: string; name: string } | null {
  // HTTPS: https://github.com/owner/repo.git  OR  https://github.mycompany.com/owner/repo.git
  // The `//` anchor ensures "github" is at the start of the hostname, not mid-word.
  const httpsMatch = url.match(/\/\/github[^/]*\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git  OR  git@github.mycompany.com:owner/repo.git
  // The `git@` prefix already anchors to the hostname start.
  const sshMatch = url.match(/git@github[^:]*:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  return null;
}

// ─── Issue Formatting ────────────────────────────────────────────────────────

/**
 * Truncate a string to the given length, appending "..." if truncated.
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen).trimEnd() + "...";
}

/**
 * Format a single GitHub issue into a compact list entry.
 * Used when presenting multiple issues for selection.
 */
export function formatIssueListEntry(issue: GitHubIssue): string {
  const labels = issue.labels.length > 0 ? ` [${issue.labels.join(", ")}]` : "";
  const assignees = issue.assignees.length > 0 ? ` → ${issue.assignees.join(", ")}` : "";
  const body = issue.body ? `\n   ${truncate(issue.body.replace(/\n/g, " "), BODY_TRUNCATE_LENGTH)}` : "";

  return `#${issue.number}: ${issue.title}${labels}${assignees}${body}`;
}

/**
 * Format multiple issues into a numbered selection list.
 */
export function formatIssueList(issues: GitHubIssue[]): string {
  if (issues.length === 0) return "No issues found.";

  return issues.map((issue) => formatIssueListEntry(issue)).join("\n\n");
}

/**
 * Format a GitHub issue into a planning-friendly markdown block.
 * Used by the architect agent to seed plan content from selected issues.
 */
export function formatIssueForPlan(issue: GitHubIssue): string {
  const parts: string[] = [];

  parts.push(`### Issue #${issue.number}: ${issue.title}`);
  parts.push("");

  if (issue.labels.length > 0) {
    parts.push(`**Labels:** ${issue.labels.join(", ")}`);
  }
  if (issue.assignees.length > 0) {
    parts.push(`**Assignees:** ${issue.assignees.join(", ")}`);
  }
  if (issue.milestone) {
    parts.push(`**Milestone:** ${issue.milestone}`);
  }
  parts.push(`**URL:** ${issue.url}`);
  parts.push("");

  if (issue.body) {
    parts.push("**Description:**");
    parts.push("");
    parts.push(truncate(issue.body, BODY_DETAIL_LENGTH));
  }

  return parts.join("\n");
}

// ─── Project Item Formatting ─────────────────────────────────────────────────

/**
 * Format a single GitHub Project item into a compact list entry.
 */
export function formatProjectItemEntry(item: GitHubProjectItem): string {
  const status = item.status ? ` (${item.status})` : "";
  const type = item.type === "DRAFT_ISSUE" ? " [Draft]" : item.type === "PULL_REQUEST" ? " [PR]" : "";
  const labels = item.labels.length > 0 ? ` [${item.labels.join(", ")}]` : "";
  const assignees = item.assignees.length > 0 ? ` → ${item.assignees.join(", ")}` : "";
  const ref = item.issueNumber ? `#${item.issueNumber}: ` : "";

  return `${ref}${item.title}${type}${status}${labels}${assignees}`;
}

/**
 * Format multiple project items into a list.
 */
export function formatProjectItemList(items: GitHubProjectItem[]): string {
  if (items.length === 0) return "No project items found.";

  return items.map((item) => formatProjectItemEntry(item)).join("\n");
}

// ─── GitHub CLI Data Fetching ────────────────────────────────────────────────

/**
 * Fetch GitHub projects associated with the repo owner.
 */
export async function fetchProjects(
  cwd: string,
  owner: string,
): Promise<{ id: string; number: number; title: string }[]> {
  try {
    const { stdout } = await gh(
      cwd,
      "project", "list",
      "--owner", owner,
      "--format", "json",
    );

    const parsed = JSON.parse(stdout);
    // gh project list --format json returns { projects: [...] }
    const projects: any[] = parsed.projects ?? parsed ?? [];

    return projects.map((p: any) => ({
      id: String(p.id ?? ""),
      number: Number(p.number ?? 0),
      title: String(p.title ?? "Untitled"),
    }));
  } catch (error: any) {
    // Surface auth errors — these are actionable for the user.
    // Other errors (no projects, API format changes) are non-critical.
    const msg = error?.message ?? String(error);
    if (msg.includes("auth") || msg.includes("401") || msg.includes("403")) {
      throw new Error(`GitHub authentication error while fetching projects: ${msg}`);
    }
    return [];
  }
}

/**
 * Fetch issues from the current repository using gh CLI.
 */
export async function fetchIssues(
  cwd: string,
  options: {
    state?: string;
    labels?: string;
    milestone?: string;
    assignee?: string;
    limit?: number;
  } = {},
): Promise<GitHubIssue[]> {
  const args = [
    "issue", "list",
    "--json", "number,title,state,labels,assignees,milestone,body,url,createdAt,updatedAt",
    "--limit", String(options.limit ?? 20),
  ];

  if (options.state) args.push("--state", options.state);
  if (options.labels) args.push("--label", options.labels);
  if (options.milestone) args.push("--milestone", options.milestone);
  if (options.assignee) args.push("--assignee", options.assignee);

  const { stdout } = await gh(cwd, ...args);
  const raw: any[] = JSON.parse(stdout);

  return raw.map((item: any) => ({
    number: item.number,
    title: item.title ?? "",
    state: item.state ?? "open",
    labels: (item.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name ?? "")),
    assignees: (item.assignees ?? []).map((a: any) => (typeof a === "string" ? a : a.login ?? "")),
    milestone: item.milestone?.title ?? undefined,
    body: item.body ?? "",
    url: item.url ?? "",
    createdAt: item.createdAt ?? "",
    updatedAt: item.updatedAt ?? "",
  }));
}

/**
 * Fetch project items from a specific GitHub Project.
 */
export async function fetchProjectItems(
  cwd: string,
  owner: string,
  projectNumber: number,
  options: { status?: string; limit?: number } = {},
): Promise<GitHubProjectItem[]> {
  const { stdout } = await gh(
    cwd,
    "project", "item-list", String(projectNumber),
    "--owner", owner,
    "--format", "json",
    "--limit", String(options.limit ?? 30),
  );

  const parsed = JSON.parse(stdout);
  // gh project item-list --format json returns { items: [...] }
  const raw: any[] = parsed.items ?? parsed ?? [];

  const items: GitHubProjectItem[] = raw.map((item: any) => ({
    id: String(item.id ?? ""),
    title: item.title ?? "",
    type: normalizeItemType(item.type),
    status: item.status ?? undefined,
    assignees: Array.isArray(item.assignees)
      ? item.assignees.map((a: any) => (typeof a === "string" ? a : a.login ?? ""))
      : [],
    labels: Array.isArray(item.labels)
      ? item.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? ""))
      : [],
    issueNumber: item.content?.number ?? undefined,
    url: item.content?.url ?? undefined,
    body: item.content?.body ?? undefined,
  }));

  // Apply status filter client-side if provided
  if (options.status) {
    const filterStatus = options.status.toLowerCase();
    return items.filter((item) =>
      item.status?.toLowerCase().includes(filterStatus),
    );
  }

  return items;
}

/**
 * Normalize the item type string from GitHub's API into our union type.
 */
function normalizeItemType(type: unknown): "ISSUE" | "PULL_REQUEST" | "DRAFT_ISSUE" {
  const t = String(type ?? "").toUpperCase();
  if (t.includes("PULL") || t === "PULL_REQUEST") return "PULL_REQUEST";
  if (t.includes("DRAFT") || t === "DRAFT_ISSUE") return "DRAFT_ISSUE";
  return "ISSUE";
}
