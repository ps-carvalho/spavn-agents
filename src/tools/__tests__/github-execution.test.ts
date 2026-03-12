import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GhStatus, GitHubIssue, GitHubProjectItem } from "../../utils/github.js";

// ─── Mock @opencode-ai/plugin ────────────────────────────────────────────────
// The tool() call is a passthrough that returns the definition as-is,
// so we can call execute() directly in tests.

function createSchemaChain(type: string): any {
  const chain: any = {
    _type: type,
    optional: () => createSchemaChain(`${type}?`),
    describe: () => ({ _type: type }),
    enum: (values: string[]) => createSchemaChain(`enum(${values.join(",")})`),
    array: () => createSchemaChain("array"),
  };
  return chain;
}

vi.mock("@opencode-ai/plugin", () => {
  const toolFn: any = (definition: any) => definition;
  toolFn.schema = {
    string: () => createSchemaChain("string"),
    number: () => createSchemaChain("number"),
    boolean: () => createSchemaChain("boolean"),
    enum: (values: string[]) => createSchemaChain(`enum(${values.join(",")})`),
    array: () => createSchemaChain("array"),
  };
  return { tool: toolFn };
});

// ─── Mock utils/github.js ────────────────────────────────────────────────────

vi.mock("../../utils/github.js", () => ({
  checkGhAvailability: vi.fn(),
  fetchIssues: vi.fn(),
  fetchProjects: vi.fn(),
  fetchProjectItems: vi.fn(),
  formatIssueList: vi.fn(),
  formatIssueForPlan: vi.fn(),
  formatProjectItemList: vi.fn(),
  // Re-export the GhStatus type placeholder (not needed at runtime for mocks)
}));

// Import after mocks
const {
  checkGhAvailability,
  fetchIssues,
  fetchProjects,
  fetchProjectItems,
  formatIssueList,
  formatIssueForPlan,
  formatProjectItemList,
} = await import("../../utils/github.js");
const githubTools = await import("../github.js");

const mockCheckGh = vi.mocked(checkGhAvailability);
const mockFetchIssues = vi.mocked(fetchIssues);
const mockFetchProjects = vi.mocked(fetchProjects);
const mockFetchProjectItems = vi.mocked(fetchProjectItems);
const mockFormatIssueList = vi.mocked(formatIssueList);
const mockFormatIssueForPlan = vi.mocked(formatIssueForPlan);
const mockFormatProjectItemList = vi.mocked(formatProjectItemList);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockContext = { worktree: "/tmp/test" } as any;

function ghStatus(overrides: Partial<GhStatus> = {}): GhStatus {
  return {
    installed: true,
    authenticated: true,
    hasRemote: true,
    repoOwner: "acme",
    repoName: "repo",
    projects: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: "Fix login bug",
    state: "open",
    labels: ["bug"],
    assignees: ["alice"],
    milestone: "v1.0",
    body: "The login form crashes.",
    url: "https://github.com/acme/repo/issues/42",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-16T12:00:00Z",
    ...overrides,
  };
}

// ─── github_status execution ─────────────────────────────────────────────────

describe("github_status execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error message when gh not installed", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ installed: false, authenticated: false, hasRemote: false }));

    const result = await githubTools.status.execute({}, mockContext);

    expect(result).toContain("✗ GitHub CLI not installed");
    expect(result).toContain("cli.github.com");
  });

  it("returns error message when gh not authenticated", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ authenticated: false, hasRemote: false }));

    const result = await githubTools.status.execute({}, mockContext);

    expect(result).toContain("✗ Not authenticated");
    expect(result).toContain("gh auth login");
  });

  it("returns status with project list when fully connected", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjects.mockResolvedValue([
      { id: "PVT_1", number: 1, title: "Roadmap" },
    ]);

    const result = await githubTools.status.execute({}, mockContext);

    expect(result).toContain("✓ GitHub CLI installed");
    expect(result).toContain("✓ Authenticated");
    expect(result).toContain("✓ Repository: acme/repo");
    expect(result).toContain("#1: Roadmap");
  });

  it("reports missing remote with instructions", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ hasRemote: false, repoOwner: undefined, repoName: undefined }));

    const result = await githubTools.status.execute({}, mockContext);

    expect(result).toContain("✗ No GitHub remote");
    expect(result).toContain("git remote add origin");
  });

  it("reports 'no projects' when project list is empty", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjects.mockResolvedValue([]);

    const result = await githubTools.status.execute({}, mockContext);

    expect(result).toContain("✓ Repository: acme/repo");
    expect(result).toContain("No GitHub Projects found");
  });
});

// ─── github_issues execution ─────────────────────────────────────────────────

describe("github_issues execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when gh not available", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ installed: false, authenticated: false }));

    const result = await githubTools.issues.execute({}, mockContext);

    expect(result).toContain("✗ GitHub CLI (gh) is not installed");
  });

  it("returns error when gh not authenticated", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ authenticated: false }));

    const result = await githubTools.issues.execute({}, mockContext);

    expect(result).toContain("✗ GitHub CLI is not authenticated");
  });

  it("returns formatted issue list in compact mode", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    const issues = [makeIssue()];
    mockFetchIssues.mockResolvedValue(issues);
    mockFormatIssueList.mockReturnValue("#42: Fix login bug [bug] → alice");

    const result = await githubTools.issues.execute({}, mockContext);

    expect(result).toContain("Found 1 issue(s)");
    expect(result).toContain("#42: Fix login bug");
    expect(mockFormatIssueList).toHaveBeenCalledWith(issues);
  });

  it("returns detailed format when detailed=true", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    const issues = [makeIssue()];
    mockFetchIssues.mockResolvedValue(issues);
    mockFormatIssueForPlan.mockReturnValue("### Issue #42: Fix login bug\n\n**Labels:** bug");

    const result = await githubTools.issues.execute({ detailed: true }, mockContext);

    expect(result).toContain("Found 1 issue(s)");
    expect(result).toContain("### Issue #42");
    expect(mockFormatIssueForPlan).toHaveBeenCalledWith(issues[0]);
  });

  it("returns 'no issues found' with filter info", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchIssues.mockResolvedValue([]);

    const result = await githubTools.issues.execute(
      { state: "closed", labels: "bug" },
      mockContext,
    );

    expect(result).toContain("No issues found");
    expect(result).toContain("state: closed");
    expect(result).toContain("labels: bug");
  });

  it("caps limit at 100", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchIssues.mockResolvedValue([]);

    await githubTools.issues.execute({ limit: 999 }, mockContext);

    // fetchIssues should have been called with limit: 100
    expect(mockFetchIssues).toHaveBeenCalledWith(
      "/tmp/test",
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("enforces minimum limit of 1", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchIssues.mockResolvedValue([]);

    await githubTools.issues.execute({ limit: -5 }, mockContext);

    expect(mockFetchIssues).toHaveBeenCalledWith(
      "/tmp/test",
      expect.objectContaining({ limit: 1 }),
    );
  });

  it("handles fetch errors gracefully", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchIssues.mockRejectedValue(new Error("network error"));

    const result = await githubTools.issues.execute({}, mockContext);

    expect(result).toContain("✗ Error fetching issues");
    expect(result).toContain("network error");
  });
});

// ─── github_projects execution ───────────────────────────────────────────────

describe("github_projects execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when gh not available", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ installed: false, authenticated: false }));

    const result = await githubTools.projects.execute({}, mockContext);

    expect(result).toContain("✗ GitHub CLI (gh) is not installed");
  });

  it("returns error when no remote configured", async () => {
    mockCheckGh.mockResolvedValue(ghStatus({ hasRemote: false, repoOwner: undefined }));

    const result = await githubTools.projects.execute({}, mockContext);

    expect(result).toContain("✗ No GitHub remote");
  });

  it("lists all projects when no projectNumber given", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjects.mockResolvedValue([
      { id: "PVT_1", number: 1, title: "Roadmap" },
      { id: "PVT_2", number: 2, title: "Sprint Board" },
    ]);

    const result = await githubTools.projects.execute({}, mockContext);

    expect(result).toContain("GitHub Projects for acme (2)");
    expect(result).toContain("#1: Roadmap");
    expect(result).toContain("#2: Sprint Board");
    expect(result).toContain("github_projects with a projectNumber");
  });

  it("returns message when no projects exist", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjects.mockResolvedValue([]);

    const result = await githubTools.projects.execute({}, mockContext);

    expect(result).toContain("No GitHub Projects found");
  });

  it("lists project items with projectNumber", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    const items: GitHubProjectItem[] = [
      {
        id: "PVTI_1",
        title: "Fix auth",
        type: "ISSUE",
        status: "Todo",
        assignees: ["alice"],
        labels: ["bug"],
        issueNumber: 42,
      },
    ];
    mockFetchProjectItems.mockResolvedValue(items);
    mockFormatProjectItemList.mockReturnValue("#42: Fix auth (Todo) [bug] → alice");

    const result = await githubTools.projects.execute({ projectNumber: 1 }, mockContext);

    expect(result).toContain("Project #1");
    expect(result).toContain("1 item(s)");
    expect(result).toContain("#42: Fix auth");
  });

  it("shows status filter in header when provided", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjectItems.mockResolvedValue([
      {
        id: "1",
        title: "Task",
        type: "ISSUE" as const,
        status: "Todo",
        assignees: [],
        labels: [],
      },
    ]);
    mockFormatProjectItemList.mockReturnValue("Task (Todo)");

    const result = await githubTools.projects.execute(
      { projectNumber: 1, status: "Todo" },
      mockContext,
    );

    expect(result).toContain("status: Todo");
  });

  it("returns message when no items found", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjectItems.mockResolvedValue([]);

    const result = await githubTools.projects.execute(
      { projectNumber: 3, status: "Done" },
      mockContext,
    );

    expect(result).toContain("No items found in project #3");
    expect(result).toContain('status "Done"');
  });

  it("caps limit at 100", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjectItems.mockResolvedValue([]);

    await githubTools.projects.execute({ projectNumber: 1, limit: 500 }, mockContext);

    expect(mockFetchProjectItems).toHaveBeenCalledWith(
      "/tmp/test",
      "acme",
      1,
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("handles fetch errors gracefully", async () => {
    mockCheckGh.mockResolvedValue(ghStatus());
    mockFetchProjectItems.mockRejectedValue(new Error("API error"));

    const result = await githubTools.projects.execute({ projectNumber: 1 }, mockContext);

    expect(result).toContain("✗ Error fetching projects");
    expect(result).toContain("API error");
  });
});
