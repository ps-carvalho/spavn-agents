import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { exec } from "./utils/shell.js";
import {
  checkGhAvailability,
  fetchIssues,
  fetchProjects,
  fetchProjectItems,
  formatIssueList,
  formatIssueForPlan,
  formatProjectItemList,
} from "./utils/github.js";
import {
  parseTasksWithAC,
  detectCommands,
  readSpavnConfig,
  readReplState,
  writeReplState,
  getNextTask,
  getCurrentTask,
  isLoopComplete,
  detectIncompleteState,
  formatProgress,
  formatSummary,
  type ReplState,
  type ReplTask,
} from "./utils/repl.js";
import {
  parseFrontmatter as parsePlanFrontmatter,
  upsertFrontmatterField,
  TYPE_TO_PREFIX,
  extractBranch,
  extractIssueRefs,
  extractPlanSections,
  buildPrBodyFromPlan,
} from "./utils/plan-extract.js";
import { classifyChangeScope } from "./utils/change-scope.js";
import {
  coordinateTasks,
  coordinateAssignSkills,
  coordinateStatus,
} from "./tools/coordinate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get package version for server identification
const VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"),
).version as string;

// ─── Lazy engine singleton ───────────────────────────────────────────────────

let _engine: import("./engine/index.js").SpavnEngine | null = null;

async function getEngine(): Promise<import("./engine/index.js").SpavnEngine> {
  if (!_engine) {
    const { SpavnEngine } = await import("./engine/index.js");
    _engine = new SpavnEngine();
    _engine.initialize();
  }
  return _engine;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const mcpServer = new McpServer({
    name: "spavn-agents",
    version: VERSION,
  });

  // Get the current working directory as the worktree root
  const worktree = process.cwd();

  function ok(text: string) {
    return { content: [{ type: "text" as const, text }] };
  }

  function err(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
  }

  // ─── Spavn tools ────────────────────────────────────────────────────────────

  mcpServer.tool(
    "spavn_init",
    "Initialize .spavn directory in project root for plan storage, session history, and configuration",
    {},
    async () => {
      const spavnPath = path.join(worktree, ".spavn");
      try {
        if (!fs.existsSync(spavnPath)) {
          fs.mkdirSync(spavnPath, { recursive: true });
          fs.mkdirSync(path.join(spavnPath, "plans"), { recursive: true });
          fs.mkdirSync(path.join(spavnPath, "sessions"), { recursive: true });
          return ok(`✓ Initialized .spavn directory at ${spavnPath}`);
        } else {
          return ok(`✓ .spavn directory already exists at ${spavnPath}`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "spavn_status",
    "Check .spavn directory status - whether it exists, plan count, session count",
    {},
    async () => {
      const spavnPath = path.join(worktree, ".spavn");
      if (!fs.existsSync(spavnPath)) {
        return ok(`✗ .spavn directory not found at ${spavnPath}\n\nRun spavn_init to initialize.`);
      }

      const plansPath = path.join(spavnPath, "plans");
      const sessionsPath = path.join(spavnPath, "sessions");

      const planCount = fs.existsSync(plansPath)
        ? fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).length
        : 0;
      const sessionCount = fs.existsSync(sessionsPath)
        ? fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).length
        : 0;

      return ok(`✓ .spavn directory status\n\nLocation: ${spavnPath}\nPlans: ${planCount}\nSessions: ${sessionCount}`);
    },
  );

  mcpServer.tool(
    "spavn_configure",
    "Configure AI models for this project (primary agents and subagents)",
    {
      scope: z.enum(["project", "global"]).describe("Configuration scope: project-specific or global"),
      primaryModel: z.string().describe("Model ID for primary agents"),
      subagentModel: z.string().describe("Model ID for subagents"),
    },
    async ({ scope, primaryModel, subagentModel }) => {
      try {
        const configDir = scope === "project"
          ? path.join(worktree, ".spavn")
          : path.join(os.homedir(), ".spavn");
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, "config.json");

        let config: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
          try {
            config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          } catch {
            // corrupted file, start fresh
          }
        }

        config.primaryModel = primaryModel;
        config.subagentModel = subagentModel;
        config.updatedAt = new Date().toISOString();

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return ok(`✓ Configured models (persisted to ${configPath})\n\nScope: ${scope}\nPrimary: ${primaryModel}\nSubagent: ${subagentModel}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Worktree tools ─────────────────────────────────────────────────────────

  mcpServer.tool(
    "worktree_create",
    "Create a new git worktree for isolated development. Worktrees are created in .worktrees/ at the project root.",
    {
      name: z.string().describe("Worktree name (e.g., 'auth-feature', 'login-bugfix')"),
      type: z.enum(["feature", "bugfix", "hotfix", "refactor", "spike", "docs", "test"]).describe("Type of work - determines branch prefix"),
      fromBranch: z.string().optional().describe("Use an existing branch instead of creating a new one"),
    },
    async ({ name, type, fromBranch }) => {
      const branchName = fromBranch || `${type}/${name}`;
      const worktreePath = path.resolve(path.join(worktree, ".worktrees", name));

      try {
        await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
      } catch {
        return ok("✗ Error: Not in a git repository.");
      }

      if (fs.existsSync(worktreePath)) {
        return ok(`✗ Error: Worktree already exists at ${worktreePath}`);
      }

      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

      try {
        if (fromBranch) {
          try {
            await exec("git", ["worktree", "add", worktreePath, fromBranch], { cwd: worktree });
          } catch {
            await exec("git", ["worktree", "add", "-b", fromBranch, worktreePath], { cwd: worktree });
          }
        } else {
          try {
            await exec("git", ["worktree", "add", "-b", branchName, worktreePath], { cwd: worktree });
          } catch {
            await exec("git", ["worktree", "add", worktreePath, branchName], { cwd: worktree });
          }
        }
      } catch (error) {
        return err(error);
      }

      return ok(`✓ Created worktree\n\nBranch: ${branchName}\nPath: ${worktreePath}\n\nTo work in this worktree:\n  cd ${worktreePath}`);
    },
  );

  mcpServer.tool(
    "worktree_list",
    "List all git worktrees for the repository",
    {},
    async () => {
      try {
        const result = await exec("git", ["worktree", "list"], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          return ok(`✓ Git worktrees:\n\n${result.stdout}`);
        } else {
          return ok(`✗ Not a git repository or git worktree list failed`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "worktree_remove",
    "Remove a git worktree (after merging). Optionally deletes the branch.",
    {
      name: z.string().describe("Worktree name to remove"),
      deleteBranch: z.boolean().optional().describe("Also delete the associated branch (default: false)"),
    },
    async ({ name, deleteBranch = false }) => {
      const worktreePath = path.resolve(path.join(worktree, ".worktrees", name));

      if (!fs.existsSync(worktreePath)) {
        return ok(`✗ Worktree not found at ${worktreePath}`);
      }

      // Get branch name before removing
      let branchName = "";
      try {
        const r = await exec("git", ["branch", "--show-current"], { cwd: worktreePath, nothrow: true });
        if (r.exitCode === 0) branchName = r.stdout.trim();
      } catch { /* ignore */ }

      try {
        await exec("git", ["worktree", "remove", worktreePath], { cwd: worktree });
      } catch {
        try {
          await exec("git", ["worktree", "remove", "--force", worktreePath], { cwd: worktree });
        } catch (error) {
          return err(error);
        }
      }

      let output = `✓ Removed worktree at ${worktreePath}`;

      if (deleteBranch && branchName) {
        try {
          await exec("git", ["branch", "-d", branchName], { cwd: worktree });
          output += `\n✓ Deleted branch ${branchName}`;
        } catch {
          output += `\n⚠ Could not delete branch ${branchName} (may not be fully merged)`;
        }
      }

      return ok(output);
    },
  );

  mcpServer.tool(
    "worktree_open",
    "Open a git worktree in the default editor or file explorer",
    {
      name: z.string().describe("Worktree name to open"),
    },
    async ({ name: worktreeName }) => {
      const worktreePath = path.join(worktree, "..", worktreeName);
      if (fs.existsSync(worktreePath)) {
        return ok(`✓ Worktree path: ${worktreePath}`);
      } else {
        return ok(`✗ Worktree not found at ${worktreePath}`);
      }
    },
  );

  // ─── Branch tools ───────────────────────────────────────────────────────────

  mcpServer.tool(
    "branch_create",
    "Create and checkout a new git branch with proper naming convention",
    {
      name: z.string().describe("Branch name slug (e.g., 'user-authentication')"),
      type: z.enum(["feature", "bugfix", "hotfix", "refactor", "docs", "test", "chore"]).describe("Branch type - determines prefix"),
    },
    async ({ name, type }) => {
      const branchName = `${type}/${name}`;

      try {
        await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
      } catch {
        return ok("✗ Error: Not in a git repository");
      }

      try {
        await exec("git", ["checkout", "-b", branchName], { cwd: worktree });
      } catch (error) {
        return err(error);
      }

      return ok(`✓ Created and switched to branch: ${branchName}`);
    },
  );

  mcpServer.tool(
    "branch_status",
    "Get current git branch status",
    {},
    async () => {
      try {
        const result = await exec("git", ["branch", "--show-current"], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          const branch = result.stdout.trim();
          return ok(`✓ Current branch: ${branch}`);
        } else {
          return ok(`✗ Failed to get branch status`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "branch_switch",
    "Switch to an existing git branch",
    {
      branch: z.string().describe("Branch name to switch to"),
    },
    async ({ branch }) => {
      try {
        const result = await exec("git", ["checkout", branch], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          return ok(`✓ Switched to branch: ${branch}`);
        } else {
          return ok(`✗ Failed to switch branch: ${result.stderr}`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Plan tools ─────────────────────────────────────────────────────────────

  mcpServer.tool(
    "plan_list",
    "List all plans in .spavn/plans/ with preview",
    {
      limit: z.number().optional().describe("Maximum number of plans to return"),
    },
    async ({ limit: maxItems }) => {
      const plansPath = path.join(worktree, ".spavn", "plans");
      if (!fs.existsSync(plansPath)) {
        return ok(`No plans found. Run spavn_init to initialize.`);
      }

      const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).sort().reverse();
      const limit = maxItems || 10;
      const limited = files.slice(0, Math.min(limit, files.length));

      if (limited.length === 0) {
        return ok(`No plans saved in .spavn/plans/`);
      }

      let output = `✓ Plans (showing ${limited.length}):\n\n`;
      for (const file of limited) {
        output += `  • ${file}\n`;
      }
      return ok(output);
    },
  );

  mcpServer.tool(
    "plan_load",
    "Load a full plan by filename",
    {
      filename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    async ({ filename }) => {
      const filepath = path.join(worktree, ".spavn", "plans", filename);

      if (!fs.existsSync(filepath)) {
        return ok(`✗ Plan not found: ${filename}`);
      }

      try {
        const content = fs.readFileSync(filepath, "utf-8");
        return ok(`✓ Plan: ${filename}\n\n${content}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "plan_save",
    "Save an implementation plan to .spavn/plans/ with mermaid diagram support",
    {
      title: z.string().describe("Plan title"),
      type: z.enum(["feature", "bugfix", "refactor", "architecture", "spike", "docs"]).describe("Plan type"),
      content: z.string().describe("Full plan content in markdown"),
    },
    async ({ title, type, content }) => {
      const plansPath = path.join(worktree, ".spavn", "plans");

      try {
        fs.mkdirSync(plansPath, { recursive: true });

        const date = new Date().toISOString().split("T")[0];
        const slug = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const filename = `${date}-${type}-${slug}.md`;
        const filepath = path.join(plansPath, filename);

        fs.writeFileSync(filepath, `# ${title}\n\n${content}`);
        return ok(`✓ Plan saved: ${filename}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "plan_delete",
    "Delete a plan file",
    {
      filename: z.string().describe("Plan filename to delete"),
    },
    async ({ filename }) => {
      const filepath = path.join(worktree, ".spavn", "plans", filename);

      if (!fs.existsSync(filepath)) {
        return ok(`✗ Plan not found: ${filename}`);
      }

      try {
        fs.unlinkSync(filepath);
        return ok(`✓ Deleted plan: ${filename}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "plan_commit",
    "Stage and commit .spavn/ plan artifacts on the current branch. Writes a suggested branch name into frontmatter for handoff.",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    async ({ planFilename }) => {
      try {
        await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
      } catch {
        return ok("✗ Error: Not in a git repository.");
      }

      const plansDir = path.join(worktree, ".spavn", "plans");
      const filepath = path.resolve(plansDir, planFilename);
      const resolvedPlansDir = path.resolve(plansDir);

      if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
        return ok("✗ Invalid plan filename: path traversal not allowed");
      }
      if (!fs.existsSync(filepath)) {
        return ok(`✗ Plan not found: ${planFilename}`);
      }

      let planContent = fs.readFileSync(filepath, "utf-8");
      const fm = parsePlanFrontmatter(planContent);

      const planTitle = fm?.title || "untitled";
      const planType = fm?.type || "feature";

      // Compute suggested branch
      const VALID_PREFIXES = Object.values(TYPE_TO_PREFIX);
      const rawPrefix = TYPE_TO_PREFIX[planType] || "feature";
      const prefix = VALID_PREFIXES.includes(rawPrefix) ? rawPrefix : "feature";
      const slug = planTitle.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 50);
      const suggestedBranch = `${prefix}/${slug}`;

      planContent = upsertFrontmatterField(planContent, "branch", suggestedBranch);
      fs.writeFileSync(filepath, planContent);

      // Stage .spavn/
      try {
        await exec("git", ["add", path.join(worktree, ".spavn")], { cwd: worktree });
      } catch (e) {
        return err(e);
      }

      // Commit
      const commitMsg = `chore(plan): ${planTitle}`;
      try {
        const { stdout: statusOut } = await exec("git", ["status", "--porcelain"], { cwd: worktree, nothrow: true });
        const stagedLines = statusOut.trim().split("\n").filter((l) => l && l[0] !== " " && l[0] !== "?");
        if (stagedLines.length === 0) {
          return ok(`✓ Plan already committed (no new changes)\nSuggested branch: ${suggestedBranch}`);
        }

        await exec("git", ["commit", "-m", commitMsg], { cwd: worktree });
        const { stdout: hashOut } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: worktree, nothrow: true });

        return ok(`✓ Plan committed\n\nCommit: ${hashOut.trim()} — ${commitMsg}\nPlan: ${planFilename}\nSuggested branch: ${suggestedBranch}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Plan workflow tools (Phase 2) ──────────────────────────────────────────

  mcpServer.tool(
    "plan_start",
    "Create a plan skeleton with title, type, and optional GitHub issue ref. Auto-inits .spavn/ if needed.",
    {
      title: z.string().describe("Plan title"),
      type: z.enum(["feature", "bugfix", "refactor", "architecture", "spike", "docs"]).describe("Plan type"),
      issueRef: z.number().optional().describe("GitHub issue number to reference"),
    },
    async ({ title, type, issueRef }) => {
      const plansPath = path.join(worktree, ".spavn", "plans");
      fs.mkdirSync(plansPath, { recursive: true });

      const date = new Date().toISOString().split("T")[0];
      const slug = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 50);
      const filename = `${date}-${type}-${slug}.md`;
      const filepath = path.join(plansPath, filename);

      const issueRefLine = issueRef ? `\nissue: ${issueRef}` : "";

      const content = `---
title: "${title}"
type: ${type}
created: ${new Date().toISOString()}
status: draft${issueRefLine}
---

# ${title}

## Context

<!-- Describe the problem or opportunity -->

## Approach

<!-- Outline the technical approach -->

## Tasks

- [ ] <!-- Task 1 -->
- [ ] <!-- Task 2 -->
- [ ] <!-- Task 3 -->

## Risks

<!-- Identify potential risks -->
`;

      fs.writeFileSync(filepath, content);
      return ok(`✓ Plan skeleton created: ${filename}\n\nEdit the plan, then use plan_interview to refine and plan_approve when ready.`);
    },
  );

  mcpServer.tool(
    "plan_interview",
    "Append Q&A refinement to a draft plan",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
      question: z.string().describe("Refinement question"),
      answer: z.string().describe("Answer to the question"),
    },
    async ({ planFilename, question, answer }) => {
      const filepath = path.join(worktree, ".spavn", "plans", planFilename);

      if (!fs.existsSync(filepath)) {
        return ok(`✗ Plan not found: ${planFilename}`);
      }

      const content = fs.readFileSync(filepath, "utf-8");

      // Check it's still draft
      if (!content.includes("status: draft")) {
        return ok(`✗ Plan is not in draft status. Only draft plans can be refined.`);
      }

      const qaSection = `\n\n### Q: ${question}\n\n${answer}\n`;
      fs.writeFileSync(filepath, content + qaSection);

      return ok(`✓ Refinement added to ${planFilename}`);
    },
  );

  mcpServer.tool(
    "plan_approve",
    "Update plan status from draft to approved",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    async ({ planFilename }) => {
      const filepath = path.join(worktree, ".spavn", "plans", planFilename);

      if (!fs.existsSync(filepath)) {
        return ok(`✗ Plan not found: ${planFilename}`);
      }

      let content = fs.readFileSync(filepath, "utf-8");

      if (!content.includes("status: draft")) {
        return ok(`✗ Plan is not in draft status.`);
      }

      content = content.replace("status: draft", "status: approved");
      fs.writeFileSync(filepath, content);

      return ok(`✓ Plan approved: ${planFilename}\n\nReady for coordinate_tasks to break into assignments.`);
    },
  );

  // ─── Session tools ──────────────────────────────────────────────────────────

  mcpServer.tool(
    "session_list",
    "List recent session summaries from .spavn/sessions/",
    {
      limit: z.number().optional().describe("Maximum number of sessions to return"),
    },
    async ({ limit: maxItems }) => {
      const sessionsPath = path.join(worktree, ".spavn", "sessions");
      if (!fs.existsSync(sessionsPath)) {
        return ok(`No sessions found. Sessions are created when you use session_save.`);
      }

      const files = fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).sort().reverse();
      const limit = maxItems || 10;
      const limited = files.slice(0, Math.min(limit, files.length));

      if (limited.length === 0) {
        return ok(`No session summaries found in .spavn/sessions/`);
      }

      let output = `✓ Recent Sessions (showing ${limited.length}):\n\n`;
      for (const file of limited) {
        output += `  • ${file}\n`;
      }
      return ok(output);
    },
  );

  mcpServer.tool(
    "session_load",
    "Load a session summary by filename",
    {
      filename: z.string().describe("Session filename"),
    },
    async ({ filename }) => {
      const filepath = path.join(worktree, ".spavn", "sessions", filename);

      if (!fs.existsSync(filepath)) {
        return ok(`✗ Session not found: ${filename}`);
      }

      try {
        const content = fs.readFileSync(filepath, "utf-8");
        return ok(`✓ Session: ${filename}\n\n${content}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "session_save",
    "Save a session summary with key decisions to .spavn/sessions/",
    {
      summary: z.string().describe("Brief summary of what was accomplished"),
      decisions: z.array(z.string()).describe("List of key decisions made"),
    },
    async ({ summary, decisions }) => {
      const sessionsPath = path.join(worktree, ".spavn", "sessions");

      try {
        fs.mkdirSync(sessionsPath, { recursive: true });

        const date = new Date().toISOString().split("T")[0];
        const sessionId = Math.random().toString(36).substring(2, 10);
        const filename = `${date}-${sessionId}.md`;
        const filepath = path.join(sessionsPath, filename);

        const content = `# Session Summary\n\n${summary}\n\n## Key Decisions\n\n${decisions.map((d) => `- ${d}`).join("\n")}`;
        fs.writeFileSync(filepath, content);
        return ok(`✓ Session saved: ${filename}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Documentation tools ────────────────────────────────────────────────────

  mcpServer.tool(
    "docs_init",
    "Initialize docs directory with decision/feature/flow subdirectories",
    {},
    async () => {
      const docsPath = path.join(worktree, "docs");
      try {
        fs.mkdirSync(path.join(docsPath, "decisions"), { recursive: true });
        fs.mkdirSync(path.join(docsPath, "features"), { recursive: true });
        fs.mkdirSync(path.join(docsPath, "flows"), { recursive: true });
        return ok(`✓ Initialized docs directory at ${docsPath}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "docs_save",
    "Save a documentation file with mermaid diagrams to docs/. Auto-rebuilds the index.",
    {
      title: z.string().describe("Document title"),
      type: z.enum(["decision", "feature", "flow"]).describe("Document type"),
      content: z.string().describe("Full markdown content"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      relatedFiles: z.array(z.string()).optional().describe("Source files related to this document"),
    },
    async ({ title, type, content, tags, relatedFiles }) => {
      const typeToFolder: Record<string, string> = { decision: "decisions", feature: "features", flow: "flows" };
      const folder = typeToFolder[type] || type;
      const folderPath = path.join(worktree, "docs", folder);

      try {
        fs.mkdirSync(folderPath, { recursive: true });

        const date = new Date().toISOString().split("T")[0];
        const slug = title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 60);
        const filename = `${date}-${slug}.md`;
        const filepath = path.join(folderPath, filename);

        const tagsStr = tags && tags.length > 0 ? `\ntags: [${tags.map((t) => `"${t}"`).join(", ")}]` : "";
        const filesStr = relatedFiles && relatedFiles.length > 0 ? `\nrelated_files: [${relatedFiles.map((f) => `"${f}"`).join(", ")}]` : "";

        const frontmatter = `---\ntitle: "${title}"\ntype: ${type}\ndate: ${new Date().toISOString()}${tagsStr}${filesStr}\n---\n\n`;
        fs.writeFileSync(filepath, frontmatter + content);

        return ok(`✓ Documentation saved: ${folder}/${filename}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "docs_list",
    "List all documentation files organized by type",
    {},
    async () => {
      const docsPath = path.join(worktree, "docs");
      if (!fs.existsSync(docsPath)) {
        return ok(`No docs found. Run docs_init to initialize.`);
      }

      const types = ["decisions", "features", "flows"];
      let output = `✓ Documentation:\n\n`;
      for (const type of types) {
        const typePath = path.join(docsPath, type);
        if (fs.existsSync(typePath)) {
          const files = fs.readdirSync(typePath).filter((f) => f.endsWith(".md"));
          output += `**${type}:** ${files.length} files\n`;
        }
      }
      return ok(output);
    },
  );

  mcpServer.tool(
    "docs_index",
    "Rebuild docs/INDEX.md with links to all documentation files",
    {},
    async () => {
      const docsPath = path.join(worktree, "docs");
      if (!fs.existsSync(docsPath)) {
        return ok(`No docs/ directory found. Run docs_init first.`);
      }

      const types = ["decisions", "features", "flows"];
      let totalDocs = 0;
      const now = new Date().toISOString().split("T")[0];
      let index = `# Project Documentation\n\n> Auto-generated. Last updated: ${now}\n`;

      for (const type of types) {
        const typePath = path.join(docsPath, type);
        if (!fs.existsSync(typePath)) continue;
        const files = fs.readdirSync(typePath).filter((f) => f.endsWith(".md") && f !== ".gitkeep").sort().reverse();
        totalDocs += files.length;
        index += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)} (${files.length})\n\n`;
        for (const file of files) {
          index += `- [${file}](${type}/${file})\n`;
        }
      }

      fs.writeFileSync(path.join(docsPath, "INDEX.md"), index);
      return ok(`✓ Index rebuilt: ${totalDocs} documents indexed`);
    },
  );

  // ─── Skill tools ────────────────────────────────────────────────────────────

  mcpServer.tool(
    "skill",
    "Load a spavn skill by name. Skills provide specialized domain knowledge or enhanced behavioral instructions.",
    {
      name: z.string().describe("Skill name to load"),
      mode: z.string().optional().describe("Operating mode context for access-level resolution"),
    },
    async ({ name: skillName, mode }) => {
      const skillPaths = [
        path.resolve(__dirname, "..", ".opencode", "skills", skillName, "SKILL.md"),
        path.join(worktree, ".opencode", "skills", skillName, "SKILL.md"),
      ];

      for (const skillPath of skillPaths) {
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, "utf-8");

            let header = `✓ Skill loaded: ${skillName}`;
            if (mode) {
              const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
              if (fmMatch) {
                const fm = fmMatch[1];
                const kindMatch = fm.match(/^kind:\s*(.+)$/m);
                const accessMatch = fm.match(/^access_level:\s*(.+)$/m);
                if (kindMatch && kindMatch[1].trim() === "enhanced" && accessMatch) {
                  const skillAccess = accessMatch[1].trim();
                  const ceilings: Record<string, string> = { architect: "read-only", implement: "full", fix: "full" };
                  const ceiling = ceilings[mode];
                  const order: Record<string, number> = { "read-only": 0, write: 1, full: 2 };
                  const effective = ceiling && order[skillAccess] !== undefined && order[ceiling] !== undefined
                    ? (order[skillAccess] <= order[ceiling] ? skillAccess : ceiling)
                    : skillAccess;
                  header += ` (enhanced, effective_access: ${effective})`;
                }
              }
            }

            return ok(`${header}\n\n${content}`);
          } catch (error) {
            return err(error);
          }
        }
      }

      const bundledSkillsDir = path.resolve(__dirname, "..", ".opencode", "skills");
      let available: string[] = [];
      if (fs.existsSync(bundledSkillsDir)) {
        available = fs.readdirSync(bundledSkillsDir).filter((d) =>
          fs.existsSync(path.join(bundledSkillsDir, d, "SKILL.md")),
        );
      }

      return ok(`✗ Skill not found: ${skillName}\n\nAvailable skills: ${available.join(", ")}`);
    },
  );

  mcpServer.tool(
    "skill_get",
    "Retrieve the full content of a domain skill by ID from the engine database",
    {
      skillId: z.string().describe("The skill identifier"),
    },
    async ({ skillId }) => {
      try {
        const engine = await getEngine();
        const content = engine.getSkillContent(skillId);

        if (!content) {
          const skills = engine.listSkills();
          const available = skills.map((s) => s.id).join(", ");
          return ok(`✗ Skill not found: ${skillId}\n\nAvailable skills: ${available}`);
        }

        return ok(content);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "skill_list",
    "List all available skills with metadata",
    {},
    async () => {
      try {
        const engine = await getEngine();
        const skills = engine.listSkills();

        if (skills.length === 0) {
          return ok("✗ No skills found. Run 'npx spavn-agents install' first.");
        }

        const knowledge = skills.filter((s) => s.kind === "knowledge");
        const enhanced = skills.filter((s) => s.kind === "enhanced");

        let output = `✓ ${skills.length} skills available:\n\n`;

        if (knowledge.length > 0) {
          output += `**Knowledge (${knowledge.length}):**\n`;
          output += knowledge.map((s) => `  - ${s.id}`).join("\n");
          output += "\n\n";
        }

        if (enhanced.length > 0) {
          output += `**Enhanced (${enhanced.length}):**\n`;
          output += enhanced.map((s) => `  - ${s.id} (access: ${s.access_level})`).join("\n");
        }

        return ok(output);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── GitHub tools ───────────────────────────────────────────────────────────

  mcpServer.tool(
    "github_status",
    "Check GitHub CLI availability and authentication",
    {},
    async () => {
      try {
        const result = await exec("gh", ["auth", "status"], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          return ok(`✓ GitHub CLI authenticated`);
        } else {
          return ok(`✗ GitHub CLI not authenticated. Run: gh auth login`);
        }
      } catch {
        return ok(`✗ GitHub CLI not installed. Install from https://cli.github.com/`);
      }
    },
  );

  mcpServer.tool(
    "github_issues",
    "List GitHub issues for the current repository, filterable by state, labels, milestone, and assignee",
    {
      state: z.enum(["open", "closed", "all"]).optional().describe("Filter by issue state (default: open)"),
      labels: z.string().optional().describe("Filter by labels (comma-separated)"),
      milestone: z.string().optional().describe("Filter by milestone name"),
      assignee: z.string().optional().describe("Filter by assignee username"),
      limit: z.number().optional().describe("Maximum number of issues to return (default: 20)"),
      detailed: z.boolean().optional().describe("Return full issue details for plan seeding"),
    },
    async (args) => {
      const ghStatus = await checkGhAvailability(worktree);
      if (!ghStatus.installed) return ok("✗ GitHub CLI not installed.");
      if (!ghStatus.authenticated) return ok("✗ GitHub CLI not authenticated. Run: gh auth login");

      try {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
        const issueList = await fetchIssues(worktree, {
          state: args.state ?? "open",
          labels: args.labels,
          milestone: args.milestone,
          assignee: args.assignee,
          limit,
        });

        if (issueList.length === 0) return ok("No issues found.");

        const header = `Found ${issueList.length} issue(s):\n\n`;
        if (args.detailed) {
          return ok(header + issueList.map((issue) => formatIssueForPlan(issue)).join("\n\n---\n\n"));
        }
        return ok(header + formatIssueList(issueList));
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "github_projects",
    "List GitHub Project boards and their work items",
    {
      projectNumber: z.number().optional().describe("Specific project number to list items from"),
      status: z.string().optional().describe("Filter project items by status column"),
      limit: z.number().optional().describe("Maximum number of items to return (default: 30)"),
    },
    async (args) => {
      const ghStatus = await checkGhAvailability(worktree);
      if (!ghStatus.installed) return ok("✗ GitHub CLI not installed.");
      if (!ghStatus.authenticated) return ok("✗ GitHub CLI not authenticated.");
      if (!ghStatus.hasRemote || !ghStatus.repoOwner) return ok("✗ No GitHub remote configured.");

      const owner = ghStatus.repoOwner;

      try {
        if (args.projectNumber === undefined) {
          const projectList = await fetchProjects(worktree, owner);
          if (projectList.length === 0) return ok(`No GitHub Projects found for ${owner}.`);
          return ok(`GitHub Projects for ${owner} (${projectList.length}):\n\n` +
            projectList.map((p) => `  #${p.number}: ${p.title}`).join("\n"));
        }

        const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
        const items = await fetchProjectItems(worktree, owner, args.projectNumber, { status: args.status, limit });
        if (items.length === 0) return ok(`No items found in project #${args.projectNumber}.`);

        return ok(`Project #${args.projectNumber} — ${items.length} item(s):\n\n` + formatProjectItemList(items));
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── REPL loop tools ───────────────────────────────────────────────────────

  mcpServer.tool(
    "repl_init",
    "Initialize a REPL implementation loop from a plan. Parses tasks, auto-detects build/test commands.",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
      buildCommand: z.string().optional().describe("Override auto-detected build command"),
      testCommand: z.string().optional().describe("Override auto-detected test command"),
      maxRetries: z.number().optional().describe("Max retries per failing task (default: 3)"),
    },
    async (args) => {
      const config = readSpavnConfig(worktree);
      const { planFilename, buildCommand, testCommand, maxRetries = config.maxRetries ?? 3 } = args;

      const plansDir = path.join(worktree, ".spavn", "plans");
      const planPath = path.resolve(plansDir, planFilename);
      const resolvedPlansDir = path.resolve(plansDir);

      if (!planPath.startsWith(resolvedPlansDir + path.sep)) {
        return ok("✗ Error: Invalid plan filename.");
      }
      if (!fs.existsSync(planPath)) {
        return ok(`✗ Error: Plan not found: ${planFilename}`);
      }

      const planContent = fs.readFileSync(planPath, "utf-8");
      const parsedTasks = parseTasksWithAC(planContent);
      if (parsedTasks.length === 0) {
        return ok(`✗ Error: No tasks found in plan: ${planFilename}`);
      }

      const detected = await detectCommands(worktree);
      const finalBuild = buildCommand ?? detected.buildCommand;
      const finalTest = testCommand ?? detected.testCommand;

      const tasks: ReplTask[] = parsedTasks.map((parsed, i) => ({
        index: i,
        description: parsed.description,
        acceptanceCriteria: parsed.acceptanceCriteria,
        status: "pending" as const,
        retries: 0,
        iterations: [],
      }));

      const state: ReplState = {
        version: 1,
        planFilename,
        startedAt: new Date().toISOString(),
        buildCommand: finalBuild,
        testCommand: finalTest,
        lintCommand: detected.lintCommand,
        maxRetries,
        currentTaskIndex: -1,
        tasks,
      };

      writeReplState(worktree, state);

      return ok(`✓ REPL loop initialized\n\nPlan: ${planFilename}\nTasks: ${tasks.length}\nBuild: ${finalBuild || "(none)"}\nTest: ${finalTest || "(none)"}\n\nFirst task (#1):\n  "${tasks[0].description}"`);
    },
  );

  mcpServer.tool(
    "repl_status",
    "Get the current REPL loop progress - which task is active, what's been completed",
    {},
    async () => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No REPL loop active. Run repl_init first.");

      const current = getCurrentTask(state);
      if (!current && !isLoopComplete(state)) {
        const next = getNextTask(state);
        if (next) {
          next.status = "in_progress";
          next.startedAt = new Date().toISOString();
          state.currentTaskIndex = next.index;
          writeReplState(worktree, state);
        }
      }

      return ok(`✓ REPL Loop Status\n\n${formatProgress(state)}`);
    },
  );

  mcpServer.tool(
    "repl_report",
    "Report the outcome of the current task iteration (pass/fail/skip)",
    {
      result: z.enum(["pass", "fail", "skip"]).describe("Task result"),
      detail: z.string().describe("Result details: test output, error message, or skip reason"),
    },
    async ({ result, detail }) => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No REPL loop active. Run repl_init first.");

      const current = getCurrentTask(state);
      if (!current) {
        if (state.currentTaskIndex >= 0 && state.currentTaskIndex < state.tasks.length) {
          const task = state.tasks[state.currentTaskIndex];
          if (task.status === "pending") task.status = "in_progress";
          return ok(processReplReport(state, task, result, detail));
        }
        return ok("✗ No task is currently in progress. Run repl_status to advance.");
      }

      return ok(processReplReport(state, current, result, detail));
    },
  );

  mcpServer.tool(
    "repl_resume",
    "Detect and resume an interrupted REPL loop from .spavn/repl-state.json",
    {},
    async () => {
      const state = detectIncompleteState(worktree);
      if (!state) return ok("✗ No interrupted REPL loop found.");

      const total = state.tasks.length;
      const passed = state.tasks.filter((t) => t.status === "passed").length;
      const failed = state.tasks.filter((t) => t.status === "failed").length;
      const skipped = state.tasks.filter((t) => t.status === "skipped").length;
      const done = passed + failed + skipped;
      const current = getCurrentTask(state);

      let output = `✓ Interrupted REPL loop detected\n\nPlan: ${state.planFilename}\nProgress: ${done}/${total} tasks`;
      if (current) {
        output += `\n\nInterrupted task (#${current.index + 1}): "${current.description}"`;
      }
      output += "\n\nRun repl_status to continue.";

      return ok(output);
    },
  );

  mcpServer.tool(
    "repl_summary",
    "Generate a formatted summary of the REPL loop results",
    {},
    async () => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No REPL loop data found.");
      return ok(formatSummary(state));
    },
  );

  // ─── Quality gate tools ────────────────────────────────────────────────────

  mcpServer.tool(
    "quality_gate_summary",
    "Aggregate sub-agent quality gate findings into a unified report with go/no-go recommendation",
    {
      scope: z.string().optional().describe("Change scope: trivial, low, standard, high"),
      changedFiles: z.array(z.string()).optional().describe("Changed file paths for auto-classification"),
      testing: z.string().optional().describe("Raw report from testing sub-agent"),
      security: z.string().optional().describe("Raw report from security sub-agent"),
      audit: z.string().optional().describe("Raw report from audit sub-agent"),
      perf: z.string().optional().describe("Raw report from perf sub-agent"),
      devops: z.string().optional().describe("Raw report from devops sub-agent"),
      docsWriter: z.string().optional().describe("Raw report from docs-writer sub-agent"),
    },
    async (args) => {
      let resolvedScope = args.scope ?? "unknown";
      if (args.changedFiles && args.changedFiles.length > 0) {
        const classification = classifyChangeScope(args.changedFiles);
        resolvedScope = classification.scope;
      }

      const agentEntries: [string, string | undefined][] = [
        ["testing", args.testing],
        ["security", args.security],
        ["audit", args.audit],
        ["perf", args.perf],
        ["devops", args.devops],
        ["docs-writer", args.docsWriter],
      ];

      const reports: Array<{ agent: string; raw: string }> = [];
      for (const [agent, raw] of agentEntries) {
        if (raw) reports.push({ agent, raw });
      }

      if (reports.length === 0) {
        return ok("✗ No sub-agent reports provided.");
      }

      // Simple aggregation: count severity markers
      let hasCritical = false;
      let hasHigh = false;
      let hasMedium = false;
      const lines: string[] = [];
      lines.push("✓ Quality Gate Summary");
      lines.push(`\nScope: ${resolvedScope}`);
      lines.push(`Agents: ${reports.map((r) => r.agent).join(", ")}`);

      for (const { agent, raw } of reports) {
        const criticalCount = (raw.match(/\[(CRITICAL|BLOCKING|ERROR)\]/gi) || []).length;
        const highCount = (raw.match(/\[HIGH\]/gi) || []).length;
        const mediumCount = (raw.match(/\[(MEDIUM|WARNING|SUGGESTION)\]/gi) || []).length;
        if (criticalCount > 0) hasCritical = true;
        if (highCount > 0) hasHigh = true;
        if (mediumCount > 0) hasMedium = true;
        lines.push(`\n**@${agent}**: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium`);
      }

      const recommendation = hasCritical || hasHigh ? "NO-GO" : hasMedium ? "GO-WITH-WARNINGS" : "GO";
      lines.push(`\n**Recommendation: ${recommendation}**`);

      // Persist state
      const qgDir = path.join(worktree, ".spavn");
      fs.mkdirSync(qgDir, { recursive: true });
      fs.writeFileSync(path.join(qgDir, "quality-gate.json"), JSON.stringify({
        timestamp: new Date().toISOString(),
        scope: resolvedScope,
        recommendation,
        agents: reports.map((r) => r.agent),
      }, null, 2));

      return ok(lines.join("\n"));
    },
  );

  mcpServer.tool(
    "quality_report",
    "Record an individual quality check result (testing/security/audit/perf/docs)",
    {
      agent: z.enum(["testing", "security", "audit", "perf", "devops", "docs-writer"]).describe("Agent that produced the report"),
      verdict: z.string().describe("Overall verdict (e.g., PASS, FAIL, PASS WITH WARNINGS)"),
      findings: z.string().describe("Detailed findings in markdown"),
    },
    async ({ agent, verdict, findings }) => {
      const qgDir = path.join(worktree, ".spavn");
      fs.mkdirSync(qgDir, { recursive: true });

      const reportsDir = path.join(qgDir, "quality-reports");
      fs.mkdirSync(reportsDir, { recursive: true });

      const filename = `${agent}-${new Date().toISOString().split("T")[0]}.md`;
      const content = `# Quality Report: ${agent}\n\n**Verdict:** ${verdict}\n\n## Findings\n\n${findings}`;
      fs.writeFileSync(path.join(reportsDir, filename), content);

      return ok(`✓ Quality report saved: ${filename}\n\nVerdict: ${verdict}`);
    },
  );

  mcpServer.tool(
    "quality_finalize",
    "Mark quality gate as complete and update plan status",
    {
      planFilename: z.string().optional().describe("Plan filename to update status"),
      recommendation: z.enum(["GO", "NO-GO", "GO-WITH-WARNINGS"]).describe("Final quality gate recommendation"),
    },
    async ({ planFilename, recommendation }) => {
      // Update quality-gate.json with final status
      const qgPath = path.join(worktree, ".spavn", "quality-gate.json");
      let qgState: Record<string, unknown> = {};
      if (fs.existsSync(qgPath)) {
        try { qgState = JSON.parse(fs.readFileSync(qgPath, "utf-8")); } catch { /* fresh */ }
      }
      qgState.finalizedAt = new Date().toISOString();
      qgState.recommendation = recommendation;
      qgState.status = "complete";
      fs.writeFileSync(qgPath, JSON.stringify(qgState, null, 2));

      // Update plan status if provided
      if (planFilename) {
        const planPath = path.join(worktree, ".spavn", "plans", planFilename);
        if (fs.existsSync(planPath)) {
          let content = fs.readFileSync(planPath, "utf-8");
          content = content.replace(/status:\s*\w+/, `status: quality-${recommendation.toLowerCase()}`);
          fs.writeFileSync(planPath, content);
        }
      }

      return ok(`✓ Quality gate finalized: ${recommendation}`);
    },
  );

  // ─── Agent/engine tools ────────────────────────────────────────────────────

  mcpServer.tool(
    "agent_list",
    "List all registered agents with their mode, description, and available tools",
    {
      mode: z.enum(["primary", "subagent"]).optional().describe("Filter by agent mode"),
    },
    async (args) => {
      try {
        const engine = await getEngine();
        const filter = args.mode ? { mode: args.mode } : undefined;
        const agents = engine.listAgents(filter);

        if (agents.length === 0) return ok("✗ No agents found. Run 'npx spavn-agents install' first.");

        const lines = agents.map((a) => {
          const tools = engine.getAgentTools(a.id);
          const enabledTools = tools.filter((t) => t.allowed).map((t) => t.tool_name);
          return `- **${a.id}** (${a.mode}) — ${a.description}\n  Tools: ${enabledTools.join(", ") || "none"}`;
        });

        return ok(`✓ ${agents.length} agents:\n\n${lines.join("\n\n")}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "agent_get",
    "Get single agent details from the engine database",
    {
      agentId: z.string().describe("Agent identifier"),
    },
    async ({ agentId }) => {
      try {
        const engine = await getEngine();
        const agent = engine.getAgent(agentId);

        if (!agent) {
          const all = engine.listAgents();
          return ok(`✗ Agent not found: ${agentId}\n\nAvailable: ${all.map((a) => a.id).join(", ")}`);
        }

        const tools = engine.getAgentTools(agentId);
        const enabledTools = tools.filter((t) => t.allowed).map((t) => t.tool_name);
        const disabledTools = tools.filter((t) => !t.allowed).map((t) => t.tool_name);

        return ok(`✓ Agent: ${agent.id}\n\nMode: ${agent.mode}\nDescription: ${agent.description}\nTemperature: ${agent.temperature}\nEnabled tools: ${enabledTools.join(", ") || "none"}\nDisabled tools: ${disabledTools.join(", ") || "none"}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Task tools ─────────────────────────────────────────────────────────────

  mcpServer.tool(
    "task_finalize",
    "Finalize implementation - commit, push, and create pull request",
    {
      commitMessage: z.string().describe("Commit message"),
    },
    async ({ commitMessage }) => {
      try {
        await exec("git", ["add", "-A"], { cwd: worktree, nothrow: true });
        const result = await exec("git", ["commit", "-m", commitMessage], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          return ok(`✓ Committed: ${commitMessage.substring(0, 50)}...`);
        } else {
          return ok(`✗ Commit failed: ${result.stderr}`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Coordination tools (Phase 2) ──────────────────────────────────────────

  mcpServer.tool(
    "coordinate_tasks",
    "Read an approved plan, break into a task list, write to .spavn/tasks.json",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    async ({ planFilename }) => {
      try {
        return ok(coordinateTasks(worktree, planFilename));
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "coordinate_assign_skills",
    "Assign enhanced skills to specific tasks",
    {
      assignments: z.array(z.object({
        taskId: z.number().describe("Task ID"),
        skill: z.string().describe("Skill name to assign"),
      })).describe("Array of task-to-skill assignments"),
    },
    async ({ assignments }) => {
      try {
        return ok(coordinateAssignSkills(worktree, assignments));
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "coordinate_status",
    "Show current task breakdown with assignments",
    {},
    async () => {
      try {
        return ok(coordinateStatus(worktree));
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Git extras (Phase 2) ──────────────────────────────────────────────────

  mcpServer.tool(
    "git_commit",
    "Commit staged changes with a message",
    {
      message: z.string().describe("Commit message"),
      addAll: z.boolean().optional().describe("Stage all changes before committing (default: false)"),
    },
    async ({ message, addAll = false }) => {
      try {
        if (addAll) {
          await exec("git", ["add", "-A"], { cwd: worktree });
        }

        const result = await exec("git", ["commit", "-m", message], { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          const { stdout: hashOut } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: worktree, nothrow: true });
          return ok(`✓ Committed: ${hashOut.trim()} — ${message}`);
        } else {
          return ok(`✗ Commit failed: ${result.stderr}`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "git_pr",
    "Create a pull request via GitHub CLI",
    {
      title: z.string().describe("PR title"),
      body: z.string().optional().describe("PR body in markdown"),
      baseBranch: z.string().optional().describe("Base branch (default: auto-detect)"),
      draft: z.boolean().optional().describe("Create as draft PR"),
    },
    async ({ title, body, baseBranch, draft = false }) => {
      try {
        // Push current branch
        const { stdout: branchOut } = await exec("git", ["branch", "--show-current"], { cwd: worktree, nothrow: true });
        const currentBranch = branchOut.trim();

        await exec("git", ["push", "-u", "origin", currentBranch], { cwd: worktree, nothrow: true });

        const ghArgs = ["pr", "create", "--title", title];
        if (body) ghArgs.push("--body", body);
        if (baseBranch) ghArgs.push("--base", baseBranch);
        if (draft) ghArgs.push("--draft");

        const result = await exec("gh", ghArgs, { cwd: worktree, nothrow: true });
        if (result.exitCode === 0) {
          return ok(`✓ PR created: ${result.stdout.trim()}`);
        } else {
          return ok(`✗ PR creation failed: ${result.stderr}`);
        }
      } catch (error) {
        return err(error);
      }
    },
  );

  mcpServer.tool(
    "git_status",
    "Enhanced git status: branch + uncommitted changes + remote tracking",
    {},
    async () => {
      try {
        const lines: string[] = [];

        // Current branch
        const { stdout: branchOut } = await exec("git", ["branch", "--show-current"], { cwd: worktree, nothrow: true });
        const branch = branchOut.trim() || "(detached HEAD)";
        lines.push(`Branch: ${branch}`);

        // Status
        const { stdout: statusOut } = await exec("git", ["status", "--porcelain"], { cwd: worktree, nothrow: true });
        const statusLines = statusOut.trim().split("\n").filter((l) => l);
        const staged = statusLines.filter((l) => l[0] !== " " && l[0] !== "?").length;
        const unstaged = statusLines.filter((l) => l[1] !== " " && l[1] !== "?" && l[0] !== "?").length;
        const untracked = statusLines.filter((l) => l.startsWith("??")).length;

        if (staged + unstaged + untracked === 0) {
          lines.push("Working tree: clean");
        } else {
          lines.push(`Changes: ${staged} staged, ${unstaged} unstaged, ${untracked} untracked`);
        }

        // Remote tracking
        try {
          const { stdout: trackOut } = await exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { cwd: worktree, nothrow: true });
          const [ahead, behind] = trackOut.trim().split(/\s+/);
          if (parseInt(ahead) > 0 || parseInt(behind) > 0) {
            lines.push(`Remote: ${ahead} ahead, ${behind} behind`);
          } else {
            lines.push("Remote: up to date");
          }
        } catch {
          lines.push("Remote: no upstream configured");
        }

        return ok(`✓ Git Status\n\n${lines.join("\n")}`);
      } catch (error) {
        return err(error);
      }
    },
  );

  // ─── Execute aliases (Phase 3) ─────────────────────────────────────────────
  // Map execute_* to repl_* logic, keeping old names as well.

  mcpServer.tool(
    "execute_init",
    "Initialize an execution loop from a plan (alias for repl_init)",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
      buildCommand: z.string().optional().describe("Override auto-detected build command"),
      testCommand: z.string().optional().describe("Override auto-detected test command"),
      maxRetries: z.number().optional().describe("Max retries per failing task (default: 3)"),
    },
    async (args) => {
      // Delegate to repl_init logic
      const config = readSpavnConfig(worktree);
      const { planFilename, buildCommand, testCommand, maxRetries = config.maxRetries ?? 3 } = args;

      const plansDir = path.join(worktree, ".spavn", "plans");
      const planPath = path.resolve(plansDir, planFilename);
      const resolvedPlansDir = path.resolve(plansDir);

      if (!planPath.startsWith(resolvedPlansDir + path.sep)) return ok("✗ Error: Invalid plan filename.");
      if (!fs.existsSync(planPath)) return ok(`✗ Error: Plan not found: ${planFilename}`);

      const planContent = fs.readFileSync(planPath, "utf-8");
      const parsedTasks = parseTasksWithAC(planContent);
      if (parsedTasks.length === 0) return ok(`✗ Error: No tasks found in plan: ${planFilename}`);

      const detected = await detectCommands(worktree);
      const tasks: ReplTask[] = parsedTasks.map((parsed, i) => ({
        index: i,
        description: parsed.description,
        acceptanceCriteria: parsed.acceptanceCriteria,
        status: "pending" as const,
        retries: 0,
        iterations: [],
      }));

      const state: ReplState = {
        version: 1,
        planFilename,
        startedAt: new Date().toISOString(),
        buildCommand: buildCommand ?? detected.buildCommand,
        testCommand: testCommand ?? detected.testCommand,
        lintCommand: detected.lintCommand,
        maxRetries,
        currentTaskIndex: -1,
        tasks,
      };

      writeReplState(worktree, state);
      return ok(`✓ Execution loop initialized\n\nPlan: ${planFilename}\nTasks: ${tasks.length}`);
    },
  );

  mcpServer.tool(
    "execute_task",
    "Get current execution progress and next task (alias for repl_status)",
    {},
    async () => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No execution loop active. Run execute_init first.");

      const current = getCurrentTask(state);
      if (!current && !isLoopComplete(state)) {
        const next = getNextTask(state);
        if (next) {
          next.status = "in_progress";
          next.startedAt = new Date().toISOString();
          state.currentTaskIndex = next.index;
          writeReplState(worktree, state);
        }
      }

      return ok(`✓ Execution Status\n\n${formatProgress(state)}`);
    },
  );

  mcpServer.tool(
    "execute_report",
    "Report execution task outcome (alias for repl_report)",
    {
      result: z.enum(["pass", "fail", "skip"]).describe("Task result"),
      detail: z.string().describe("Result details"),
    },
    async ({ result, detail }) => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No execution loop active.");

      const current = getCurrentTask(state);
      if (!current) {
        if (state.currentTaskIndex >= 0 && state.currentTaskIndex < state.tasks.length) {
          const task = state.tasks[state.currentTaskIndex];
          if (task.status === "pending") task.status = "in_progress";
          return ok(processReplReport(state, task, result, detail));
        }
        return ok("✗ No task is currently in progress.");
      }

      return ok(processReplReport(state, current, result, detail));
    },
  );

  mcpServer.tool(
    "execute_resume",
    "Resume an interrupted execution loop (alias for repl_resume)",
    {},
    async () => {
      const state = detectIncompleteState(worktree);
      if (!state) return ok("✗ No interrupted execution loop found.");

      const total = state.tasks.length;
      const done = state.tasks.filter((t) => t.status !== "pending" && t.status !== "in_progress").length;
      const current = getCurrentTask(state);

      let output = `✓ Interrupted execution loop detected\n\nPlan: ${state.planFilename}\nProgress: ${done}/${total}`;
      if (current) output += `\n\nInterrupted: #${current.index + 1} "${current.description}"`;
      output += "\n\nRun execute_task to continue.";
      return ok(output);
    },
  );

  mcpServer.tool(
    "execute_summary",
    "Generate execution loop results summary (alias for repl_summary)",
    {},
    async () => {
      const state = readReplState(worktree);
      if (!state) return ok("✗ No execution loop data found.");
      return ok(formatSummary(state));
    },
  );

  mcpServer.tool(
    "quality_gate",
    "Run quality gate aggregation (alias for quality_gate_summary)",
    {
      scope: z.string().optional().describe("Change scope"),
      changedFiles: z.array(z.string()).optional().describe("Changed file paths"),
      testing: z.string().optional().describe("Testing report"),
      security: z.string().optional().describe("Security report"),
      audit: z.string().optional().describe("Audit report"),
      perf: z.string().optional().describe("Perf report"),
      devops: z.string().optional().describe("DevOps report"),
      docsWriter: z.string().optional().describe("Docs report"),
    },
    async (args) => {
      // Delegate to quality_gate_summary logic (same implementation)
      let resolvedScope = args.scope ?? "unknown";
      if (args.changedFiles && args.changedFiles.length > 0) {
        resolvedScope = classifyChangeScope(args.changedFiles).scope;
      }

      const entries: [string, string | undefined][] = [
        ["testing", args.testing], ["security", args.security], ["audit", args.audit],
        ["perf", args.perf], ["devops", args.devops], ["docs-writer", args.docsWriter],
      ];

      const reports = entries.filter(([, raw]) => raw).map(([agent, raw]) => ({ agent, raw: raw! }));
      if (reports.length === 0) return ok("✗ No sub-agent reports provided.");

      let hasCritical = false, hasHigh = false, hasMedium = false;
      const lines = [`✓ Quality Gate\n\nScope: ${resolvedScope}\nAgents: ${reports.map((r) => r.agent).join(", ")}`];

      for (const { agent, raw } of reports) {
        const c = (raw.match(/\[(CRITICAL|BLOCKING|ERROR)\]/gi) || []).length;
        const h = (raw.match(/\[HIGH\]/gi) || []).length;
        const m = (raw.match(/\[(MEDIUM|WARNING|SUGGESTION)\]/gi) || []).length;
        if (c) hasCritical = true;
        if (h) hasHigh = true;
        if (m) hasMedium = true;
        lines.push(`\n**@${agent}**: ${c} critical, ${h} high, ${m} medium`);
      }

      const rec = hasCritical || hasHigh ? "NO-GO" : hasMedium ? "GO-WITH-WARNINGS" : "GO";
      lines.push(`\n**Recommendation: ${rec}**`);
      return ok(lines.join("\n"));
    },
  );

  // ─── Helper: REPL report processing ────────────────────────────────────────

  function processReplReport(
    state: ReplState,
    task: ReplTask,
    result: "pass" | "fail" | "skip",
    detail: string,
  ): string {
    task.iterations.push({
      at: new Date().toISOString(),
      result,
      detail: detail.substring(0, 2000),
    });

    const taskNum = task.index + 1;
    let output: string;

    switch (result) {
      case "pass": {
        task.status = "passed";
        task.completedAt = new Date().toISOString();
        output = `✓ Task #${taskNum} PASSED\n  "${task.description}"`;
        break;
      }
      case "fail": {
        task.retries += 1;
        if (task.retries >= state.maxRetries) {
          task.status = "failed";
          task.completedAt = new Date().toISOString();
          output = `✗ Task #${taskNum} FAILED — retries exhausted\n  "${task.description}"`;
        } else {
          const remaining = state.maxRetries - task.retries;
          output = `⚠ Task #${taskNum} FAILED (${remaining} retries remaining)\n  "${task.description}"`;
          writeReplState(worktree, state);
          return output;
        }
        break;
      }
      case "skip": {
        task.status = "skipped";
        task.completedAt = new Date().toISOString();
        output = `⊘ Task #${taskNum} SKIPPED\n  "${task.description}"`;
        break;
      }
    }

    const next = getNextTask(state);
    if (next) {
      next.status = "in_progress";
      next.startedAt = new Date().toISOString();
      state.currentTaskIndex = next.index;
      output += `\n\n→ Next: Task #${next.index + 1} "${next.description}"`;
    } else {
      state.currentTaskIndex = -1;
      state.completedAt = new Date().toISOString();
      output += "\n\n✓ All tasks complete.";
    }

    writeReplState(worktree, state);
    return output;
  }

  // Start server on stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
