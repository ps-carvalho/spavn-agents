import { describe, it, expect } from "vitest";
import {
  parseRepoUrl,
  truncate,
  formatIssueListEntry,
  formatIssueList,
  formatIssueForPlan,
  formatProjectItemEntry,
  formatProjectItemList,
  type GitHubIssue,
  type GitHubProjectItem,
} from "../github.js";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: "Fix login bug",
    state: "open",
    labels: ["bug", "priority:high"],
    assignees: ["alice", "bob"],
    milestone: "v1.0",
    body: "The login form crashes when submitting empty credentials.",
    url: "https://github.com/owner/repo/issues/42",
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-01-16T12:00:00Z",
    ...overrides,
  };
}

function makeProjectItem(overrides: Partial<GitHubProjectItem> = {}): GitHubProjectItem {
  return {
    id: "PVTI_abc123",
    title: "Implement auth",
    type: "ISSUE",
    status: "In Progress",
    assignees: ["alice"],
    labels: ["feature"],
    issueNumber: 42,
    url: "https://github.com/owner/repo/issues/42",
    body: "Implement the auth system",
    ...overrides,
  };
}

// ─── parseRepoUrl ────────────────────────────────────────────────────────────

describe("parseRepoUrl", () => {
  describe("HTTPS URLs", () => {
    it("should parse standard HTTPS URL", () => {
      const result = parseRepoUrl("https://github.com/owner/repo");
      expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("should parse HTTPS URL with .git suffix", () => {
      const result = parseRepoUrl("https://github.com/owner/repo.git");
      expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("should parse HTTPS URL with org-style owner", () => {
      const result = parseRepoUrl("https://github.com/my-org/my-repo");
      expect(result).toEqual({ owner: "my-org", name: "my-repo" });
    });

    it("should handle URL with trailing .git suffix correctly", () => {
      const result = parseRepoUrl("https://github.com/acme-corp/cool-project.git");
      expect(result).toEqual({ owner: "acme-corp", name: "cool-project" });
    });
  });

  describe("SSH URLs", () => {
    it("should parse standard SSH URL", () => {
      const result = parseRepoUrl("git@github.com:owner/repo.git");
      expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("should parse SSH URL without .git suffix", () => {
      const result = parseRepoUrl("git@github.com:owner/repo");
      expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("should parse SSH URL with hyphenated names", () => {
      const result = parseRepoUrl("git@github.com:my-org/my-repo.git");
      expect(result).toEqual({ owner: "my-org", name: "my-repo" });
    });
  });

  describe("GitHub Enterprise URLs", () => {
    it("should parse GitHub Enterprise HTTPS URL", () => {
      const result = parseRepoUrl("https://github.mycompany.com/org/repo");
      expect(result).toEqual({ owner: "org", name: "repo" });
    });

    it("should parse GitHub Enterprise HTTPS URL with .git", () => {
      const result = parseRepoUrl("https://github.mycompany.com/org/repo.git");
      expect(result).toEqual({ owner: "org", name: "repo" });
    });

    it("should parse GitHub Enterprise SSH URL", () => {
      const result = parseRepoUrl("git@github.enterprise.com:org/repo.git");
      expect(result).toEqual({ owner: "org", name: "repo" });
    });

    it("should parse GitHub Enterprise SSH URL without .git", () => {
      const result = parseRepoUrl("git@github.internal.example.com:team/project");
      expect(result).toEqual({ owner: "team", name: "project" });
    });
  });

  describe("false positive rejection", () => {
    it("should return null for notgithub.com (hostname must start with 'github')", () => {
      expect(parseRepoUrl("https://notgithub.com/owner/repo")).toBeNull();
    });

    it("should return null for fakegithub.evil.com", () => {
      expect(parseRepoUrl("https://fakegithub.evil.com/owner/repo")).toBeNull();
    });

    it("should return null for mygithub.com", () => {
      expect(parseRepoUrl("https://mygithub.com/owner/repo")).toBeNull();
    });
  });

  describe("invalid URLs", () => {
    it("should return null for empty string", () => {
      expect(parseRepoUrl("")).toBeNull();
    });

    it("should return null for non-GitHub URL", () => {
      expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
    });

    it("should return null for malformed URL", () => {
      expect(parseRepoUrl("not-a-url")).toBeNull();
    });

    it("should return null for URL with only owner (no repo)", () => {
      expect(parseRepoUrl("https://github.com/owner")).toBeNull();
    });

    it("should return null for plain github.com", () => {
      expect(parseRepoUrl("https://github.com")).toBeNull();
    });
  });
});

// ─── truncate ────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("should return the string unchanged when shorter than maxLen", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should return the string unchanged when exactly maxLen", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("should truncate and add ellipsis when over maxLen", () => {
    const result = truncate("hello world", 5);
    expect(result).toBe("hello...");
    expect(result.length).toBe(8); // 5 chars + "..."
  });

  it("should return empty string for empty input", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("should return empty string for falsy input", () => {
    // @ts-expect-error — testing runtime behavior with undefined
    expect(truncate(undefined, 10)).toBe("");
    // @ts-expect-error — testing runtime behavior with null
    expect(truncate(null, 10)).toBe("");
  });

  it("should trim trailing whitespace before adding ellipsis", () => {
    // "hello " is 6 chars, truncated to 6 should be "hello " (no truncation)
    // "hello world" truncated to 6 should be "hello..." (trimEnd removes trailing space from "hello ")
    const result = truncate("hello world", 6);
    expect(result).toBe("hello...");
  });

  it("should handle maxLen of 1", () => {
    const result = truncate("hello", 1);
    expect(result).toBe("h...");
  });
});

// ─── formatIssueListEntry ────────────────────────────────────────────────────

describe("formatIssueListEntry", () => {
  it("should format issue with all fields", () => {
    const issue = makeIssue();
    const result = formatIssueListEntry(issue);

    expect(result).toContain("#42:");
    expect(result).toContain("Fix login bug");
    expect(result).toContain("[bug, priority:high]");
    expect(result).toContain("alice, bob");
    expect(result).toContain("login form crashes");
  });

  it("should format issue with no labels", () => {
    const issue = makeIssue({ labels: [] });
    const result = formatIssueListEntry(issue);

    expect(result).toContain("#42: Fix login bug");
    expect(result).not.toContain("[");
    expect(result).toContain("alice, bob");
  });

  it("should format issue with no assignees", () => {
    const issue = makeIssue({ assignees: [] });
    const result = formatIssueListEntry(issue);

    expect(result).toContain("#42: Fix login bug");
    expect(result).not.toContain("\u2192"); // → arrow
  });

  it("should format issue with no body", () => {
    const issue = makeIssue({ body: "" });
    const result = formatIssueListEntry(issue);

    expect(result).toContain("#42: Fix login bug");
    // Should be a single line (no body line)
    expect(result.split("\n")).toHaveLength(1);
  });

  it("should format issue with minimal fields", () => {
    const issue = makeIssue({
      labels: [],
      assignees: [],
      body: "",
      milestone: undefined,
    });
    const result = formatIssueListEntry(issue);

    expect(result).toBe("#42: Fix login bug");
  });

  it("should truncate long body text", () => {
    const longBody = "A".repeat(300);
    const issue = makeIssue({ body: longBody });
    const result = formatIssueListEntry(issue);

    // Body should be truncated to 200 chars + "..."
    expect(result).toContain("...");
    // The body portion should not contain the full 300 chars
    expect(result.length).toBeLessThan(300 + 50); // some overhead for prefix
  });

  it("should replace newlines in body with spaces", () => {
    const issue = makeIssue({ body: "line one\nline two\nline three" });
    const result = formatIssueListEntry(issue);

    // The body line should have spaces instead of newlines
    const bodyLine = result.split("\n")[1]; // second line is the body
    expect(bodyLine).toContain("line one line two line three");
  });
});

// ─── formatIssueList ─────────────────────────────────────────────────────────

describe("formatIssueList", () => {
  it("should return 'No issues found.' for empty list", () => {
    expect(formatIssueList([])).toBe("No issues found.");
  });

  it("should format a single issue", () => {
    const issues = [makeIssue()];
    const result = formatIssueList(issues);

    expect(result).toContain("#42:");
    expect(result).toContain("Fix login bug");
  });

  it("should separate multiple issues with double newlines", () => {
    const issues = [
      makeIssue({ number: 1, title: "First issue" }),
      makeIssue({ number: 2, title: "Second issue" }),
      makeIssue({ number: 3, title: "Third issue" }),
    ];
    const result = formatIssueList(issues);

    expect(result).toContain("#1: First issue");
    expect(result).toContain("#2: Second issue");
    expect(result).toContain("#3: Third issue");
    // Issues are separated by double newlines
    const segments = result.split("\n\n");
    expect(segments.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── formatIssueForPlan ──────────────────────────────────────────────────────

describe("formatIssueForPlan", () => {
  it("should format full issue with all metadata", () => {
    const issue = makeIssue();
    const result = formatIssueForPlan(issue);

    expect(result).toContain("### Issue #42: Fix login bug");
    expect(result).toContain("**Labels:** bug, priority:high");
    expect(result).toContain("**Assignees:** alice, bob");
    expect(result).toContain("**Milestone:** v1.0");
    expect(result).toContain("**URL:** https://github.com/owner/repo/issues/42");
    expect(result).toContain("**Description:**");
    expect(result).toContain("login form crashes");
  });

  it("should omit labels line when no labels", () => {
    const issue = makeIssue({ labels: [] });
    const result = formatIssueForPlan(issue);

    expect(result).not.toContain("**Labels:**");
  });

  it("should omit assignees line when no assignees", () => {
    const issue = makeIssue({ assignees: [] });
    const result = formatIssueForPlan(issue);

    expect(result).not.toContain("**Assignees:**");
  });

  it("should omit milestone line when no milestone", () => {
    const issue = makeIssue({ milestone: undefined });
    const result = formatIssueForPlan(issue);

    expect(result).not.toContain("**Milestone:**");
  });

  it("should omit description section when no body", () => {
    const issue = makeIssue({ body: "" });
    const result = formatIssueForPlan(issue);

    expect(result).not.toContain("**Description:**");
  });

  it("should truncate very long body to 2000 chars", () => {
    const longBody = "X".repeat(3000);
    const issue = makeIssue({ body: longBody });
    const result = formatIssueForPlan(issue);

    expect(result).toContain("**Description:**");
    expect(result).toContain("...");
    // The body portion should be truncated
    expect(result.length).toBeLessThan(3000 + 200); // overhead for headers
  });

  it("should always include URL", () => {
    const issue = makeIssue({
      labels: [],
      assignees: [],
      milestone: undefined,
      body: "",
    });
    const result = formatIssueForPlan(issue);

    expect(result).toContain("**URL:**");
  });
});

// ─── formatProjectItemEntry ──────────────────────────────────────────────────

describe("formatProjectItemEntry", () => {
  it("should format ISSUE type with all fields", () => {
    const item = makeProjectItem();
    const result = formatProjectItemEntry(item);

    expect(result).toContain("#42:");
    expect(result).toContain("Implement auth");
    expect(result).toContain("(In Progress)");
    expect(result).toContain("[feature]");
    expect(result).toContain("alice");
    // ISSUE type should not have a type tag
    expect(result).not.toContain("[PR]");
    expect(result).not.toContain("[Draft]");
  });

  it("should format PULL_REQUEST type with [PR] tag", () => {
    const item = makeProjectItem({ type: "PULL_REQUEST" });
    const result = formatProjectItemEntry(item);

    expect(result).toContain("[PR]");
  });

  it("should format DRAFT_ISSUE type with [Draft] tag", () => {
    const item = makeProjectItem({ type: "DRAFT_ISSUE" });
    const result = formatProjectItemEntry(item);

    expect(result).toContain("[Draft]");
  });

  it("should omit status when not provided", () => {
    const item = makeProjectItem({ status: undefined });
    const result = formatProjectItemEntry(item);

    expect(result).not.toContain("(");
    expect(result).not.toContain(")");
  });

  it("should omit issue number prefix when not provided", () => {
    const item = makeProjectItem({ issueNumber: undefined });
    const result = formatProjectItemEntry(item);

    expect(result).not.toContain("#");
    expect(result).toMatch(/^Implement auth/);
  });

  it("should omit labels when empty", () => {
    const item = makeProjectItem({ labels: [] });
    const result = formatProjectItemEntry(item);

    expect(result).not.toContain("[feature]");
  });

  it("should omit assignees when empty", () => {
    const item = makeProjectItem({ assignees: [] });
    const result = formatProjectItemEntry(item);

    expect(result).not.toContain("\u2192"); // → arrow
  });

  it("should format minimal item (no optional fields)", () => {
    const item = makeProjectItem({
      status: undefined,
      assignees: [],
      labels: [],
      issueNumber: undefined,
      url: undefined,
      body: undefined,
    });
    const result = formatProjectItemEntry(item);

    expect(result).toBe("Implement auth");
  });
});

// ─── formatProjectItemList ───────────────────────────────────────────────────

describe("formatProjectItemList", () => {
  it("should return 'No project items found.' for empty list", () => {
    expect(formatProjectItemList([])).toBe("No project items found.");
  });

  it("should format multiple items separated by newlines", () => {
    const items = [
      makeProjectItem({ issueNumber: 1, title: "First" }),
      makeProjectItem({ issueNumber: 2, title: "Second", type: "PULL_REQUEST" }),
      makeProjectItem({ issueNumber: undefined, title: "Draft idea", type: "DRAFT_ISSUE" }),
    ];
    const result = formatProjectItemList(items);

    expect(result).toContain("#1: First");
    expect(result).toContain("#2: Second");
    expect(result).toContain("[PR]");
    expect(result).toContain("Draft idea");
    expect(result).toContain("[Draft]");

    // Items separated by single newlines
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
  });
});
