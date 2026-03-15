import * as fs from "fs";
import * as path from "path";
import { exec } from "../../utils/shell.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Create a new git worktree for isolated development.
 * Worktrees are created in .worktrees/ at the project root.
 */
export async function executeCreate(
  worktree: string,
  args: { name: string; type: string; fromBranch?: string },
): Promise<HandlerResult> {
  const branchName = args.fromBranch || `${args.type}/${args.name}`;
  const worktreePath = path.resolve(path.join(worktree, ".worktrees", args.name));

  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
  } catch {
    return success("✗ Error: Not in a git repository.");
  }

  if (fs.existsSync(worktreePath)) {
    return success(`✗ Error: Worktree already exists at ${worktreePath}`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

  try {
    if (args.fromBranch) {
      try {
        await exec("git", ["worktree", "add", worktreePath, args.fromBranch], { cwd: worktree });
      } catch {
        await exec("git", ["worktree", "add", "-b", args.fromBranch, worktreePath], { cwd: worktree });
      }
    } else {
      try {
        await exec("git", ["worktree", "add", "-b", branchName, worktreePath], { cwd: worktree });
      } catch {
        await exec("git", ["worktree", "add", worktreePath, branchName], { cwd: worktree });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }

  return success(`✓ Created worktree\n\nBranch: ${branchName}\nPath: ${worktreePath}\n\nTo work in this worktree:\n  cd ${worktreePath}`);
}

/**
 * List all git worktrees for the repository.
 */
export async function executeList(worktree: string): Promise<HandlerResult> {
  try {
    const result = await exec("git", ["worktree", "list"], { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      return success(`✓ Git worktrees:\n\n${result.stdout}`);
    } else {
      return success(`✗ Not a git repository or git worktree list failed`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Remove a git worktree (after merging). Optionally deletes the branch.
 */
export async function executeRemove(
  worktree: string,
  args: { name: string; deleteBranch?: boolean },
): Promise<HandlerResult> {
  const worktreePath = path.resolve(path.join(worktree, ".worktrees", args.name));

  if (!fs.existsSync(worktreePath)) {
    return success(`✗ Worktree not found at ${worktreePath}`);
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
      const msg = error instanceof Error ? error.message : String(error);
      return failure(`Error: ${msg}`);
    }
  }

  let output = `✓ Removed worktree at ${worktreePath}`;

  if (args.deleteBranch && branchName) {
    try {
      await exec("git", ["branch", "-d", branchName], { cwd: worktree });
      output += `\n✓ Deleted branch ${branchName}`;
    } catch {
      output += `\n⚠ Could not delete branch ${branchName} (may not be fully merged)`;
    }
  }

  return success(output);
}

/**
 * Open a git worktree in the default editor or file explorer.
 */
export function executeOpen(
  worktree: string,
  args: { name: string },
): HandlerResult {
  const worktreePath = path.join(worktree, "..", args.name);
  if (fs.existsSync(worktreePath)) {
    return success(`✓ Worktree path: ${worktreePath}`);
  } else {
    return success(`✗ Worktree not found at ${worktreePath}`);
  }
}
