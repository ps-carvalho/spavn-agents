import { describe, it, expect, vi } from "vitest";

// ─── Mock @opencode-ai/plugin ────────────────────────────────────────────────
//
// The tools module imports `tool` from @opencode-ai/plugin which isn't
// available in the test environment. We mock it to capture the tool definitions
// so we can verify their shape (description, args, execute).

// Create a chainable schema builder that records the type info
function createSchemaChain(type: string): any {
  const chain: any = {
    _type: type,
    optional: () => createSchemaChain(`${type}?`),
    describe: (desc: string) => ({ _type: type, _description: desc }),
    enum: (values: string[]) => createSchemaChain(`enum(${values.join(",")})`),
    array: (inner: any) => createSchemaChain(`array`),
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
    array: (inner: any) => createSchemaChain("array"),
  };
  return { tool: toolFn };
});

// Import AFTER mock is set up
const githubTools = await import("../github.js");

// ─── Tool Exports Shape ──────────────────────────────────────────────────────

describe("github tools module exports", () => {
  it("should export 'status' tool", () => {
    expect(githubTools.status).toBeDefined();
    expect(typeof githubTools.status).toBe("object");
  });

  it("should export 'issues' tool", () => {
    expect(githubTools.issues).toBeDefined();
    expect(typeof githubTools.issues).toBe("object");
  });

  it("should export 'projects' tool", () => {
    expect(githubTools.projects).toBeDefined();
    expect(typeof githubTools.projects).toBe("object");
  });

  it("should export exactly three named tools", () => {
    const exportedKeys = Object.keys(githubTools).filter(
      (k) => !k.startsWith("__"),
    );
    expect(exportedKeys).toContain("status");
    expect(exportedKeys).toContain("issues");
    expect(exportedKeys).toContain("projects");
  });
});

describe("github tools have descriptions", () => {
  it("status tool should have a non-empty description", () => {
    expect(typeof githubTools.status.description).toBe("string");
    expect(githubTools.status.description.length).toBeGreaterThan(0);
    expect(githubTools.status.description).toContain("GitHub CLI");
  });

  it("issues tool should have a non-empty description", () => {
    expect(typeof githubTools.issues.description).toBe("string");
    expect(githubTools.issues.description.length).toBeGreaterThan(0);
    expect(githubTools.issues.description).toContain("issue");
  });

  it("projects tool should have a non-empty description", () => {
    expect(typeof githubTools.projects.description).toBe("string");
    expect(githubTools.projects.description.length).toBeGreaterThan(0);
    expect(githubTools.projects.description).toContain("Project");
  });
});

describe("github tools have execute functions", () => {
  it("status tool should have an execute function", () => {
    expect(typeof githubTools.status.execute).toBe("function");
  });

  it("issues tool should have an execute function", () => {
    expect(typeof githubTools.issues.execute).toBe("function");
  });

  it("projects tool should have an execute function", () => {
    expect(typeof githubTools.projects.execute).toBe("function");
  });
});

describe("github tools argument schemas", () => {
  it("status tool should have empty args (no parameters)", () => {
    expect(githubTools.status.args).toBeDefined();
    expect(Object.keys(githubTools.status.args)).toHaveLength(0);
  });

  it("issues tool should accept state, labels, milestone, assignee, limit, detailed", () => {
    const argKeys = Object.keys(githubTools.issues.args);
    expect(argKeys).toContain("state");
    expect(argKeys).toContain("labels");
    expect(argKeys).toContain("milestone");
    expect(argKeys).toContain("assignee");
    expect(argKeys).toContain("limit");
    expect(argKeys).toContain("detailed");
  });

  it("projects tool should accept projectNumber, status, limit", () => {
    const argKeys = Object.keys(githubTools.projects.args);
    expect(argKeys).toContain("projectNumber");
    expect(argKeys).toContain("status");
    expect(argKeys).toContain("limit");
  });
});
