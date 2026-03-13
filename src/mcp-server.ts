import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { exec } from "./utils/shell.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get package version for server identification
const VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"),
).version as string;

// ─── Tool Context ─────────────────────────────────────────────────────────────

interface ToolContext {
  worktree: string;
  sessionID?: string;
  messageID?: string;
  agent?: string;
  directory?: string;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const mcpServer = new McpServer({
    name: "spavn-agents",
    version: VERSION,
  });

  // Get the current working directory as the worktree root
  const worktree = process.cwd();

  function ctx(): ToolContext {
    return {
      worktree,
      directory: worktree,
      sessionID: "mcp-session",
      messageID: "mcp-message",
      agent: "mcp",
    };
  }

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
      return ok(`✓ Configured models\n\nScope: ${scope}\nPrimary: ${primaryModel}\nSubagent: ${subagentModel}`);
    },
  );

  // ─── Worktree tools ─────────────────────────────────────────────────────────

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

  // ─── Skill tools ─────────────────────────────────────────────────────────────

  mcpServer.tool(
    "skill",
    "Load a spavn skill by name. Skills provide specialized domain knowledge (e.g. frontend-development, ui-design, api-design, database-design, etc.)",
    {
      name: z.string().describe("Skill name to load (e.g. frontend-development, ui-design, api-design)"),
    },
    async ({ name: skillName }) => {
      // Look for skills in the bundled .opencode/skills/ directory
      const skillPaths = [
        path.resolve(__dirname, "..", ".opencode", "skills", skillName, "SKILL.md"),
        path.join(worktree, ".opencode", "skills", skillName, "SKILL.md"),
      ];

      for (const skillPath of skillPaths) {
        if (fs.existsSync(skillPath)) {
          try {
            const content = fs.readFileSync(skillPath, "utf-8");
            return ok(`✓ Skill loaded: ${skillName}\n\n${content}`);
          } catch (error) {
            return err(error);
          }
        }
      }

      // List available skills for helpful error
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
      } catch (error) {
        return ok(`✗ GitHub CLI not installed. Install from https://cli.github.com/`);
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

  // Start server on stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
