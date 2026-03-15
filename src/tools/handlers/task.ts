import { exec } from "../../utils/shell.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Finalize implementation — commit all changes.
 *
 * Note: This is the simplified MCP server version that only commits.
 * The full OpenCode plugin version (with PR creation, worktree detection,
 * plan body) lives in src/tools/task.ts and will be rewired separately.
 */
export async function executeFinalize(
  worktree: string,
  args: { commitMessage: string },
): Promise<HandlerResult> {
  try {
    await exec("git", ["add", "-A"], { cwd: worktree, nothrow: true });
    const result = await exec("git", ["commit", "-m", args.commitMessage], { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      return success(`✓ Committed: ${args.commitMessage.substring(0, 50)}...`);
    } else {
      return success(`✗ Commit failed: ${result.stderr}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
