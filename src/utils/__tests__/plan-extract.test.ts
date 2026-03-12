import { describe, it, expect } from "vitest";
import {
  extractPlanSections,
  extractIssueRefs,
  extractBranch,
  buildPrBodyFromPlan,
  findPlanContent,
} from "../plan-extract.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("extractPlanSections", () => {
  it("extracts title from frontmatter", () => {
    const content = `---
title: "Auth System"
type: feature
---

# Auth System

## Summary

Implement authentication.

## Tasks

- [ ] Add login
- [ ] Add logout
`;
    const sections = extractPlanSections(content, "test.md");
    expect(sections.title).toBe("Auth System");
    expect(sections.summary).toContain("Implement authentication");
    expect(sections.tasks).toContain("Add login");
  });

  it("extracts title from heading when no frontmatter title", () => {
    const content = `# My Plan

## Summary

A summary here.
`;
    const sections = extractPlanSections(content, "test.md");
    expect(sections.title).toBe("My Plan");
    expect(sections.summary).toContain("A summary here");
  });

  it("extracts key decisions section", () => {
    const content = `# Plan

## Key Decisions

- Use JWT for auth
- Use PostgreSQL
`;
    const sections = extractPlanSections(content, "test.md");
    expect(sections.decisions).toContain("Use JWT");
    expect(sections.decisions).toContain("PostgreSQL");
  });

  it("handles empty plan", () => {
    const sections = extractPlanSections("", "empty.md");
    expect(sections.title).toBe("");
    expect(sections.summary).toBe("");
    expect(sections.tasks).toBe("");
    expect(sections.decisions).toBe("");
    expect(sections.filename).toBe("empty.md");
  });

  it("handles plan with no sections", () => {
    const content = "Just some text with no headings.";
    const sections = extractPlanSections(content, "no-sections.md");
    expect(sections.title).toBe("");
    expect(sections.summary).toBe("");
  });
});

describe("extractIssueRefs", () => {
  it("extracts multiple issue numbers from frontmatter", () => {
    const content = `---
title: "Auth System"
type: feature
issues: [42, 51]
---

# Auth System
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([42, 51]);
  });

  it("extracts a single issue number", () => {
    const content = `---
title: "Fix Bug"
issues: [42]
---

# Fix Bug
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([42]);
  });

  it("returns empty array when no issues field in frontmatter", () => {
    const content = `---
title: "No Issues"
type: feature
---

# No Issues
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([]);
  });

  it("returns empty array when no frontmatter at all", () => {
    const content = `# Just a Plan

Some content without frontmatter.
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([]);
  });

  it("returns empty array for empty issues array", () => {
    const content = `---
title: "Empty Issues"
issues: []
---

# Empty Issues
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([]);
  });

  it("filters out invalid (non-positive) numbers", () => {
    const content = `---
title: "Mixed"
issues: [42, -1, 0, abc, 51]
---

# Mixed
`;
    const refs = extractIssueRefs(content);
    // -1 and 0 are filtered (not > 0), "abc" becomes NaN and is filtered
    expect(refs).toEqual([42, 51]);
  });

  it("handles issues with extra whitespace", () => {
    const content = `---
title: "Spaced"
issues: [ 42 , 51 , 99 ]
---

# Spaced
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([42, 51, 99]);
  });

  it("returns empty array for empty string", () => {
    expect(extractIssueRefs("")).toEqual([]);
  });

  it("ignores issues field outside frontmatter", () => {
    const content = `---
title: "Plan"
---

issues: [42, 51]

Some content.
`;
    const refs = extractIssueRefs(content);
    expect(refs).toEqual([]);
  });
});

describe("buildPrBodyFromPlan", () => {
  it("builds PR body with all sections", () => {
    const body = buildPrBodyFromPlan({
      title: "Auth",
      summary: "Add auth system",
      tasks: "- [ ] Login\n- [ ] Logout",
      decisions: "- Use JWT",
      filename: "plan.md",
    });
    expect(body).toContain("## Summary");
    expect(body).toContain("Add auth system");
    expect(body).toContain("## Tasks");
    expect(body).toContain("## Key Decisions");
    expect(body).toContain("plan.md");
  });

  it("returns fallback when no sections present", () => {
    const body = buildPrBodyFromPlan({
      title: "",
      summary: "",
      tasks: "",
      decisions: "",
      filename: "empty.md",
    });
    expect(body).toContain("empty.md");
    expect(body).not.toContain("## Summary");
  });

  it("omits missing sections", () => {
    const body = buildPrBodyFromPlan({
      title: "Test",
      summary: "Only a summary",
      tasks: "",
      decisions: "",
      filename: "test.md",
    });
    expect(body).toContain("## Summary");
    expect(body).not.toContain("## Tasks");
    expect(body).not.toContain("## Key Decisions");
  });
});

describe("findPlanContent", () => {
  it("returns null when plans dir does not exist", () => {
    const result = findPlanContent("/nonexistent/path");
    expect(result).toBeNull();
  });

  it("reads a specific plan file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, "test-plan.md"), "# Test Plan\n\nContent here.");

    const result = findPlanContent(tmpDir, "test-plan.md");
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("test-plan.md");
    expect(result!.content).toContain("Test Plan");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns null for missing specific plan", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const result = findPlanContent(tmpDir, "nonexistent.md");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("finds most recent plan when no filename given", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(path.join(plansDir, "2024-01-01-feature-old.md"), "Old plan");
    fs.writeFileSync(path.join(plansDir, "2024-02-01-feature-new.md"), "New plan");

    const result = findPlanContent(tmpDir);
    expect(result).not.toBeNull();
    // Most recent (sorted reverse) should be the "new" one
    expect(result!.filename).toBe("2024-02-01-feature-new.md");

    fs.rmSync(tmpDir, { recursive: true });
  });

  // ── Path Traversal Protection ──────────────────────────────────────────

  it("rejects path traversal via ../", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    // Create a file outside the plans dir that should not be accessible
    fs.writeFileSync(path.join(tmpDir, ".spavn", "secret.md"), "sensitive data");

    const result = findPlanContent(tmpDir, "../secret.md");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects absolute path traversal", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const result = findPlanContent(tmpDir, "/etc/passwd");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects nested traversal (../../)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    // Try to escape two levels up
    const result = findPlanContent(tmpDir, "../../package.json");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects dot as filename (directory reference)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const result = findPlanContent(tmpDir, ".");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("rejects empty string as filename", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-test-"));
    const plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });

    const result = findPlanContent(tmpDir, "");
    expect(result).toBeNull();

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("extractBranch", () => {
  it("extracts branch from frontmatter", () => {
    const content = `---
title: "Auth System"
type: feature
branch: feature/auth-system
status: draft
---

# Auth System
`;
    expect(extractBranch(content)).toBe("feature/auth-system");
  });

  it("extracts branch with bugfix prefix", () => {
    const content = `---
title: "Fix Login"
type: bugfix
branch: bugfix/fix-login
---

# Fix Login
`;
    expect(extractBranch(content)).toBe("bugfix/fix-login");
  });

  it("extracts branch with refactor prefix", () => {
    const content = `---
title: "Refactor DB"
type: architecture
branch: refactor/refactor-db
---

# Refactor DB
`;
    expect(extractBranch(content)).toBe("refactor/refactor-db");
  });

  it("returns null when no branch field in frontmatter", () => {
    const content = `---
title: "No Branch"
type: feature
status: draft
---

# No Branch
`;
    expect(extractBranch(content)).toBeNull();
  });

  it("returns null when no frontmatter at all", () => {
    const content = `# Just a Plan

Some content without frontmatter.
`;
    expect(extractBranch(content)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBranch("")).toBeNull();
  });

  it("returns null for empty branch value", () => {
    const content = `---
title: "Empty Branch"
type: feature
branch:
---

# Empty Branch
`;
    expect(extractBranch(content)).toBeNull();
  });

  it("handles branch with extra whitespace", () => {
    const content = `---
title: "Spaced"
type: feature
branch:   feature/spaced-branch  
---

# Spaced
`;
    expect(extractBranch(content)).toBe("feature/spaced-branch");
  });

  it("ignores branch field outside frontmatter", () => {
    const content = `---
title: "Plan"
type: feature
---

branch: feature/fake-branch

Some content.
`;
    expect(extractBranch(content)).toBeNull();
  });

  it("handles branch field as first field", () => {
    const content = `---
branch: feature/first
title: "First"
type: feature
---

# First
`;
    expect(extractBranch(content)).toBe("feature/first");
  });

  it("handles branch field as last field", () => {
    const content = `---
title: "Last"
type: feature
status: draft
branch: feature/last
---

# Last
`;
    expect(extractBranch(content)).toBe("feature/last");
  });
});
