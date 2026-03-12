import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { git } from "../utils/shell.js";
import { detectWorktreeInfo, deduplicateBranch } from "../utils/worktree-detect.js";

const WORKTREE_ROOT = ".worktrees";

// Extract client type from the plugin input via inference
type Client = PluginInput["client"];

/**
 * Factory function that creates the worktree_create tool with access
 * to the OpenCode client for toast notifications.
 */
export function createCreate(client: Client) {
  return tool({
    description:
      "Create a new git worktree for isolated development. Worktrees are created in .worktrees/ at the project root.",
    args: {
      name: tool.schema
        .string()
        .describe("Worktree name (e.g., 'auth-feature', 'login-bugfix')"),
      type: tool.schema
        .enum(["feature", "bugfix", "hotfix", "refactor", "spike", "docs", "test"])
        .describe("Type of work - determines branch prefix"),
      fromBranch: tool.schema
        .string()
        .optional()
        .describe(
          "Use an existing branch instead of creating a new one " +
          "(e.g., 'feature/auth' from plan_commit). If set, skips branch creation.",
        ),
    },
    async execute(args, context) {
      const { name, type, fromBranch } = args;
      let branchName = fromBranch || `${type}/${name}`;
      const originalBranch = branchName;
      let deduplicated = false;
      const worktreePath = path.join(context.worktree, WORKTREE_ROOT, name);
      const absoluteWorktreePath = path.resolve(worktreePath);

      // Check if we're in a git repository
      try {
        await git(context.worktree, "rev-parse", "--git-dir");
      } catch {
        return "\u2717 Error: Not in a git repository. Initialize git first.";
      }

      // Check if worktree already exists
      if (fs.existsSync(absoluteWorktreePath)) {
        return `\u2717 Error: Worktree already exists at ${absoluteWorktreePath}

Use worktree_list to see existing worktrees.`;
      }

      // Create parent directory if needed
      const worktreeParent = path.dirname(absoluteWorktreePath);
      if (!fs.existsSync(worktreeParent)) {
        fs.mkdirSync(worktreeParent, { recursive: true });
      }

      // Create the worktree
      if (fromBranch) {
        // Use existing branch — try directly first
        try {
          await git(context.worktree, "worktree", "add", absoluteWorktreePath, fromBranch);
        } catch {
          // Branch might not exist yet — create it
          try {
            await git(context.worktree, "worktree", "add", "-b", fromBranch, absoluteWorktreePath);
          } catch {
            // Both failed — try deduplication
            try {
              const uniqueBranch = await deduplicateBranch(context.worktree, fromBranch);
              await git(context.worktree, "worktree", "add", "-b", uniqueBranch, absoluteWorktreePath);
              branchName = uniqueBranch;
              deduplicated = true;
            } catch (error3: any) {
              try {
                await client.tui.showToast({
                  body: {
                    title: `Worktree: ${name}`,
                    message: `Failed to create from branch '${fromBranch}': ${error3.message || error3}`,
                    variant: "error",
                    duration: 8000,
                  },
                });
              } catch {
                // Toast failure is non-fatal
              }
              return `\u2717 Error creating worktree from branch '${fromBranch}': ${error3.message || error3}`;
            }
          }
        }
      } else {
        // Create with a new branch
        try {
          await git(context.worktree, "worktree", "add", "-b", branchName, absoluteWorktreePath);
        } catch {
          // Branch might already exist, try without -b
          try {
            await git(context.worktree, "worktree", "add", absoluteWorktreePath, branchName);
          } catch {
            // Both failed — try deduplication
            try {
              const uniqueBranch = await deduplicateBranch(context.worktree, branchName);
              await git(context.worktree, "worktree", "add", "-b", uniqueBranch, absoluteWorktreePath);
              branchName = uniqueBranch;
              deduplicated = true;
            } catch (error3: any) {
              try {
                await client.tui.showToast({
                  body: {
                    title: `Worktree: ${name}`,
                    message: `Failed to create: ${error3.message || error3}`,
                    variant: "error",
                    duration: 8000,
                  },
                });
              } catch {
                // Toast failure is non-fatal
              }
              return `\u2717 Error creating worktree: ${error3.message || error3}`;
            }
          }
        }
      }

      // Notify via toast
      const fromLabel = fromBranch ? ` (from existing branch)` : "";
      try {
        await client.tui.showToast({
          body: {
            title: `Worktree: ${name}`,
            message: `Created on branch ${branchName}${fromLabel}`,
            variant: "success",
            duration: 4000,
          },
        });
      } catch {
        // Toast failure is non-fatal
      }

      const dedupeNote = deduplicated
        ? `\n\nNote: Branch '${originalBranch}' was unavailable. Using '${branchName}' instead.`
        : "";

      return `\u2713 Created worktree successfully

Branch: ${branchName}${fromLabel}
Path: ${absoluteWorktreePath}${dedupeNote}

To work in this worktree:
  cd ${absoluteWorktreePath}

Or use worktree_open to get a command to open a new terminal there.`;
    },
  });
}

export const list = tool({
  description: "List all git worktrees for this project",
  args: {},
  async execute(args, context) {
    try {
      const { stdout } = await git(context.worktree, "worktree", "list");

      if (!stdout.trim()) {
        return "No worktrees found.";
      }

      const lines = stdout.trim().split("\n");
      let output = "Git Worktrees:\n\n";

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const worktreePath = parts[0];
        const commit = parts[1];
        const branch = parts[2]?.replace(/[\[\]]/g, "") || "detached";

        const isMain = worktreePath === context.worktree;
        const marker = isMain ? " (main)" : "";

        output += `\u2022 ${branch}${marker}\n`;
        output += `  Path: ${worktreePath}\n`;
        output += `  Commit: ${commit}\n\n`;
      }

      return output.trim();
    } catch (error: any) {
      return `\u2717 Error listing worktrees: ${error.message || error}`;
    }
  },
});

/**
 * Factory function that creates the worktree_remove tool with access
 * to the OpenCode client for toast notifications.
 */
export function createRemove(client: Client) {
  return tool({
    description:
      "Remove a git worktree (after merging). Optionally deletes the branch.",
    args: {
      name: tool.schema.string().describe("Worktree name to remove"),
      deleteBranch: tool.schema
        .boolean()
        .optional()
        .describe("Also delete the associated branch (default: false)"),
    },
    async execute(args, context) {
      const { name, deleteBranch = false } = args;

      // Resolve the main repo root — if we're inside a worktree, context.worktree
      // points to the worktree itself, not the main repo. We need the main repo
      // to construct the correct .worktrees/ path and to run git commands from outside.
      let mainRepoRoot = context.worktree;
      try {
        const info = await detectWorktreeInfo(context.worktree);
        if (info.isWorktree && info.mainWorktreePath) {
          mainRepoRoot = info.mainWorktreePath;
        }
      } catch {
        // Fall back to context.worktree
      }

      const worktreePath = path.join(mainRepoRoot, WORKTREE_ROOT, name);
      const absoluteWorktreePath = path.resolve(worktreePath);

      // Check if worktree exists
      if (!fs.existsSync(absoluteWorktreePath)) {
        return `\u2717 Error: Worktree not found at ${absoluteWorktreePath}

Use worktree_list to see existing worktrees.`;
      }

      // Get branch name before removing
      let branchName = "";
      try {
        const { stdout } = await git(absoluteWorktreePath, "branch", "--show-current");
        branchName = stdout.trim();
      } catch {
        // Ignore error, branch detection is optional
      }

      // Remove the worktree — must run from the main repo, not from inside
      // the worktree being removed (git rejects that).
      try {
        await git(mainRepoRoot, "worktree", "remove", absoluteWorktreePath);
      } catch {
        // Try force remove if there are changes
        try {
          await git(mainRepoRoot, "worktree", "remove", "--force", absoluteWorktreePath);
        } catch (error2: any) {
          try {
            await client.tui.showToast({
              body: {
                title: `Worktree: ${name}`,
                message: `Failed to remove: ${error2.message || error2}`,
                variant: "error",
                duration: 8000,
              },
            });
          } catch {
            // Toast failure is non-fatal
          }
          return `\u2717 Error removing worktree: ${error2.message || error2}

The worktree may have uncommitted changes. Commit or stash them first.`;
        }
      }

      let output = `\u2713 Removed worktree at ${absoluteWorktreePath}`;

      // Delete branch if requested
      if (deleteBranch && branchName) {
        try {
          await git(mainRepoRoot, "branch", "-d", branchName);
          output += `\n\u2713 Deleted branch ${branchName}`;
        } catch (error: any) {
          output += `\n\u26A0 Could not delete branch ${branchName}: ${error.message || error}`;
          output += "\n  (Branch may not be fully merged. Use git branch -D to force delete.)";
        }
      }

      // Notify via toast
      try {
        await client.tui.showToast({
          body: {
            title: `Worktree: ${name}`,
            message: branchName
              ? `Removed worktree (branch ${branchName} ${deleteBranch ? "deleted" : "kept"})`
              : `Removed worktree`,
            variant: "success",
            duration: 4000,
          },
        });
      } catch {
        // Toast failure is non-fatal
      }

      return output;
    },
  });
}

export const open = tool({
  description:
    "Get the command to open a new terminal window in a worktree directory",
  args: {
    name: tool.schema.string().describe("Worktree name"),
  },
  async execute(args, context) {
    const { name } = args;
    const worktreePath = path.join(context.worktree, WORKTREE_ROOT, name);
    const absoluteWorktreePath = path.resolve(worktreePath);

    // Check if worktree exists
    if (!fs.existsSync(absoluteWorktreePath)) {
      return `\u2717 Error: Worktree not found at ${absoluteWorktreePath}

Use worktree_list to see existing worktrees.`;
    }

    // Detect OS and provide appropriate command
    const platform = process.platform;
    let command = "";
    let instructions = "";

    if (platform === "darwin") {
      // macOS
      command = `open -a Terminal "${absoluteWorktreePath}"`;
      instructions = `Or with iTerm2: open -a iTerm "${absoluteWorktreePath}"`;
    } else if (platform === "linux") {
      // Linux - try common terminals
      command = `gnome-terminal --working-directory="${absoluteWorktreePath}" || xterm -e "cd '${absoluteWorktreePath}' && $SHELL" || konsole --workdir "${absoluteWorktreePath}"`;
      instructions = "Command tries gnome-terminal, xterm, then konsole.";
    } else if (platform === "win32") {
      // Windows
      command = `start cmd /k "cd /d ${absoluteWorktreePath}"`;
      instructions = `Or with PowerShell: Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '${absoluteWorktreePath}'"`;
    } else {
      command = `cd "${absoluteWorktreePath}"`;
      instructions = "Unknown platform. Use the cd command above.";
    }

    return `To open a new terminal in the worktree:

${command}

${instructions}

Worktree path: ${absoluteWorktreePath}`;
  },
});
