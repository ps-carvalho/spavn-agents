import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as spavnHandlers from "./tools/handlers/spavn.js";
import * as worktreeHandlers from "./tools/handlers/worktree.js";
import * as branchHandlers from "./tools/handlers/branch.js";
import * as planHandlers from "./tools/handlers/plan.js";
import * as sessionHandlers from "./tools/handlers/session.js";
import * as docsHandlers from "./tools/handlers/docs.js";
import * as skillHandlers from "./tools/handlers/skill.js";
import * as agentHandlers from "./tools/handlers/agent.js";
import * as githubHandlers from "./tools/handlers/github.js";
import * as replHandlers from "./tools/handlers/repl.js";
import * as qgHandlers from "./tools/handlers/quality-gate.js";
import * as taskHandlers from "./tools/handlers/task.js";
import * as gitHandlers from "./tools/handlers/git.js";
import {
  coordinateTasks,
  coordinateAssignSkills,
  coordinateStatus,
} from "./tools/coordinate.js";
import { SpavnCodeBridge } from "./utils/spavn-code-bridge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get package version for server identification
const VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"),
).version as string;

// ─── MCP Server ──────────────────────────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const mcpServer = new McpServer({
    name: "spavn-agents",
    version: VERSION,
  });

  // Get the current working directory as the worktree root
  const worktree = process.cwd();

  // Bundled skills directory for skill handler
  const bundledDir = path.resolve(__dirname, "..");

  // ── Spavn Code bridge (fire-and-forget, no-op outside Spavn Code) ──
  const bridge = new SpavnCodeBridge();
  let bridgeFirstCall = true;

  function ok(text: string) {
    return { content: [{ type: "text" as const, text }] };
  }

  function err(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
  }

  /**
   * Wrap a tool handler to emit SpavnCodeBridge events.
   * - Fires `taskStarted` on the very first tool call
   * - Fires `toolCall` for every invocation
   * - Fires `error` if the tool returns an error result
   */
  function bridgeTool<T>(
    toolName: string,
    handler: (args: T) => Promise<{ content: { type: "text"; text: string }[]; isError?: true }>,
  ) {
    return async (args: T) => {
      if (bridgeFirstCall) {
        bridge.taskStarted();
        bridgeFirstCall = false;
      }
      bridge.toolCall(toolName, toolName, args);

      const result = await handler(args);

      // Check for error results
      const text = result.content[0]?.text ?? "";
      if (text.startsWith("✗") || result.isError) {
        bridge.error(text.split("\n")[0].substring(0, 200));
      }

      return result;
    };
  }

  // ─── Spavn tools ────────────────────────────────────────────────────────────

  mcpServer.tool(
    "spavn_init",
    "Initialize .spavn directory in project root for plan storage, session history, and configuration",
    {},
    async () => {
      const r = spavnHandlers.executeInit(worktree);
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "spavn_status",
    "Check .spavn directory status - whether it exists, plan count, session count",
    {},
    async () => {
      const r = spavnHandlers.executeStatus(worktree);
      return ok(r.text);
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
      const r = spavnHandlers.executeConfigure(worktree, { scope, primaryModel, subagentModel });
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = await worktreeHandlers.executeCreate(worktree, { name, type, fromBranch });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "worktree_list",
    "List all git worktrees for the repository",
    {},
    async () => {
      const r = await worktreeHandlers.executeList(worktree);
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = await worktreeHandlers.executeRemove(worktree, { name, deleteBranch });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "worktree_open",
    "Open a git worktree in the default editor or file explorer",
    {
      name: z.string().describe("Worktree name to open"),
    },
    async ({ name: worktreeName }) => {
      const r = worktreeHandlers.executeOpen(worktree, { name: worktreeName });
      return ok(r.text);
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
      const r = await branchHandlers.executeCreate(worktree, { name, type });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "branch_status",
    "Get current git branch status",
    {},
    async () => {
      const r = await branchHandlers.executeStatus(worktree);
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "branch_switch",
    "Switch to an existing git branch",
    {
      branch: z.string().describe("Branch name to switch to"),
    },
    async ({ branch }) => {
      const r = await branchHandlers.executeSwitch(worktree, { branch });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  // ─── Plan tools ─────────────────────────────────────────────────────────────

  mcpServer.tool(
    "plan_list",
    "List all plans in .spavn/plans/ with preview",
    {
      limit: z.number().optional().describe("Maximum number of plans to return"),
    },
    async ({ limit }) => {
      const r = planHandlers.executeList(worktree, { limit });
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "plan_load",
    "Load a full plan by filename",
    {
      filename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    async ({ filename }) => {
      const r = planHandlers.executeLoad(worktree, { filename });
      return r.ok ? ok(r.text) : err(r.text);
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
    bridgeTool("plan_save", async ({ title, type, content }) => {
      const r = planHandlers.executeSave(worktree, { title, type, content });
      return r.ok ? ok(r.text) : err(r.text);
    }),
  );

  mcpServer.tool(
    "plan_delete",
    "Delete a plan file",
    {
      filename: z.string().describe("Plan filename to delete"),
    },
    async ({ filename }) => {
      const r = planHandlers.executeDelete(worktree, { filename });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "plan_commit",
    "Stage and commit .spavn/ plan artifacts on the current branch. Writes a suggested branch name into frontmatter for handoff.",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    bridgeTool("plan_commit", async ({ planFilename }) => {
      const r = await planHandlers.executeCommit(worktree, { planFilename });
      return r.ok ? ok(r.text) : err(r.text);
    }),
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
    bridgeTool("plan_start", async ({ title, type, issueRef }) => {
      return ok(planHandlers.executePlanStart(worktree, { title, type, issueRef }));
    }),
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
      return ok(planHandlers.executePlanInterview(worktree, { planFilename, question, answer }));
    },
  );

  mcpServer.tool(
    "plan_approve",
    "Update plan status from draft to approved",
    {
      planFilename: z.string().describe("Plan filename from .spavn/plans/"),
    },
    bridgeTool("plan_approve", async ({ planFilename }) => {
      return ok(planHandlers.executePlanApprove(worktree, { planFilename }));
    }),
  );

  mcpServer.tool(
    "plan_edit",
    "Edit a plan file: overwrite content while preserving/updating frontmatter updated timestamp",
    {
      filename: z.string().describe("Plan filename from .spavn/plans/"),
      content: z.string().describe("New plan content"),
    },
    bridgeTool("plan_edit", async ({ filename, content }) => {
      return ok(planHandlers.executePlanEdit(worktree, { filename, content }));
    }),
  );

  // ─── Session tools ──────────────────────────────────────────────────────────

  mcpServer.tool(
    "session_list",
    "List recent session summaries from .spavn/sessions/",
    {
      limit: z.number().optional().describe("Maximum number of sessions to return"),
    },
    async ({ limit }) => {
      const r = sessionHandlers.executeList(worktree, { limit });
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "session_load",
    "Load a session summary by filename",
    {
      filename: z.string().describe("Session filename"),
    },
    async ({ filename }) => {
      const r = sessionHandlers.executeLoad(worktree, { filename });
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = sessionHandlers.executeSave(worktree, { summary, decisions });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  // ─── Documentation tools ────────────────────────────────────────────────────

  mcpServer.tool(
    "docs_init",
    "Initialize docs directory with decision/feature/flow subdirectories",
    {},
    async () => {
      const r = docsHandlers.executeInit(worktree);
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = docsHandlers.executeSave(worktree, { title, type, content, tags, relatedFiles });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "docs_list",
    "List all documentation files organized by type",
    {},
    async () => {
      const r = docsHandlers.executeList(worktree);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "docs_index",
    "Rebuild docs/INDEX.md with links to all documentation files",
    {},
    async () => {
      const r = docsHandlers.executeIndex(worktree);
      return ok(r.text);
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
    async ({ name, mode }) => {
      const r = skillHandlers.executeLoad(worktree, { name, mode }, bundledDir);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "skill_get",
    "Retrieve the full content of a domain skill by ID from the engine database",
    {
      skillId: z.string().describe("The skill identifier"),
    },
    async ({ skillId }) => {
      const r = await skillHandlers.executeGet({ skillId });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "skill_list",
    "List all available skills with metadata",
    {},
    async () => {
      const r = await skillHandlers.executeSkillList();
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  // ─── GitHub tools ───────────────────────────────────────────────────────────

  mcpServer.tool(
    "github_status",
    "Check GitHub CLI availability and authentication",
    {},
    async () => {
      const r = await githubHandlers.executeStatus(worktree);
      return ok(r.text);
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
      const r = await githubHandlers.executeIssues(worktree, args);
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = await githubHandlers.executeProjects(worktree, args);
      return r.ok ? ok(r.text) : err(r.text);
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
    bridgeTool("repl_init", async (args) => {
      const r = await replHandlers.executeInit(worktree, args);
      return ok(r.text);
    }),
  );

  mcpServer.tool(
    "repl_status",
    "Get the current REPL loop progress - which task is active, what's been completed",
    {},
    async () => {
      const r = replHandlers.executeStatus(worktree);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "repl_report",
    "Report the outcome of the current task iteration (pass/fail/skip)",
    {
      result: z.enum(["pass", "fail", "skip"]).describe("Task result"),
      detail: z.string().describe("Result details: test output, error message, or skip reason"),
      taskIndex: z.number().optional().describe("Zero-based task index (required for parallel batches, defaults to current task)"),
    },
    bridgeTool("repl_report", async ({ result, detail, taskIndex }) => {
      const r = replHandlers.executeReport(worktree, { result, detail, taskIndex });
      if (r.interactionNeeded) {
        bridge.interactionNeeded("retries_exhausted", r.interactionReason || "Task failed");
      }
      return ok(r.text);
    }),
  );

  mcpServer.tool(
    "repl_resume",
    "Detect and resume an interrupted REPL loop from .spavn/repl-state.json",
    {},
    async () => {
      const r = replHandlers.executeResume(worktree);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "repl_summary",
    "Generate a formatted summary of the REPL loop results",
    {},
    async () => {
      const r = replHandlers.executeSummary(worktree);
      return ok(r.text);
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
    bridgeTool("quality_gate_summary", async (args) => {
      const r = qgHandlers.executeSummary(worktree, args);
      return ok(r.text);
    }),
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
      const r = qgHandlers.executeReport(worktree, { agent, verdict, findings });
      return ok(r.text);
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
      const r = qgHandlers.executeFinalize(worktree, { planFilename, recommendation });
      return ok(r.text);
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
      const r = await agentHandlers.executeList(args);
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "agent_get",
    "Get single agent details from the engine database",
    {
      agentId: z.string().describe("Agent identifier"),
    },
    async ({ agentId }) => {
      const r = await agentHandlers.executeGet({ agentId });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  // ─── Task tools ─────────────────────────────────────────────────────────────

  mcpServer.tool(
    "task_finalize",
    "Finalize implementation - commit, push, and create pull request",
    {
      commitMessage: z.string().describe("Commit message"),
    },
    bridgeTool("task_finalize", async ({ commitMessage }) => {
      const r = await taskHandlers.executeFinalize(worktree, { commitMessage });
      if (r.ok && r.text.startsWith("✓")) bridge.taskFinished();
      return r.ok ? ok(r.text) : err(r.text);
    }),
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
      const r = await gitHandlers.executeCommit(worktree, { message, addAll });
      return r.ok ? ok(r.text) : err(r.text);
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
      const r = await gitHandlers.executePr(worktree, { title, body, baseBranch, draft });
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  mcpServer.tool(
    "git_status",
    "Enhanced git status: branch + uncommitted changes + remote tracking",
    {},
    async () => {
      const r = await gitHandlers.executeGitStatus(worktree);
      return r.ok ? ok(r.text) : err(r.text);
    },
  );

  // ─── Execute aliases (Phase 3) ─────────────────────────────────────────────
  // Map execute_* to repl_* handlers, keeping old names as well.

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
      const r = await replHandlers.executeInit(worktree, args);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "execute_task",
    "Get current execution progress and next task (alias for repl_status)",
    {},
    async () => {
      const r = replHandlers.executeStatus(worktree);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "execute_report",
    "Report execution task outcome (alias for repl_report)",
    {
      result: z.enum(["pass", "fail", "skip"]).describe("Task result"),
      detail: z.string().describe("Result details"),
      taskIndex: z.number().optional().describe("Zero-based task index for parallel batches"),
    },
    async ({ result, detail, taskIndex }) => {
      const r = replHandlers.executeReport(worktree, { result, detail, taskIndex });
      if (r.interactionNeeded) {
        bridge.interactionNeeded("retries_exhausted", r.interactionReason || "Task failed");
      }
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "execute_resume",
    "Resume an interrupted execution loop (alias for repl_resume)",
    {},
    async () => {
      const r = replHandlers.executeResume(worktree);
      return ok(r.text);
    },
  );

  mcpServer.tool(
    "execute_summary",
    "Generate execution loop results summary (alias for repl_summary)",
    {},
    async () => {
      const r = replHandlers.executeSummary(worktree);
      return ok(r.text);
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
      const r = qgHandlers.executeSummary(worktree, args);
      return ok(r.text);
    },
  );

  // Start server on stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
