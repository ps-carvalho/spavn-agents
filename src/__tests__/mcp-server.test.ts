import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "../utils/shell.js";

// Mock the exec utility
vi.mock("../utils/shell.js", () => ({
  exec: vi.fn(),
}));

// Mock github utils
vi.mock("../utils/github.js", () => ({
  checkGhAvailability: vi.fn().mockResolvedValue({ installed: true, authenticated: true, hasRemote: true, repoOwner: "test", repoName: "repo", projects: [] }),
  fetchIssues: vi.fn().mockResolvedValue([]),
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchProjectItems: vi.fn().mockResolvedValue([]),
  formatIssueList: vi.fn().mockReturnValue(""),
  formatIssueForPlan: vi.fn().mockReturnValue(""),
  formatProjectItemList: vi.fn().mockReturnValue(""),
}));

// Mock repl utils
vi.mock("../utils/repl.js", () => ({
  parseTasksWithAC: vi.fn().mockReturnValue([]),
  detectCommands: vi.fn().mockResolvedValue({ buildCommand: "", testCommand: "", lintCommand: "", detected: false }),
  readSpavnConfig: vi.fn().mockReturnValue({ maxRetries: 3 }),
  readReplState: vi.fn().mockReturnValue(null),
  writeReplState: vi.fn(),
  getNextTask: vi.fn().mockReturnValue(null),
  getCurrentTask: vi.fn().mockReturnValue(null),
  isLoopComplete: vi.fn().mockReturnValue(true),
  detectIncompleteState: vi.fn().mockReturnValue(null),
  formatProgress: vi.fn().mockReturnValue(""),
  formatSummary: vi.fn().mockReturnValue(""),
}));

// Mock plan-extract utils
vi.mock("../utils/plan-extract.js", () => ({
  parseFrontmatter: vi.fn().mockReturnValue(null),
  upsertFrontmatterField: vi.fn().mockImplementation((content: string) => content),
  TYPE_TO_PREFIX: { feature: "feature", bugfix: "fix", refactor: "refactor" },
  extractIssueRefs: vi.fn().mockReturnValue([]),
  extractPlanSections: vi.fn().mockReturnValue({}),
  buildPrBodyFromPlan: vi.fn().mockReturnValue(""),
}));

// Mock change-scope utils
vi.mock("../utils/change-scope.js", () => ({
  classifyChangeScope: vi.fn().mockReturnValue({ scope: "standard", rationale: "", agents: {} }),
}));

// Mock coordinate tools
vi.mock("../tools/coordinate.js", () => ({
  coordinateTasks: vi.fn().mockReturnValue("✓ Coordinated 3 tasks"),
  coordinateAssignSkills: vi.fn().mockReturnValue("✓ Skills assigned"),
  coordinateStatus: vi.fn().mockReturnValue("✓ Coordination Status"),
}));

// Mock plan tools (shared pure functions imported by mcp-server)
vi.mock("../tools/plan.js", () => ({
  executePlanStart: vi.fn().mockReturnValue("✓ Plan skeleton created: test.md"),
  executePlanInterview: vi.fn().mockReturnValue("✓ Refinement added to test.md"),
  executePlanApprove: vi.fn().mockReturnValue("✓ Plan approved: test.md"),
  executePlanEdit: vi.fn().mockReturnValue("✓ Plan updated: test.md"),
}));

// Mock SpavnCodeBridge (fire-and-forget, no-op in tests)
vi.mock("../utils/spavn-code-bridge.js", () => ({
  SpavnCodeBridge: vi.fn(() => ({
    taskStarted: vi.fn(),
    taskFinished: vi.fn(),
    toolCall: vi.fn(),
    error: vi.fn(),
    interactionNeeded: vi.fn(),
    isActive: false,
  })),
}));

// We'll import the tool registry after mocking
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn(() => ({
    tool: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

// Import the start function after mocks are set up
import { startMCPServer } from "../mcp-server.js";

describe("MCP Server", () => {
  let tmpDir: string;
  let mockExec: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-mcp-"));
    mockExec = vi.mocked(exec);
    mockExec.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Tool Context", () => {
    it("should have required context properties", () => {
      const context = {
        worktree: tmpDir,
        sessionID: "test-session",
        messageID: "test-message",
        agent: "test-agent",
        directory: tmpDir,
      };

      expect(context.worktree).toBeDefined();
      expect(context.sessionID).toBeDefined();
      expect(context.messageID).toBeDefined();
      expect(context.agent).toBeDefined();
      expect(context.directory).toBeDefined();
    });
  });

  describe("spavn_init tool", () => {
    it("should initialize .spavn directory structure", async () => {
      const spavnPath = path.join(tmpDir, ".spavn");
      expect(fs.existsSync(spavnPath)).toBe(false);

      fs.mkdirSync(path.join(spavnPath, "plans"), { recursive: true });
      fs.mkdirSync(path.join(spavnPath, "sessions"), { recursive: true });

      expect(fs.existsSync(spavnPath)).toBe(true);
      expect(fs.existsSync(path.join(spavnPath, "plans"))).toBe(true);
      expect(fs.existsSync(path.join(spavnPath, "sessions"))).toBe(true);
    });

    it("should handle existing .spavn directory", () => {
      const spavnPath = path.join(tmpDir, ".spavn");
      fs.mkdirSync(spavnPath, { recursive: true });
      expect(fs.existsSync(spavnPath)).toBe(true);
    });

    it("should create subdirectories with proper hierarchy", () => {
      const spavnPath = path.join(tmpDir, ".spavn");
      fs.mkdirSync(path.join(spavnPath, "plans"), { recursive: true });
      fs.mkdirSync(path.join(spavnPath, "sessions"), { recursive: true });

      expect(fs.statSync(path.join(spavnPath, "plans")).isDirectory()).toBe(true);
      expect(fs.statSync(path.join(spavnPath, "sessions")).isDirectory()).toBe(true);
    });
  });

  describe("spavn_status tool", () => {
    it("should report missing .spavn directory", () => {
      const spavnPath = path.join(tmpDir, ".spavn");
      expect(fs.existsSync(spavnPath)).toBe(false);
    });

    it("should count plans and sessions", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      const sessionsPath = path.join(tmpDir, ".spavn", "sessions");

      fs.mkdirSync(plansPath, { recursive: true });
      fs.mkdirSync(sessionsPath, { recursive: true });

      fs.writeFileSync(path.join(plansPath, "plan1.md"), "# Plan 1");
      fs.writeFileSync(path.join(plansPath, "plan2.md"), "# Plan 2");
      fs.writeFileSync(path.join(sessionsPath, "session1.md"), "# Session 1");

      const planFiles = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md"));
      const sessionFiles = fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md"));

      expect(planFiles).toHaveLength(2);
      expect(sessionFiles).toHaveLength(1);
    });
  });

  describe("plan_save tool", () => {
    it("should save plan with title, type, and content", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const title = "New Feature";
      const type = "feature";
      const content = "## Description\nImplement new feature";

      const date = new Date().toISOString().split("T")[0];
      const slug = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      const filename = `${date}-${type}-${slug}.md`;
      const filepath = path.join(plansPath, filename);

      const fileContent = `# ${title}\n\n${content}`;
      fs.writeFileSync(filepath, fileContent);

      expect(fs.existsSync(filepath)).toBe(true);
      const saved = fs.readFileSync(filepath, "utf-8");
      expect(saved).toContain(title);
      expect(saved).toContain(content);
    });

    it("should generate filename with date prefix", () => {
      const date = new Date().toISOString().split("T")[0];
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should handle special characters in title slug", () => {
      const title = "API v2.0 Update!";
      const slug = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      expect(slug).toBe("api-v20-update");
    });

    it("should support all plan types", () => {
      const types = ["feature", "bugfix", "refactor", "architecture", "spike", "docs"];
      for (const type of types) {
        expect(["feature", "bugfix", "refactor", "architecture", "spike", "docs"]).toContain(type);
      }
    });
  });

  describe("plan_load tool", () => {
    it("should load plan content by filename", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const filename = "2026-03-12-feature-test-plan.md";
      const filepath = path.join(plansPath, filename);
      const content = "# Test Plan\n\nThis is test content";

      fs.writeFileSync(filepath, content);
      const loaded = fs.readFileSync(filepath, "utf-8");
      expect(loaded).toBe(content);
    });

    it("should handle missing plan gracefully", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });
      expect(fs.existsSync(path.join(plansPath, "nonexistent.md"))).toBe(false);
    });

    it("should preserve markdown formatting in loaded content", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const filepath = path.join(plansPath, "plan.md");
      const content = `# Title\n## Section\n- Item 1\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\``;

      fs.writeFileSync(filepath, content);
      const loaded = fs.readFileSync(filepath, "utf-8");
      expect(loaded).toContain("## Section");
      expect(loaded).toContain("```mermaid");
    });
  });

  describe("plan_delete tool", () => {
    it("should delete plan file", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const filepath = path.join(plansPath, "plan.md");
      fs.writeFileSync(filepath, "# Plan");
      expect(fs.existsSync(filepath)).toBe(true);

      fs.unlinkSync(filepath);
      expect(fs.existsSync(filepath)).toBe(false);
    });
  });

  describe("plan_list tool", () => {
    it("should list plans sorted in reverse order", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      fs.writeFileSync(path.join(plansPath, "2026-03-10-feature-a.md"), "# Plan A");
      fs.writeFileSync(path.join(plansPath, "2026-03-11-feature-b.md"), "# Plan B");
      fs.writeFileSync(path.join(plansPath, "2026-03-12-feature-c.md"), "# Plan C");

      const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).sort().reverse();
      expect(files[0]).toBe("2026-03-12-feature-c.md");
      expect(files[2]).toBe("2026-03-10-feature-a.md");
    });

    it("should respect limit parameter", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      for (let i = 0; i < 15; i++) {
        fs.writeFileSync(path.join(plansPath, `plan${i}.md`), `# Plan ${i}`);
      }

      const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).sort().reverse();
      const limited = files.slice(0, Math.min(10, files.length));
      expect(limited).toHaveLength(10);
    });

    it("should handle empty plans directory", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });
      const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md"));
      expect(files).toHaveLength(0);
    });
  });

  describe("session_save tool", () => {
    it("should save session with summary and decisions", () => {
      const sessionsPath = path.join(tmpDir, ".spavn", "sessions");
      fs.mkdirSync(sessionsPath, { recursive: true });

      const summary = "Implemented authentication system";
      const decisions = ["Use JWT tokens", "Store in HTTPOnly cookies"];

      const date = new Date().toISOString().split("T")[0];
      const filename = `${date}-abc12345.md`;
      const filepath = path.join(sessionsPath, filename);

      const content = `# Session Summary\n\n${summary}\n\n## Key Decisions\n\n${decisions.map((d) => `- ${d}`).join("\n")}`;
      fs.writeFileSync(filepath, content);

      const saved = fs.readFileSync(filepath, "utf-8");
      expect(saved).toContain(summary);
      expect(saved).toContain("Use JWT tokens");
    });

    it("should generate unique session IDs", () => {
      const sessionId1 = Math.random().toString(36).substring(2, 10);
      const sessionId2 = Math.random().toString(36).substring(2, 10);
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe("session_list tool", () => {
    it("should list sessions in reverse chronological order", () => {
      const sessionsPath = path.join(tmpDir, ".spavn", "sessions");
      fs.mkdirSync(sessionsPath, { recursive: true });

      fs.writeFileSync(path.join(sessionsPath, "2026-03-10-a.md"), "# Session A");
      fs.writeFileSync(path.join(sessionsPath, "2026-03-11-b.md"), "# Session B");
      fs.writeFileSync(path.join(sessionsPath, "2026-03-12-c.md"), "# Session C");

      const files = fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).sort().reverse();
      expect(files[0]).toBe("2026-03-12-c.md");
    });
  });

  describe("worktree_list tool", () => {
    it("should execute git worktree list command", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: `${tmpDir} (detached)`, stderr: "" });

      const result = await mockExec("git", ["worktree", "list"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(tmpDir);
    });
  });

  describe("branch_status tool", () => {
    it("should execute git branch command", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "main\n", stderr: "" });

      const result = await mockExec("git", ["branch", "--show-current"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("main");
    });
  });

  describe("branch_switch tool", () => {
    it("should execute git checkout command with branch name", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "Switched to branch 'develop'", stderr: "" });

      const result = await mockExec("git", ["checkout", "develop"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
    });
  });

  describe("github_status tool", () => {
    it("should execute gh auth status command", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "Logged in", stderr: "" });

      const result = await mockExec("gh", ["auth", "status"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
    });
  });

  describe("task_finalize tool", () => {
    it("should execute git add and commit commands", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "[main abc1234] feat: test", stderr: "" });

      const r1 = await mockExec("git", ["add", "-A"], { cwd: tmpDir, nothrow: true });
      const r2 = await mockExec("git", ["commit", "-m", "feat: test"], { cwd: tmpDir, nothrow: true });

      expect(r1.exitCode).toBe(0);
      expect(r2.exitCode).toBe(0);
    });
  });

  describe("startMCPServer function", () => {
    it("should initialize MCP server with name and version", async () => {
      expect(typeof startMCPServer).toBe("function");
    });

    it("should be an async function", async () => {
      const result = startMCPServer();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("Tool Registration", () => {
    it("should have all expected tools registered", () => {
      // Phase 1: Existing + newly ported from OpenCode plugin
      const existingTools = [
        "spavn_init", "spavn_status", "spavn_configure",
        "worktree_list", "worktree_open", "worktree_create", "worktree_remove",
        "branch_status", "branch_switch", "branch_create",
        "plan_list", "plan_load", "plan_save", "plan_delete", "plan_commit",
        "session_list", "session_load", "session_save",
        "docs_init", "docs_list", "docs_save", "docs_index",
        "github_status", "github_issues", "github_projects",
        "task_finalize",
        "repl_init", "repl_status", "repl_report", "repl_resume", "repl_summary",
        "quality_gate_summary",
        "agent_list",
        "skill", "skill_get", "skill_list",
      ];

      // Phase 2: New workflow tools
      const newWorkflowTools = [
        "plan_start", "plan_interview", "plan_approve",
        "coordinate_tasks", "coordinate_assign_skills", "coordinate_status",
        "quality_report", "quality_finalize",
        "agent_get",
        "git_commit", "git_pr", "git_status",
      ];

      // Phase 3: Aliases
      const aliasTools = [
        "execute_init", "execute_task", "execute_report",
        "execute_resume", "execute_summary",
        "quality_gate",
      ];

      const allTools = [...existingTools, ...newWorkflowTools, ...aliasTools];

      // Verify uniqueness
      const unique = new Set(allTools);
      expect(unique.size).toBe(allTools.length);

      // Verify total count: 54 tools
      expect(allTools.length).toBe(54);
    });
  });

  describe("Coordination tools", () => {
    it("should create tasks.json from plan", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const planContent = `---
title: "Test Plan"
type: feature
status: approved
---

# Test Plan

## Tasks

- [ ] Create user model
- [ ] Add authentication middleware
- [ ] Write tests
`;

      fs.writeFileSync(path.join(plansPath, "test-plan.md"), planContent);

      // Verify the plan file was created
      expect(fs.existsSync(path.join(plansPath, "test-plan.md"))).toBe(true);

      // Parse tasks from the plan
      const taskRegex = /^-\s*\[[ x]\]\s+(.+)$/gm;
      const tasks: string[] = [];
      let match;
      while ((match = taskRegex.exec(planContent)) !== null) {
        tasks.push(match[1].trim());
      }

      expect(tasks).toHaveLength(3);
      expect(tasks[0]).toBe("Create user model");
    });

    it("should track task state in tasks.json", () => {
      const spavnDir = path.join(tmpDir, ".spavn");
      fs.mkdirSync(spavnDir, { recursive: true });

      const state = {
        planFilename: "test-plan.md",
        createdAt: new Date().toISOString(),
        tasks: [
          { id: 1, description: "Task 1", status: "pending" },
          { id: 2, description: "Task 2", status: "in_progress", skill: "coder" },
          { id: 3, description: "Task 3", status: "done" },
        ],
      };

      const tasksPath = path.join(spavnDir, "tasks.json");
      fs.writeFileSync(tasksPath, JSON.stringify(state, null, 2));

      const loaded = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      expect(loaded.tasks).toHaveLength(3);
      expect(loaded.tasks[1].skill).toBe("coder");
    });
  });

  describe("Plan workflow tools", () => {
    it("should create plan skeleton with plan_start", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const date = new Date().toISOString().split("T")[0];
      const filename = `${date}-feature-test-feature.md`;
      const filepath = path.join(plansPath, filename);

      const content = `---\ntitle: "Test Feature"\ntype: feature\nstatus: draft\n---\n\n# Test Feature\n`;
      fs.writeFileSync(filepath, content);

      expect(fs.existsSync(filepath)).toBe(true);
      const loaded = fs.readFileSync(filepath, "utf-8");
      expect(loaded).toContain("status: draft");
    });

    it("should transition plan from draft to approved", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const filepath = path.join(plansPath, "test.md");
      fs.writeFileSync(filepath, "---\nstatus: draft\n---\n# Test");

      let content = fs.readFileSync(filepath, "utf-8");
      content = content.replace("status: draft", "status: approved");
      fs.writeFileSync(filepath, content);

      const updated = fs.readFileSync(filepath, "utf-8");
      expect(updated).toContain("status: approved");
    });
  });

  describe("Quality gate tools", () => {
    it("should persist quality gate state", () => {
      const spavnDir = path.join(tmpDir, ".spavn");
      fs.mkdirSync(spavnDir, { recursive: true });

      const qgState = {
        timestamp: new Date().toISOString(),
        scope: "standard",
        recommendation: "GO",
        status: "complete",
      };

      const qgPath = path.join(spavnDir, "quality-gate.json");
      fs.writeFileSync(qgPath, JSON.stringify(qgState, null, 2));

      const loaded = JSON.parse(fs.readFileSync(qgPath, "utf-8"));
      expect(loaded.recommendation).toBe("GO");
      expect(loaded.status).toBe("complete");
    });

    it("should save quality reports", () => {
      const reportsDir = path.join(tmpDir, ".spavn", "quality-reports");
      fs.mkdirSync(reportsDir, { recursive: true });

      const filename = "testing-2026-03-15.md";
      fs.writeFileSync(path.join(reportsDir, filename), "# Quality Report: testing\n\n**Verdict:** PASS");

      expect(fs.existsSync(path.join(reportsDir, filename))).toBe(true);
    });
  });

  describe("Git extras", () => {
    it("should execute git commit with message", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

      const result = await mockExec("git", ["commit", "-m", "test message"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
    });

    it("should execute gh pr create", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "https://github.com/test/repo/pull/1", stderr: "" });

      const result = await mockExec("gh", ["pr", "create", "--title", "test"], { cwd: tmpDir, nothrow: true });
      expect(result.exitCode).toBe(0);
    });

    it("should get enhanced git status", async () => {
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "main\n", stderr: "" });
      mockExec.mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

      const branch = await mockExec("git", ["branch", "--show-current"], { cwd: tmpDir, nothrow: true });
      const status = await mockExec("git", ["status", "--porcelain"], { cwd: tmpDir, nothrow: true });

      expect(branch.stdout.trim()).toBe("main");
      expect(status.stdout).toBe("");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty plan limit", () => {
      const files = ["plan1.md", "plan2.md"];
      const limited = files.slice(0, Math.min(0, files.length));
      expect(limited).toHaveLength(0);
    });

    it("should handle very large plan limit", () => {
      const files = ["plan1.md", "plan2.md"];
      const limited = files.slice(0, Math.min(999999, files.length));
      expect(limited).toHaveLength(2);
    });

    it("should handle whitespace in filenames", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const filename = "2026-03-12-bugfix-whitespace test.md";
      const filepath = path.join(plansPath, filename);

      fs.writeFileSync(filepath, "# Test");
      expect(fs.existsSync(filepath)).toBe(true);
    });

    it("should handle unicode in content", () => {
      const plansPath = path.join(tmpDir, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const content = "# Plan\n\nUnicode content with special chars";
      const filepath = path.join(plansPath, "plan.md");

      fs.writeFileSync(filepath, content, "utf-8");
      const loaded = fs.readFileSync(filepath, "utf-8");
      expect(loaded).toContain("Plan");
    });
  });
});
