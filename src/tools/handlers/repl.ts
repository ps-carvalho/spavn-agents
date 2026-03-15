import * as fs from "fs";
import * as path from "path";
import { SPAVN_DIR, PLANS_DIR } from "../../utils/constants.js";
import {
  parseTasksWithAC,
  detectCommands,
  readSpavnConfig,
  readReplState,
  writeReplState,
  getNextTask,
  getCurrentTask,
  isLoopComplete,
  detectIncompleteState,
  formatProgress,
  formatSummary,
  computeBatches,
  getReadyTasks,
  type ReplState,
  type ReplTask,
  type TaskBatch,
} from "../../utils/repl.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Extended result for REPL report that includes interaction-needed flag.
 * The caller (MCP server or OpenCode plugin) can use this to trigger
 * framework-specific notifications.
 */
export interface ReplReportResult extends HandlerResult {
  /** If true, the task failed after all retries — caller should trigger interaction notification */
  interactionNeeded?: boolean;
  interactionReason?: string;
}

/**
 * Initialize a REPL implementation loop from a plan.
 * Parses tasks, auto-detects build/test commands.
 */
export async function executeInit(
  worktree: string,
  args: { planFilename: string; buildCommand?: string; testCommand?: string; maxRetries?: number },
): Promise<HandlerResult> {
  const config = readSpavnConfig(worktree);
  const { planFilename, buildCommand, testCommand, maxRetries = config.maxRetries ?? 3 } = args;

  const plansDir = path.join(worktree, SPAVN_DIR, PLANS_DIR);
  const planPath = path.resolve(plansDir, planFilename);
  const resolvedPlansDir = path.resolve(plansDir);

  if (!planPath.startsWith(resolvedPlansDir + path.sep)) {
    return success("✗ Error: Invalid plan filename.");
  }
  if (!fs.existsSync(planPath)) {
    return success(`✗ Error: Plan not found: ${planFilename}`);
  }

  const planContent = fs.readFileSync(planPath, "utf-8");
  const parsedTasks = parseTasksWithAC(planContent);
  if (parsedTasks.length === 0) {
    return success(`✗ Error: No tasks found in plan: ${planFilename}`);
  }

  const detected = await detectCommands(worktree);
  const finalBuild = buildCommand ?? detected.buildCommand;
  const finalTest = testCommand ?? detected.testCommand;

  const tasks: ReplTask[] = parsedTasks.map((parsed, i) => ({
    index: i,
    description: parsed.description,
    acceptanceCriteria: parsed.acceptanceCriteria,
    dependsOn: parsed.dependsOn,
    status: "pending" as const,
    retries: 0,
    iterations: [],
  }));

  // Compute execution batches from task dependencies
  let batches: TaskBatch[] | undefined;
  try {
    batches = computeBatches(tasks);
  } catch (batchErr: any) {
    return success(`✗ Error: ${batchErr.message}`);
  }

  const state: ReplState = {
    version: 2,
    planFilename,
    startedAt: new Date().toISOString(),
    buildCommand: finalBuild,
    testCommand: finalTest,
    lintCommand: detected.lintCommand,
    maxRetries,
    currentTaskIndex: -1,
    activeTaskIndices: [],
    tasks,
    batches,
  };

  writeReplState(worktree, state);

  // Format output
  const cmdInfo = detected.detected
    ? `Auto-detected (${detected.framework})`
    : "Not detected \u2014 provide overrides if needed";

  const batchInfo = batches && batches.length > 0
    ? `\nBatches: ${batches.length} (first batch: ${batches[0].taskIndices.length} parallel task${batches[0].taskIndices.length > 1 ? "s" : ""})`
    : "";

  return success(`\u2713 REPL loop initialized

Plan: ${planFilename}
Tasks: ${tasks.length}${batchInfo}
Detection: ${cmdInfo}

Build: ${finalBuild || "(none)"}
Test:  ${finalTest || "(none)"}
${detected.lintCommand ? `Lint:  ${detected.lintCommand}\n` : ""}Max retries: ${maxRetries}

First task (#1):
  "${tasks[0].description}"

Run \`repl_status\` to begin, then implement the task and run build/tests.`);
}

/**
 * Get the current REPL loop progress — which task is active, what's been completed.
 */
export function executeStatus(worktree: string): HandlerResult {
  const state = readReplState(worktree);
  if (!state) return success("✗ No REPL loop active. Run repl_init first.");

  // Auto-advance: if no tasks are in_progress, promote the next ready batch
  const current = getCurrentTask(state);
  if (!current && !isLoopComplete(state)) {
    const ready = getReadyTasks(state);
    if (ready.length > 0) {
      state.activeTaskIndices = [];
      for (const task of ready) {
        task.status = "in_progress";
        task.startedAt = new Date().toISOString();
        state.activeTaskIndices.push(task.index);
      }
      state.currentTaskIndex = ready[0].index;
      writeReplState(worktree, state);
    }
  }

  return success(`✓ REPL Loop Status\n\n${formatProgress(state)}`);
}

/**
 * Report the outcome of the current task iteration (pass/fail/skip).
 */
export function executeReport(
  worktree: string,
  args: { result: string; detail: string; taskIndex?: number },
): ReplReportResult {
  const state = readReplState(worktree);
  if (!state) return { ...success("✗ No REPL loop active. Run repl_init first.") };

  // Find the target task
  let task: ReplTask | undefined;
  if (args.taskIndex !== undefined) {
    task = state.tasks[args.taskIndex];
    if (!task) return { ...success(`✗ Invalid task index: ${args.taskIndex}`) };
    if (task.status !== "in_progress") return { ...success(`✗ Task #${args.taskIndex + 1} is not in progress (status: ${task.status})`) };
  } else {
    const current = getCurrentTask(state) ?? undefined;
    if (!current) {
      if (state.currentTaskIndex >= 0 && state.currentTaskIndex < state.tasks.length) {
        task = state.tasks[state.currentTaskIndex];
        if (task.status === "pending") task.status = "in_progress";
      }
    } else {
      task = current;
    }
  }

  if (!task) return { ...success("✗ No task is currently in progress. Run repl_status to advance.") };

  return processReplReport(worktree, state, task, args.result as "pass" | "fail" | "skip", args.detail);
}

/**
 * Detect and resume an interrupted REPL loop from .spavn/repl-state.json.
 */
export function executeResume(worktree: string): HandlerResult {
  const state = detectIncompleteState(worktree);
  if (!state) return success("✗ No interrupted REPL loop found.");

  const total = state.tasks.length;
  const passed = state.tasks.filter((t) => t.status === "passed").length;
  const failed = state.tasks.filter((t) => t.status === "failed").length;
  const skipped = state.tasks.filter((t) => t.status === "skipped").length;
  const done = passed + failed + skipped;
  const current = getCurrentTask(state);

  let output = `✓ Interrupted REPL loop detected\n\nPlan: ${state.planFilename}\nProgress: ${done}/${total} tasks`;
  const activeCount = state.tasks.filter(t => t.status === "in_progress").length;
  if (activeCount > 1) {
    const activeTasks = state.tasks.filter(t => t.status === "in_progress");
    output += `\n\nInterrupted parallel batch (${activeCount} tasks):`;
    for (const t of activeTasks) {
      output += `\n  - Task #${t.index + 1}: "${t.description}"`;
    }
  } else if (current) {
    output += `\n\nInterrupted task (#${current.index + 1}): "${current.description}"`;
  }
  output += "\n\nRun repl_status to continue.";

  return success(output);
}

/**
 * Generate a formatted summary of the REPL loop results.
 */
export function executeSummary(worktree: string): HandlerResult {
  const state = readReplState(worktree);
  if (!state) return success("✗ No REPL loop data found.");
  return success(formatSummary(state));
}

/**
 * Process a REPL report for a specific task.
 * Framework-agnostic — returns a ReplReportResult with an optional
 * interactionNeeded flag instead of calling bridge directly.
 */
export function processReplReport(
  worktree: string,
  state: ReplState,
  task: ReplTask,
  result: "pass" | "fail" | "skip",
  detail: string,
): ReplReportResult {
  task.iterations.push({
    at: new Date().toISOString(),
    result,
    detail: detail.substring(0, 2000),
  });

  const taskNum = task.index + 1;
  let output: string;
  let interactionNeeded = false;
  let interactionReason: string | undefined;

  switch (result) {
    case "pass": {
      task.status = "passed";
      task.completedAt = new Date().toISOString();
      const attempt = task.iterations.length;
      const suffix = attempt === 1 ? "1st" : attempt === 2 ? "2nd" : attempt === 3 ? "3rd" : `${attempt}th`;
      output = `\u2713 Task #${taskNum} PASSED (${suffix} attempt)\n  "${task.description}"\n  Detail: ${detail.substring(0, 200)}`;
      break;
    }
    case "fail": {
      task.retries += 1;
      const attempt = task.iterations.length;

      if (task.retries >= state.maxRetries) {
        // Retries exhausted
        task.status = "failed";
        task.completedAt = new Date().toISOString();
        output = `\u2717 Task #${taskNum} FAILED \u2014 retries exhausted (${attempt}/${state.maxRetries} attempts)\n  "${task.description}"\n  Detail: ${detail.substring(0, 200)}\n\n\u2192 ASK THE USER how to proceed. Suggest: fix manually, skip task, or abort loop.`;
        interactionNeeded = true;
        interactionReason = `Task #${taskNum} failed after ${state.maxRetries} attempts`;
      } else {
        // Retries remaining — stay in_progress
        const remaining = state.maxRetries - task.retries;
        output = `\u26A0 Task #${taskNum} FAILED (attempt ${attempt}/${state.maxRetries})\n  "${task.description}"\n  Detail: ${detail.substring(0, 200)}\n\n\u2192 Fix the issue and run build/tests again. ${remaining} retr${remaining > 1 ? "ies" : "y"} remaining.`;

        // Don't advance — keep task in_progress
        writeReplState(worktree, state);
        return { ok: true, text: output };
      }
      break;
    }
    case "skip": {
      task.status = "skipped";
      task.completedAt = new Date().toISOString();
      output = `\u2298 Task #${taskNum} SKIPPED\n  "${task.description}"\n  Reason: ${detail.substring(0, 200)}`;
      break;
    }
  }

  // Remove completed task from activeTaskIndices
  if (state.activeTaskIndices) {
    state.activeTaskIndices = state.activeTaskIndices.filter(idx => idx !== task.index);
  }

  // Check if current batch is complete (all active tasks done)
  const hasActiveParallelTasks = state.activeTaskIndices && state.activeTaskIndices.length > 0;

  if (hasActiveParallelTasks) {
    // Other parallel tasks still running — don't advance yet
    output += `\n\n→ ${state.activeTaskIndices!.length} parallel task(s) still in progress.`;
  } else {
    // All parallel tasks done — advance to next batch
    const ready = getReadyTasks(state);
    if (ready.length > 0) {
      state.activeTaskIndices = [];
      for (const nextTask of ready) {
        nextTask.status = "in_progress";
        nextTask.startedAt = new Date().toISOString();
        state.activeTaskIndices.push(nextTask.index);
      }
      state.currentTaskIndex = ready[0].index;

      if (ready.length === 1) {
        output += `\n\n→ Next: Task #${ready[0].index + 1} "${ready[0].description}"`;
      } else {
        output += `\n\n→ Next batch (${ready.length} parallel tasks):`;
        for (const t of ready) {
          output += `\n  - Task #${t.index + 1}: "${t.description}"`;
        }
      }
    } else if (isLoopComplete(state)) {
      state.currentTaskIndex = -1;
      state.completedAt = new Date().toISOString();
      output += "\n\n\u2713 All tasks complete. Run repl_summary to generate the results report, then proceed to the quality gate (Step 7).";
    }
  }

  writeReplState(worktree, state);

  const reportResult: ReplReportResult = { ok: true, text: output };
  if (interactionNeeded) {
    reportResult.interactionNeeded = true;
    reportResult.interactionReason = interactionReason;
  }
  return reportResult;
}
