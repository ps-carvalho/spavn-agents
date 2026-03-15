import { exec } from "../../utils/shell.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Create and checkout a new git branch with proper naming convention.
 */
export async function executeCreate(
  worktree: string,
  args: { name: string; type: string },
): Promise<HandlerResult> {
  const branchName = `${args.type}/${args.name}`;

  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd: worktree });
  } catch {
    return success("✗ Error: Not in a git repository");
  }

  try {
    await exec("git", ["checkout", "-b", branchName], { cwd: worktree });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }

  return success(`✓ Created and switched to branch: ${branchName}`);
}

/**
 * Get current git branch status.
 */
export async function executeStatus(worktree: string): Promise<HandlerResult> {
  try {
    const result = await exec("git", ["branch", "--show-current"], { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      const branch = result.stdout.trim();
      return success(`✓ Current branch: ${branch}`);
    } else {
      return success(`✗ Failed to get branch status`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Switch to an existing git branch.
 */
export async function executeSwitch(
  worktree: string,
  args: { branch: string },
): Promise<HandlerResult> {
  try {
    const result = await exec("git", ["checkout", args.branch], { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      return success(`✓ Switched to branch: ${args.branch}`);
    } else {
      return success(`✗ Failed to switch branch: ${result.stderr}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
