import * as fs from "fs";
import * as path from "path";

const SPAVN_DIR = ".spavn";
const PLANS_DIR = "plans";

interface PropagateResult {
  /** Plans that were copied */
  copied: string[];
  /** Whether .spavn was newly initialized in the target */
  initialized: boolean;
}

/**
 * Propagate plans from the main project into a worktree's .spavn/plans/ directory.
 *
 * Ensures the worktree is self-contained with its own copy of the plans,
 * so the new OpenCode session has full context without referencing the parent.
 */
export function propagatePlan(opts: {
  /** Main project root (source) */
  sourceWorktree: string;
  /** Worktree path (target) */
  targetWorktree: string;
  /** Specific plan filename to copy — copies all plans if omitted */
  planFilename?: string;
}): PropagateResult {
  const { sourceWorktree, targetWorktree, planFilename } = opts;

  const sourcePlansDir = path.join(sourceWorktree, SPAVN_DIR, PLANS_DIR);
  const targetSpavnDir = path.join(targetWorktree, SPAVN_DIR);
  const targetPlansDir = path.join(targetSpavnDir, PLANS_DIR);

  const result: PropagateResult = { copied: [], initialized: false };

  // Check source has plans
  if (!fs.existsSync(sourcePlansDir)) {
    return result;
  }

  // Initialize target .spavn if needed
  if (!fs.existsSync(targetSpavnDir)) {
    fs.mkdirSync(targetSpavnDir, { recursive: true });
    result.initialized = true;
  }
  if (!fs.existsSync(targetPlansDir)) {
    fs.mkdirSync(targetPlansDir, { recursive: true });
  }

  // Copy config.json if it exists (for consistent configuration)
  const sourceConfig = path.join(sourceWorktree, SPAVN_DIR, "config.json");
  if (fs.existsSync(sourceConfig)) {
    const targetConfig = path.join(targetSpavnDir, "config.json");
    if (!fs.existsSync(targetConfig)) {
      fs.copyFileSync(sourceConfig, targetConfig);
    }
  }

  // Create sessions dir in target (tools expect it)
  const targetSessionsDir = path.join(targetSpavnDir, "sessions");
  if (!fs.existsSync(targetSessionsDir)) {
    fs.mkdirSync(targetSessionsDir, { recursive: true });
  }

  if (planFilename) {
    // Copy specific plan
    const sourcePlan = path.join(sourcePlansDir, planFilename);
    if (fs.existsSync(sourcePlan)) {
      const targetPlan = path.join(targetPlansDir, planFilename);
      fs.copyFileSync(sourcePlan, targetPlan);
      result.copied.push(planFilename);
    }
  } else {
    // Copy all plans
    const planFiles = fs
      .readdirSync(sourcePlansDir)
      .filter((f) => f.endsWith(".md") && f !== ".gitkeep");

    for (const file of planFiles) {
      const sourcePlan = path.join(sourcePlansDir, file);
      const targetPlan = path.join(targetPlansDir, file);
      fs.copyFileSync(sourcePlan, targetPlan);
      result.copied.push(file);
    }
  }

  return result;
}
