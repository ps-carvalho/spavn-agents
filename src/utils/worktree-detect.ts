import * as path from "path";
import { git } from "./shell.js";

/**
 * Finds a unique branch name by appending -2, -3, etc. if the base name exists.
 * Returns the first available candidate from baseName-2 through baseName-10.
 */
export async function deduplicateBranch(cwd: string, baseName: string): Promise<string> {
  for (let i = 2; i <= 10; i++) {
    const candidate = `${baseName}-${i}`;
    const { stdout } = await git(cwd, "branch", "--list", candidate);
    if (!stdout.trim()) return candidate;
  }
  throw new Error(`Could not find unique branch name after 10 attempts (base: ${baseName})`);
}

/**
 * Information about the current worktree context.
 */
export interface WorktreeInfo {
  /** True if the current directory is a linked worktree (not the main working tree) */
  isWorktree: boolean;
  /** The current branch name */
  currentBranch: string;
  /** The absolute path to the main working tree (null if detection fails) */
  mainWorktreePath: string | null;
}

/**
 * Detect whether the current git directory is a linked worktree.
 *
 * Uses the canonical method: compare resolved absolute paths of
 * `git rev-parse --git-dir` vs `--git-common-dir`.
 * In a linked worktree these differ; in the main tree they're identical.
 */
export async function detectWorktreeInfo(cwd: string): Promise<WorktreeInfo> {
  const result: WorktreeInfo = {
    isWorktree: false,
    currentBranch: "",
    mainWorktreePath: null,
  };

  // Get current branch
  try {
    const { stdout } = await git(cwd, "branch", "--show-current");
    result.currentBranch = stdout.trim();
  } catch {
    result.currentBranch = "(unknown)";
  }

  // Compare git-dir and git-common-dir
  try {
    const { stdout: gitDirRaw } = await git(cwd, "rev-parse", "--git-dir");
    const { stdout: commonDirRaw } = await git(cwd, "rev-parse", "--git-common-dir");

    // Resolve both to absolute paths for reliable comparison
    const absGitDir = path.resolve(cwd, gitDirRaw.trim());
    const absCommonDir = path.resolve(cwd, commonDirRaw.trim());

    result.isWorktree = absGitDir !== absCommonDir;

    // If it's a worktree, the main working tree is one level above the common .git dir
    if (result.isWorktree) {
      // git-common-dir points to the main repo's .git directory
      // The main worktree is its parent
      result.mainWorktreePath = path.dirname(absCommonDir);
    }
  } catch {
    // If detection fails, assume not a worktree
  }

  return result;
}
