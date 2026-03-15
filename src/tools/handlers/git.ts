import { exec } from "../../utils/shell.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Commit staged changes with a message.
 */
export async function executeCommit(
  worktree: string,
  args: { message: string; addAll?: boolean },
): Promise<HandlerResult> {
  try {
    if (args.addAll) {
      await exec("git", ["add", "-A"], { cwd: worktree });
    }

    const result = await exec("git", ["commit", "-m", args.message], { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      const { stdout: hashOut } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: worktree, nothrow: true });
      return success(`✓ Committed: ${hashOut.trim()} — ${args.message}`);
    } else {
      return success(`✗ Commit failed: ${result.stderr}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Create a pull request via GitHub CLI.
 */
export async function executePr(
  worktree: string,
  args: { title: string; body?: string; baseBranch?: string; draft?: boolean },
): Promise<HandlerResult> {
  try {
    // Push current branch
    const { stdout: branchOut } = await exec("git", ["branch", "--show-current"], { cwd: worktree, nothrow: true });
    const currentBranch = branchOut.trim();

    await exec("git", ["push", "-u", "origin", currentBranch], { cwd: worktree, nothrow: true });

    const ghArgs = ["pr", "create", "--title", args.title];
    if (args.body) ghArgs.push("--body", args.body);
    if (args.baseBranch) ghArgs.push("--base", args.baseBranch);
    if (args.draft) ghArgs.push("--draft");

    const result = await exec("gh", ghArgs, { cwd: worktree, nothrow: true });
    if (result.exitCode === 0) {
      return success(`✓ PR created: ${result.stdout.trim()}`);
    } else {
      return success(`✗ PR creation failed: ${result.stderr}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Enhanced git status: branch + uncommitted changes + remote tracking.
 */
export async function executeGitStatus(worktree: string): Promise<HandlerResult> {
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

    return success(`✓ Git Status\n\n${lines.join("\n")}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
