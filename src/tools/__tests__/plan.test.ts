import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseFrontmatter,
  upsertFrontmatterField,
  TYPE_TO_PREFIX,
} from "../../utils/plan-extract.js";

// We test the plan tool logic by importing the underlying functions
// Since the tools use @opencode-ai/plugin which may not be testable directly,
// we test the pure logic functions from plan-extract and exercise the fs operations

describe("plan CRUD operations", () => {
  let tmpDir: string;
  let plansDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-plan-"));
    plansDir = path.join(tmpDir, ".spavn", "plans");
    fs.mkdirSync(plansDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("saves and reads a plan file", () => {
    const filename = "2024-01-01-feature-test-plan.md";
    const content = `---
title: "Test Plan"
type: feature
created: 2024-01-01T00:00:00.000Z
status: draft
---

# Test Plan

## Summary

This is a test plan.

## Tasks

- [ ] Task 1
- [ ] Task 2
`;
    fs.writeFileSync(path.join(plansDir, filename), content);

    // Verify the file is readable
    const read = fs.readFileSync(path.join(plansDir, filename), "utf-8");
    expect(read).toBe(content);
    expect(read).toContain("Test Plan");
  });

  it("lists plan files sorted reverse chronologically", () => {
    fs.writeFileSync(path.join(plansDir, "2024-01-01-feature-old.md"), "old");
    fs.writeFileSync(path.join(plansDir, "2024-06-01-feature-new.md"), "new");
    fs.writeFileSync(path.join(plansDir, "2024-03-01-bugfix-mid.md"), "mid");

    const files = fs
      .readdirSync(plansDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();

    expect(files[0]).toBe("2024-06-01-feature-new.md");
    expect(files[1]).toBe("2024-03-01-bugfix-mid.md");
    expect(files[2]).toBe("2024-01-01-feature-old.md");
  });

  it("deletes a plan file", () => {
    const filename = "2024-01-01-feature-to-delete.md";
    const filepath = path.join(plansDir, filename);
    fs.writeFileSync(filepath, "to delete");

    expect(fs.existsSync(filepath)).toBe(true);
    fs.unlinkSync(filepath);
    expect(fs.existsSync(filepath)).toBe(false);
  });

  it("handles non-existent plan for load", () => {
    const filepath = path.join(plansDir, "nonexistent.md");
    expect(fs.existsSync(filepath)).toBe(false);
  });

  it("filters plans by type in filename", () => {
    fs.writeFileSync(path.join(plansDir, "2024-01-01-feature-auth.md"), "auth feature");
    fs.writeFileSync(path.join(plansDir, "2024-01-01-bugfix-login.md"), "login fix");
    fs.writeFileSync(path.join(plansDir, "2024-01-01-feature-api.md"), "api feature");

    const featurePlans = fs
      .readdirSync(plansDir)
      .filter((f) => f.endsWith(".md") && f.includes("feature"));

    expect(featurePlans).toHaveLength(2);
    expect(featurePlans.every((f) => f.includes("feature"))).toBe(true);
  });
});

// ── parseFrontmatter ─────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses title and type from frontmatter", () => {
    const content = `---
title: "Auth System"
type: feature
created: 2024-01-01T00:00:00.000Z
status: draft
---

# Auth System
`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.title).toBe("Auth System");
    expect(fm!.type).toBe("feature");
    expect(fm!.status).toBe("draft");
  });

  it("parses title without quotes", () => {
    const content = `---
title: My Plan
type: bugfix
---

# My Plan
`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.title).toBe("My Plan");
    expect(fm!.type).toBe("bugfix");
  });

  it("parses branch field", () => {
    const content = `---
title: "Auth"
type: feature
branch: feature/auth-system
---

# Auth
`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm!.branch).toBe("feature/auth-system");
  });

  it("returns null for content without frontmatter", () => {
    const content = `# Just a heading

Some content.
`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFrontmatter("")).toBeNull();
  });

  it("returns empty object for empty frontmatter", () => {
    const content = `---

---

# Content
`;
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(Object.keys(fm!)).toHaveLength(0);
  });
});

// ── upsertFrontmatterField ──────────────────────────────────────────────────

describe("upsertFrontmatterField", () => {
  it("inserts a new field into frontmatter", () => {
    const content = `---
title: "Auth System"
type: feature
status: draft
---

# Auth System
`;
    const updated = upsertFrontmatterField(content, "branch", "feature/auth-system");
    expect(updated).toContain("branch: feature/auth-system");
    expect(updated).toContain("title: \"Auth System\"");
    expect(updated).toContain("# Auth System");
  });

  it("updates an existing field", () => {
    const content = `---
title: "Auth System"
type: feature
branch: feature/old-branch
status: draft
---

# Auth System
`;
    const updated = upsertFrontmatterField(content, "branch", "feature/new-branch");
    expect(updated).toContain("branch: feature/new-branch");
    expect(updated).not.toContain("feature/old-branch");
  });

  it("preserves content after frontmatter", () => {
    const content = `---
title: "Plan"
type: feature
---

# Plan

## Summary

Some detailed content here.

## Tasks

- [ ] Task 1
`;
    const updated = upsertFrontmatterField(content, "branch", "feature/plan");
    expect(updated).toContain("branch: feature/plan");
    expect(updated).toContain("## Summary");
    expect(updated).toContain("Some detailed content here.");
    expect(updated).toContain("- [ ] Task 1");
  });

  it("returns content unchanged if no frontmatter present", () => {
    const content = "# Just content\n\nNo frontmatter here.";
    const updated = upsertFrontmatterField(content, "branch", "feature/xyz");
    expect(updated).toBe(content);
  });

  it("handles updating status field", () => {
    const content = `---
title: "Plan"
type: feature
status: draft
---

# Plan
`;
    const updated = upsertFrontmatterField(content, "status", "active");
    expect(updated).toContain("status: active");
    expect(updated).not.toContain("status: draft");
  });
});

// ── TYPE_TO_PREFIX mapping ──────────────────────────────────────────────────

describe("TYPE_TO_PREFIX", () => {
  it("maps feature to feature", () => {
    expect(TYPE_TO_PREFIX.feature).toBe("feature");
  });

  it("maps bugfix to bugfix", () => {
    expect(TYPE_TO_PREFIX.bugfix).toBe("bugfix");
  });

  it("maps refactor to refactor", () => {
    expect(TYPE_TO_PREFIX.refactor).toBe("refactor");
  });

  it("maps architecture to refactor", () => {
    expect(TYPE_TO_PREFIX.architecture).toBe("refactor");
  });

  it("maps spike to feature", () => {
    expect(TYPE_TO_PREFIX.spike).toBe("feature");
  });

  it("maps docs to docs", () => {
    expect(TYPE_TO_PREFIX.docs).toBe("docs");
  });

  it("returns undefined for unknown types", () => {
    expect(TYPE_TO_PREFIX.unknown).toBeUndefined();
  });
});
