import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the shell module ──────────────────────────────────────────────────
// Must be declared before importing modules that depend on shell.js

vi.mock("../shell.js", () => ({
  which: vi.fn(),
  gh: vi.fn(),
  git: vi.fn(),
}));

// Import after mock setup
import { which, gh, git } from "../shell.js";
import {
  checkGhAvailability,
  fetchIssues,
  fetchProjects,
  fetchProjectItems,
} from "../github.js";

const mockWhich = vi.mocked(which);
const mockGh = vi.mocked(gh);
const mockGit = vi.mocked(git);

// ─── checkGhAvailability ────────────────────────────────────────────────────

describe("checkGhAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns installed=false when gh is not in PATH", async () => {
    mockWhich.mockResolvedValue(null);

    const status = await checkGhAvailability("/tmp/test");

    expect(status.installed).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.hasRemote).toBe(false);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("returns authenticated=false when gh auth status fails", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockRejectedValue(new Error("not logged in"));

    const status = await checkGhAvailability("/tmp/test");

    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.hasRemote).toBe(false);
  });

  it("returns hasRemote=true with parsed owner/name for HTTPS remote", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mockGit.mockResolvedValue({
      stdout: "https://github.com/acme/cool-project.git\n",
      stderr: "",
      exitCode: 0,
    });

    const status = await checkGhAvailability("/tmp/test");

    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.hasRemote).toBe(true);
    expect(status.repoOwner).toBe("acme");
    expect(status.repoName).toBe("cool-project");
  });

  it("returns hasRemote=true with parsed owner/name for SSH remote", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mockGit.mockResolvedValue({
      stdout: "git@github.com:my-org/my-repo.git\n",
      stderr: "",
      exitCode: 0,
    });

    const status = await checkGhAvailability("/tmp/test");

    expect(status.hasRemote).toBe(true);
    expect(status.repoOwner).toBe("my-org");
    expect(status.repoName).toBe("my-repo");
  });

  it("returns hasRemote=false when git remote get-url fails", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mockGit.mockRejectedValue(new Error("fatal: No such remote 'origin'"));

    const status = await checkGhAvailability("/tmp/test");

    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.hasRemote).toBe(false);
    expect(status.repoOwner).toBeUndefined();
    expect(status.repoName).toBeUndefined();
  });

  it("returns hasRemote=false when remote URL is not a GitHub URL", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mockGit.mockResolvedValue({
      stdout: "https://gitlab.com/owner/repo.git\n",
      stderr: "",
      exitCode: 0,
    });

    const status = await checkGhAvailability("/tmp/test");

    expect(status.hasRemote).toBe(false);
  });

  it("returns full status when everything succeeds", async () => {
    mockWhich.mockResolvedValue("/usr/bin/gh");
    mockGh.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    mockGit.mockResolvedValue({
      stdout: "https://github.com/owner/repo.git\n",
      stderr: "",
      exitCode: 0,
    });

    const status = await checkGhAvailability("/tmp/test");

    expect(status).toEqual({
      installed: true,
      authenticated: true,
      hasRemote: true,
      repoOwner: "owner",
      repoName: "repo",
      projects: [],
    });
  });
});

// ─── fetchIssues ─────────────────────────────────────────────────────────────

describe("fetchIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes correct default args to gh CLI", async () => {
    mockGh.mockResolvedValue({ stdout: "[]", stderr: "", exitCode: 0 });

    await fetchIssues("/tmp/test");

    expect(mockGh).toHaveBeenCalledWith(
      "/tmp/test",
      "issue", "list",
      "--json", "number,title,state,labels,assignees,milestone,body,url,createdAt,updatedAt",
      "--limit", "20",
    );
  });

  it("passes state, labels, milestone, assignee filters", async () => {
    mockGh.mockResolvedValue({ stdout: "[]", stderr: "", exitCode: 0 });

    await fetchIssues("/tmp/test", {
      state: "closed",
      labels: "bug,urgent",
      milestone: "v1.0",
      assignee: "alice",
      limit: 50,
    });

    const callArgs = mockGh.mock.calls[0];
    expect(callArgs).toContain("--state");
    expect(callArgs).toContain("closed");
    expect(callArgs).toContain("--label");
    expect(callArgs).toContain("bug,urgent");
    expect(callArgs).toContain("--milestone");
    expect(callArgs).toContain("v1.0");
    expect(callArgs).toContain("--assignee");
    expect(callArgs).toContain("alice");
    expect(callArgs).toContain("50");
  });

  it("maps label objects to label name strings", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify([
        {
          number: 1,
          title: "Bug",
          state: "open",
          labels: [{ name: "bug" }, { name: "priority:high" }],
          assignees: [],
          milestone: null,
          body: "",
          url: "https://github.com/o/r/issues/1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const issues = await fetchIssues("/tmp/test");

    expect(issues[0].labels).toEqual(["bug", "priority:high"]);
  });

  it("maps assignee objects to login strings", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify([
        {
          number: 1,
          title: "Task",
          state: "open",
          labels: [],
          assignees: [{ login: "alice" }, { login: "bob" }],
          milestone: null,
          body: "",
          url: "",
          createdAt: "",
          updatedAt: "",
        },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const issues = await fetchIssues("/tmp/test");

    expect(issues[0].assignees).toEqual(["alice", "bob"]);
  });

  it("handles empty result set", async () => {
    mockGh.mockResolvedValue({ stdout: "[]", stderr: "", exitCode: 0 });

    const issues = await fetchIssues("/tmp/test");

    expect(issues).toEqual([]);
  });

  it("extracts milestone title from nested object", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify([
        {
          number: 1,
          title: "Task",
          labels: [],
          assignees: [],
          milestone: { title: "Sprint 5" },
          body: "",
          url: "",
          createdAt: "",
          updatedAt: "",
        },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const issues = await fetchIssues("/tmp/test");

    expect(issues[0].milestone).toBe("Sprint 5");
  });

  it("propagates gh CLI errors", async () => {
    mockGh.mockRejectedValue(new Error("gh: command failed"));

    await expect(fetchIssues("/tmp/test")).rejects.toThrow("gh: command failed");
  });
});

// ─── fetchProjects ───────────────────────────────────────────────────────────

describe("fetchProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses projects from { projects: [...] } wrapper", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        projects: [
          { id: "PVT_1", number: 1, title: "Roadmap" },
          { id: "PVT_2", number: 2, title: "Sprint Board" },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const projects = await fetchProjects("/tmp/test", "acme");

    expect(projects).toEqual([
      { id: "PVT_1", number: 1, title: "Roadmap" },
      { id: "PVT_2", number: 2, title: "Sprint Board" },
    ]);
  });

  it("handles raw array response (no wrapper)", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify([
        { id: "PVT_1", number: 1, title: "Board" },
      ]),
      stderr: "",
      exitCode: 0,
    });

    const projects = await fetchProjects("/tmp/test", "acme");

    expect(projects).toEqual([{ id: "PVT_1", number: 1, title: "Board" }]);
  });

  it("passes correct args to gh CLI", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({ projects: [] }),
      stderr: "",
      exitCode: 0,
    });

    await fetchProjects("/tmp/test", "my-org");

    expect(mockGh).toHaveBeenCalledWith(
      "/tmp/test",
      "project", "list",
      "--owner", "my-org",
      "--format", "json",
    );
  });

  it("returns empty array for non-auth errors", async () => {
    mockGh.mockRejectedValue(new Error("network timeout"));

    const projects = await fetchProjects("/tmp/test", "acme");

    expect(projects).toEqual([]);
  });

  it("re-throws auth errors (401)", async () => {
    mockGh.mockRejectedValue(new Error("HTTP 401: Bad credentials"));

    await expect(fetchProjects("/tmp/test", "acme")).rejects.toThrow(
      "GitHub authentication error",
    );
  });

  it("re-throws auth errors (403)", async () => {
    mockGh.mockRejectedValue(new Error("HTTP 403: Resource not accessible"));

    await expect(fetchProjects("/tmp/test", "acme")).rejects.toThrow(
      "GitHub authentication error",
    );
  });

  it("re-throws errors mentioning 'auth'", async () => {
    mockGh.mockRejectedValue(new Error("auth token expired"));

    await expect(fetchProjects("/tmp/test", "acme")).rejects.toThrow(
      "GitHub authentication error",
    );
  });

  it("provides defaults for missing fields", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({ projects: [{}] }),
      stderr: "",
      exitCode: 0,
    });

    const projects = await fetchProjects("/tmp/test", "acme");

    expect(projects[0]).toEqual({ id: "", number: 0, title: "Untitled" });
  });
});

// ─── fetchProjectItems ───────────────────────────────────────────────────────

describe("fetchProjectItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses items from gh response", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            id: "PVTI_1",
            title: "Fix auth",
            type: "ISSUE",
            status: "In Progress",
            assignees: [{ login: "alice" }],
            labels: [{ name: "bug" }],
            content: { number: 42, url: "https://github.com/o/r/issues/42", body: "Fix it" },
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "PVTI_1",
      title: "Fix auth",
      type: "ISSUE",
      status: "In Progress",
      assignees: ["alice"],
      labels: ["bug"],
      issueNumber: 42,
      url: "https://github.com/o/r/issues/42",
      body: "Fix it",
    });
  });

  it("passes correct args to gh CLI", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({ items: [] }),
      stderr: "",
      exitCode: 0,
    });

    await fetchProjectItems("/tmp/test", "my-org", 5, { limit: 50 });

    expect(mockGh).toHaveBeenCalledWith(
      "/tmp/test",
      "project", "item-list", "5",
      "--owner", "my-org",
      "--format", "json",
      "--limit", "50",
    );
  });

  it("normalizes PULL_REQUEST type", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          { id: "1", title: "PR", type: "PullRequest", assignees: [], labels: [], content: {} },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1);

    expect(items[0].type).toBe("PULL_REQUEST");
  });

  it("normalizes DRAFT_ISSUE type", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          { id: "1", title: "Draft", type: "DraftIssue", assignees: [], labels: [], content: {} },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1);

    expect(items[0].type).toBe("DRAFT_ISSUE");
  });

  it("defaults unknown type to ISSUE", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          { id: "1", title: "Unknown", type: "something_else", assignees: [], labels: [], content: {} },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1);

    expect(items[0].type).toBe("ISSUE");
  });

  it("filters items by status client-side", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          { id: "1", title: "Done task", type: "ISSUE", status: "Done", assignees: [], labels: [], content: {} },
          { id: "2", title: "Todo task", type: "ISSUE", status: "Todo", assignees: [], labels: [], content: {} },
          { id: "3", title: "In progress", type: "ISSUE", status: "In Progress", assignees: [], labels: [], content: {} },
        ],
      }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1, { status: "todo" });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Todo task");
  });

  it("handles empty items array", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({ items: [] }),
      stderr: "",
      exitCode: 0,
    });

    const items = await fetchProjectItems("/tmp/test", "acme", 1);

    expect(items).toEqual([]);
  });

  it("uses default limit of 30 when not specified", async () => {
    mockGh.mockResolvedValue({
      stdout: JSON.stringify({ items: [] }),
      stderr: "",
      exitCode: 0,
    });

    await fetchProjectItems("/tmp/test", "acme", 1);

    expect(mockGh).toHaveBeenCalledWith(
      "/tmp/test",
      "project", "item-list", "1",
      "--owner", "acme",
      "--format", "json",
      "--limit", "30",
    );
  });
});
