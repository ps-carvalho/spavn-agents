import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// ─── Tool Handler Interface ───────────────────────────────────────────────────

interface ToolHandler {
  (args: Record<string, unknown>, context: ToolContext): Promise<string>;
}

interface ToolSpec {
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

// ─── Tool Implementations ─────────────────────────────────────────────────────
// These are stub implementations that demonstrate MCP functionality
// In production, they would wrap the actual tool implementations from src/tools/

const TOOL_REGISTRY: Record<string, ToolSpec> = {
  // Spavn tools
  spavn_init: {
    description: "Initialize .spavn directory in project root for plan storage, session history, and configuration",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      const spavnPath = path.join(context.worktree, ".spavn");
      try {
        if (!fs.existsSync(spavnPath)) {
          fs.mkdirSync(spavnPath, { recursive: true });
          fs.mkdirSync(path.join(spavnPath, "plans"), { recursive: true });
          fs.mkdirSync(path.join(spavnPath, "sessions"), { recursive: true });
          return `✓ Initialized .spavn directory at ${spavnPath}`;
        } else {
          return `✓ .spavn directory already exists at ${spavnPath}`;
        }
      } catch (error) {
        return `✗ Error initializing .spavn: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  spavn_status: {
    description: "Check .spavn directory status - whether it exists, plan count, session count",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      const spavnPath = path.join(context.worktree, ".spavn");
      if (!fs.existsSync(spavnPath)) {
        return `✗ .spavn directory not found at ${spavnPath}\n\nRun spavn_init to initialize.`;
      }

      const plansPath = path.join(spavnPath, "plans");
      const sessionsPath = path.join(spavnPath, "sessions");

      const planCount = fs.existsSync(plansPath)
        ? fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).length
        : 0;
      const sessionCount = fs.existsSync(sessionsPath)
        ? fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).length
        : 0;

      return `✓ .spavn directory status

Location: ${spavnPath}
Plans: ${planCount}
Sessions: ${sessionCount}`;
    },
  },

  spavn_configure: {
    description: "Configure AI models for this project (primary agents and subagents)",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["project", "global"],
          description: "Configuration scope: project-specific or global",
        },
        primaryModel: {
          type: "string",
          description: "Model ID for primary agents",
        },
        subagentModel: {
          type: "string",
          description: "Model ID for subagents",
        },
      },
      required: ["scope", "primaryModel", "subagentModel"],
    },
    handler: async (args) => {
      return `✓ Configured models\n\nScope: ${args.scope}\nPrimary: ${args.primaryModel}\nSubagent: ${args.subagentModel}`;
    },
  },

  // Worktree tools
  worktree_list: {
    description: "List all git worktrees for the repository",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      try {
        const result = await exec("git", ["worktree", "list"], { cwd: context.worktree, nothrow: true });
        if (result.exitCode === 0) {
          return `✓ Git worktrees:\n\n${result.stdout}`;
        } else {
          return `✗ Not a git repository or git worktree list failed`;
        }
      } catch (error) {
        return `✗ Error listing worktrees: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  worktree_open: {
    description: "Open a git worktree in the default editor or file explorer",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Worktree name to open",
        },
      },
      required: ["name"],
    },
    handler: async (args, context) => {
      const worktreeName = args.name as string;
      const worktreePath = path.join(context.worktree, "..", worktreeName);
      if (fs.existsSync(worktreePath)) {
        return `✓ Worktree path: ${worktreePath}`;
      } else {
        return `✗ Worktree not found at ${worktreePath}`;
      }
    },
  },

  // Branch tools
  branch_status: {
    description: "Get current git branch status",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      try {
        const result = await exec("git", ["branch", "--show-current"], { cwd: context.worktree, nothrow: true });
        if (result.exitCode === 0) {
          const branch = result.stdout.trim();
          return `✓ Current branch: ${branch}`;
        } else {
          return `✗ Failed to get branch status`;
        }
      } catch (error) {
        return `✗ Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  branch_switch: {
    description: "Switch to an existing git branch",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Branch name to switch to",
        },
      },
      required: ["branch"],
    },
    handler: async (args, context) => {
      const branch = args.branch as string;
      try {
        const result = await exec("git", ["checkout", branch], { cwd: context.worktree, nothrow: true });
        if (result.exitCode === 0) {
          return `✓ Switched to branch: ${branch}`;
        } else {
          return `✗ Failed to switch branch: ${result.stderr}`;
        }
      } catch (error) {
        return `✗ Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  // Plan tools
  plan_list: {
    description: "List all plans in .spavn/plans/ with preview",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of plans to return",
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const plansPath = path.join(context.worktree, ".spavn", "plans");
      if (!fs.existsSync(plansPath)) {
        return `No plans found. Run spavn_init to initialize.`;
      }

      const files = fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).sort().reverse();
      const limit = (args.limit as number) || 10;
      const limited = files.slice(0, Math.min(limit, files.length));

      if (limited.length === 0) {
        return `No plans saved in .spavn/plans/`;
      }

      let output = `✓ Plans (showing ${limited.length}):\n\n`;
      for (const file of limited) {
        output += `  • ${file}\n`;
      }
      return output;
    },
  },

  plan_load: {
    description: "Load a full plan by filename",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Plan filename from .spavn/plans/",
        },
      },
      required: ["filename"],
    },
    handler: async (args, context) => {
      const filename = args.filename as string;
      const filepath = path.join(context.worktree, ".spavn", "plans", filename);

      if (!fs.existsSync(filepath)) {
        return `✗ Plan not found: ${filename}`;
      }

      try {
        const content = fs.readFileSync(filepath, "utf-8");
        return `✓ Plan: ${filename}\n\n${content}`;
      } catch (error) {
        return `✗ Error loading plan: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  plan_save: {
    description: "Save an implementation plan to .spavn/plans/ with mermaid diagram support",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Plan title",
        },
        type: {
          type: "string",
          enum: ["feature", "bugfix", "refactor", "architecture", "spike", "docs"],
          description: "Plan type",
        },
        content: {
          type: "string",
          description: "Full plan content in markdown",
        },
      },
      required: ["title", "type", "content"],
    },
    handler: async (args, context) => {
      const { title, type, content } = args;
      const plansPath = path.join(context.worktree, ".spavn", "plans");

      try {
        fs.mkdirSync(plansPath, { recursive: true });

        const date = new Date().toISOString().split("T")[0];
        const slug = (title as string).toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
        const filename = `${date}-${type}-${slug}.md`;
        const filepath = path.join(plansPath, filename);

        fs.writeFileSync(filepath, `# ${title}\n\n${content}`);
        return `✓ Plan saved: ${filename}`;
      } catch (error) {
        return `✗ Error saving plan: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  plan_delete: {
    description: "Delete a plan file",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Plan filename to delete",
        },
      },
      required: ["filename"],
    },
    handler: async (args, context) => {
      const filename = args.filename as string;
      const filepath = path.join(context.worktree, ".spavn", "plans", filename);

      if (!fs.existsSync(filepath)) {
        return `✗ Plan not found: ${filename}`;
      }

      try {
        fs.unlinkSync(filepath);
        return `✓ Deleted plan: ${filename}`;
      } catch (error) {
        return `✗ Error deleting plan: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  // Session tools
  session_list: {
    description: "List recent session summaries from .spavn/sessions/",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of sessions to return",
        },
      },
      required: [],
    },
    handler: async (args, context) => {
      const sessionsPath = path.join(context.worktree, ".spavn", "sessions");
      if (!fs.existsSync(sessionsPath)) {
        return `No sessions found. Sessions are created when you use session_save.`;
      }

      const files = fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).sort().reverse();
      const limit = (args.limit as number) || 10;
      const limited = files.slice(0, Math.min(limit, files.length));

      if (limited.length === 0) {
        return `No session summaries found in .spavn/sessions/`;
      }

      let output = `✓ Recent Sessions (showing ${limited.length}):\n\n`;
      for (const file of limited) {
        output += `  • ${file}\n`;
      }
      return output;
    },
  },

  session_load: {
    description: "Load a session summary by filename",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Session filename",
        },
      },
      required: ["filename"],
    },
    handler: async (args, context) => {
      const filename = args.filename as string;
      const filepath = path.join(context.worktree, ".spavn", "sessions", filename);

      if (!fs.existsSync(filepath)) {
        return `✗ Session not found: ${filename}`;
      }

      try {
        const content = fs.readFileSync(filepath, "utf-8");
        return `✓ Session: ${filename}\n\n${content}`;
      } catch (error) {
        return `✗ Error loading session: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  session_save: {
    description: "Save a session summary with key decisions to .spavn/sessions/",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of what was accomplished",
        },
        decisions: {
          type: "array",
          items: { type: "string" },
          description: "List of key decisions made",
        },
      },
      required: ["summary", "decisions"],
    },
    handler: async (args, context) => {
      const { summary, decisions } = args;
      const sessionsPath = path.join(context.worktree, ".spavn", "sessions");

      try {
        fs.mkdirSync(sessionsPath, { recursive: true });

        const date = new Date().toISOString().split("T")[0];
        const sessionId = Math.random().toString(36).substring(2, 10);
        const filename = `${date}-${sessionId}.md`;
        const filepath = path.join(sessionsPath, filename);

        const content = `# Session Summary\n\n${summary}\n\n## Key Decisions\n\n${(decisions as string[]).map((d) => `- ${d}`).join("\n")}`;
        fs.writeFileSync(filepath, content);
        return `✓ Session saved: ${filename}`;
      } catch (error) {
        return `✗ Error saving session: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  // Documentation tools
  docs_init: {
    description: "Initialize docs directory with decision/feature/flow subdirectories",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      const docsPath = path.join(context.worktree, "docs");
      try {
        fs.mkdirSync(path.join(docsPath, "decisions"), { recursive: true });
        fs.mkdirSync(path.join(docsPath, "features"), { recursive: true });
        fs.mkdirSync(path.join(docsPath, "flows"), { recursive: true });
        return `✓ Initialized docs directory at ${docsPath}`;
      } catch (error) {
        return `✗ Error initializing docs: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },

  docs_list: {
    description: "List all documentation files organized by type",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      const docsPath = path.join(context.worktree, "docs");
      if (!fs.existsSync(docsPath)) {
        return `No docs found. Run docs_init to initialize.`;
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
      return output;
    },
  },

  // GitHub tools
  github_status: {
    description: "Check GitHub CLI availability and authentication",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      try {
        const result = await exec("gh", ["auth", "status"], { cwd: context.worktree, nothrow: true });
        if (result.exitCode === 0) {
          return `✓ GitHub CLI authenticated`;
        } else {
          return `✗ GitHub CLI not authenticated. Run: gh auth login`;
        }
      } catch (error) {
        return `✗ GitHub CLI not installed. Install from https://cli.github.com/`;
      }
    },
  },

  // Task tools
  task_finalize: {
    description: "Finalize implementation - commit, push, and create pull request",
    inputSchema: {
      type: "object",
      properties: {
        commitMessage: {
          type: "string",
          description: "Commit message",
        },
      },
      required: ["commitMessage"],
    },
    handler: async (args, context) => {
      const message = args.commitMessage as string;
      try {
        await exec("git", ["add", "-A"], { cwd: context.worktree, nothrow: true });
        const result = await exec("git", ["commit", "-m", message], { cwd: context.worktree, nothrow: true });
        if (result.exitCode === 0) {
          return `✓ Committed: ${message.substring(0, 50)}...`;
        } else {
          return `✗ Commit failed: ${result.stderr}`;
        }
      } catch (error) {
        return `✗ Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
};

// ─── MCP Server ──────────────────────────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const mcpServer = new McpServer({
    name: "spavn-agents",
    version: VERSION,
  });

  // Get the current working directory as the worktree root
  const worktree = process.cwd();

  // Register all tools
  for (const [toolName, spec] of Object.entries(TOOL_REGISTRY)) {
    mcpServer.registerTool(
      toolName,
      {
        description: spec.description,
        inputSchema: spec.inputSchema,
      } as any,
      async (args: any) => {
        try {
          const context: ToolContext = {
            worktree,
            directory: worktree,
            sessionID: "mcp-session",
            messageID: "mcp-message",
            agent: "mcp",
          };
          const result = await spec.handler(args, context);
          return {
            content: [
              {
                type: "text",
                text: result,
              },
            ],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  // Start server on stdio
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}
