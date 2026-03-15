import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import { git } from "../utils/shell.js";
import { PROTECTED_BRANCHES } from "../utils/constants.js";
import * as branchHandlers from "./handlers/branch.js";

// Extract client type from the plugin input via inference
type Client = PluginInput["client"];

/**
 * Factory function that creates the branch_create tool with access
 * to the OpenCode client for toast notifications.
 */
export function createCreate(client: Client) {
  return tool({
    description:
      "Create and checkout a new git branch with proper naming convention",
    args: {
      name: tool.schema
        .string()
        .describe("Branch name slug (e.g., 'user-authentication', 'fix-login')"),
      type: tool.schema
        .enum(["feature", "bugfix", "hotfix", "refactor", "docs", "test", "chore"])
        .describe("Branch type - determines prefix"),
    },
    async execute(args, context) {
      const result = await branchHandlers.executeCreate(context.worktree, {
        name: args.name,
        type: args.type,
      });

      if (result.ok) {
        try {
          await client.tui.showToast({
            body: {
              title: `Branch: ${args.type}/${args.name}`,
              message: `Created and checked out`,
              variant: "success",
              duration: 4000,
            },
          });
        } catch {
          // Toast failure is non-fatal
        }
      } else {
        try {
          await client.tui.showToast({
            body: {
              title: `Branch: ${args.type}/${args.name}`,
              message: `Failed to create`,
              variant: "error",
              duration: 8000,
            },
          });
        } catch {
          // Toast failure is non-fatal
        }
      }

      return result.text;
    },
  });
}

export const status = tool({
  description:
    "Get current git branch status - branch name, uncommitted changes, and whether on protected branch",
  args: {},
  async execute(args, context) {
    // Check if we're in a git repository
    try {
      await git(context.worktree, "rev-parse", "--git-dir");
    } catch {
      return "✗ Not in a git repository";
    }

    let currentBranch = "";
    let hasChanges = false;
    let stagedChanges = false;
    let untrackedFiles = false;
    let isProtected = false;
    let aheadBehind = "";

    // Get current branch
    try {
      const { stdout } = await git(context.worktree, "branch", "--show-current");
      currentBranch = stdout.trim();
      if (!currentBranch) {
        currentBranch = "(detached HEAD)";
      }
    } catch {
      currentBranch = "(unknown)";
    }

    // Check if protected
    isProtected = (PROTECTED_BRANCHES as readonly string[]).includes(currentBranch);

    // Check for changes
    try {
      const { stdout } = await git(context.worktree, "status", "--porcelain");
      const lines = stdout.trim().split("\n").filter((l) => l);

      for (const line of lines) {
        const st = line.substring(0, 2);
        if (st[0] !== " " && st[0] !== "?") {
          stagedChanges = true;
        }
        if (st[1] !== " " && st[1] !== "?") {
          hasChanges = true;
        }
        if (st === "??") {
          untrackedFiles = true;
        }
      }
    } catch {
      // Ignore error
    }

    // Check ahead/behind
    try {
      const { stdout } = await git(context.worktree, "rev-list", "--left-right", "--count", "HEAD...@{upstream}");
      const [ahead, behind] = stdout.trim().split(/\s+/);
      if (parseInt(ahead) > 0 || parseInt(behind) > 0) {
        aheadBehind = `Ahead: ${ahead}, Behind: ${behind}`;
      }
    } catch {
      // No upstream or error
    }

    // Build output
    let output = `Git Status:

Branch: ${currentBranch}`;

    if (isProtected) {
      output += ` ⚠️  PROTECTED`;
    }

    output += `\n`;

    if (stagedChanges || hasChanges || untrackedFiles) {
      output += `\nChanges:`;
      if (stagedChanges) output += `\n  • Staged changes (ready to commit)`;
      if (hasChanges) output += `\n  • Unstaged changes`;
      if (untrackedFiles) output += `\n  • Untracked files`;
    } else {
      output += `\nWorking tree clean.`;
    }

    if (aheadBehind) {
      output += `\n\n${aheadBehind}`;
    }

    if (isProtected) {
      output += `\n
⚠️  You are on a protected branch (${currentBranch}).
    Consider creating a feature/bugfix branch before making changes.
    Use branch_create or worktree_create.`;
    }

    return output;
  },
});

export const switch_ = tool({
  description: "Switch to an existing git branch",
  args: {
    branch: tool.schema.string().describe("Branch name to switch to"),
  },
  async execute(args, context) {
    const result = await branchHandlers.executeSwitch(context.worktree, { branch: args.branch });
    return result.text;
  },
});

// Export with underscore suffix to avoid reserved word
export { switch_ as switch };
