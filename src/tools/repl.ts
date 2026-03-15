/**
 * REPL Loop Tools
 *
 * Four tools for the implement agent's iterative task-by-task development loop:
 *   - repl_init    — Initialize a loop from a plan
 *   - repl_status  — Get current progress and next task
 *   - repl_report  — Report task outcome (pass/fail/skip)
 *   - repl_summary — Generate markdown summary for PR body
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
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
} from "../utils/repl.js";

const SPAVN_DIR = ".spavn";
const PLANS_DIR = "plans";

// ─── repl_init ───────────────────────────────────────────────────────────────

export const init = tool({
  description:
    "Initialize a REPL implementation loop from a plan. Parses plan tasks, " +
    "auto-detects build/test commands, and creates .spavn/repl-state.json " +
    "for tracking progress through each task iteratively.",
  args: {
    planFilename: tool.schema
      .string()
      .describe("Plan filename from .spavn/plans/ to load tasks from"),
    buildCommand: tool.schema
      .string()
      .optional()
      .describe("Override auto-detected build command (e.g., 'npm run build')"),
    testCommand: tool.schema
      .string()
      .optional()
      .describe("Override auto-detected test command (e.g., 'npm test')"),
    maxRetries: tool.schema
      .number()
      .optional()
      .describe("Max retries per failing task before escalating to user (default: 3)"),
  },
  async execute(args, context) {
    const cwd = context.worktree;
    const config = readSpavnConfig(cwd);
    const { planFilename, buildCommand, testCommand, maxRetries = config.maxRetries ?? 3 } = args;


    // 1. Validate plan filename
    if (!planFilename || planFilename === "." || planFilename === "..") {
      return `\u2717 Error: Invalid plan filename.`;
    }

    const plansDir = path.join(cwd, SPAVN_DIR, PLANS_DIR);
    const planPath = path.resolve(plansDir, planFilename);
    const resolvedPlansDir = path.resolve(plansDir);

    // Prevent path traversal — resolved path must be strictly inside plans dir
    if (!planPath.startsWith(resolvedPlansDir + path.sep)) {
      return `\u2717 Error: Invalid plan filename.`;
    }

    if (!fs.existsSync(planPath)) {
      return `\u2717 Error: Plan not found: ${planFilename}\n\nUse plan_list to see available plans.`;
    }

    const planContent = fs.readFileSync(planPath, "utf-8");

    // 2. Parse tasks from plan (with acceptance criteria)
    const parsedTasks = parseTasksWithAC(planContent);
    if (parsedTasks.length === 0) {
      return `\u2717 Error: No tasks found in plan: ${planFilename}\n\nThe plan must contain unchecked checkbox items (- [ ] ...) in a ## Tasks section.`;
    }

    // 3. Auto-detect commands (or use overrides)
    const detected = await detectCommands(cwd);
    const finalBuild = buildCommand ?? detected.buildCommand;
    const finalTest = testCommand ?? detected.testCommand;

    // 4. Build initial state
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
    } catch (err: any) {
      return `\u2717 Error: ${err.message}`;
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

    // 5. Write state
    writeReplState(cwd, state);

    // 6. Format output
    const cmdInfo = detected.detected
      ? `Auto-detected (${detected.framework})`
      : "Not detected \u2014 provide overrides if needed";

    const batchInfo = batches && batches.length > 0
      ? `\nBatches: ${batches.length} (first batch: ${batches[0].taskIndices.length} parallel task${batches[0].taskIndices.length > 1 ? "s" : ""})`
      : "";

    return `\u2713 REPL loop initialized

Plan: ${planFilename}
Tasks: ${tasks.length}${batchInfo}
Detection: ${cmdInfo}

Build: ${finalBuild || "(none)"}
Test:  ${finalTest || "(none)"}
${detected.lintCommand ? `Lint:  ${detected.lintCommand}` : ""}
Max retries: ${maxRetries}

First task (#1):
  "${tasks[0].description}"

Run \`repl_status\` to begin, then implement the task and run build/tests.`;
  },
});

// ─── repl_status ─────────────────────────────────────────────────────────────

export const status = tool({
  description:
    "Get the current REPL loop progress \u2014 which task is active, " +
    "what\u2019s been completed, retry counts, and detected build/test commands. " +
    "Call this to decide what to implement next.",
  args: {},
  async execute(args, context) {
    const state = readReplState(context.worktree);
    if (!state) {
      return `\u2717 No REPL loop active.\n\nRun repl_init with a plan filename to start a loop.`;
    }

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
        // Set currentTaskIndex to first for backward compat
        state.currentTaskIndex = ready[0].index;
        writeReplState(context.worktree, state);
      }
    }

    return `\u2713 REPL Loop Status\n\n${formatProgress(state)}`;
  },
});

// ─── repl_report ─────────────────────────────────────────────────────────────

export const report = tool({
  description:
    "Report the outcome of the current task iteration. " +
    "After implementing a task and running build/tests, report whether it passed, " +
    "failed, or should be skipped. The loop will auto-advance on pass, " +
    "retry on fail (up to max), or escalate to user when retries exhausted.",
  args: {
    result: tool.schema
      .enum(["pass", "fail", "skip"])
      .describe(
        "Task result: 'pass' (build+tests green), 'fail' (something broke), 'skip' (defer task)",
      ),
    detail: tool.schema
      .string()
      .describe("Result details: test output summary, error message, or skip reason"),
    taskIndex: tool.schema
      .number()
      .optional()
      .describe("Zero-based task index (required for parallel batches, defaults to current task)"),
  },
  async execute(args, context) {
    const { result, detail, taskIndex } = args;
    const state = readReplState(context.worktree);

    if (!state) {
      return `\u2717 No REPL loop active. Run repl_init first.`;
    }

    // Find the target task
    let task: ReplTask | undefined;
    if (taskIndex !== undefined) {
      // Explicit task index (for parallel batches)
      task = state.tasks[taskIndex];
      if (!task) {
        return `\u2717 Invalid task index: ${taskIndex}`;
      }
      if (task.status !== "in_progress") {
        return `\u2717 Task #${taskIndex + 1} is not in progress (status: ${task.status})`;
      }
    } else {
      // Legacy: find current in_progress task
      const current = getCurrentTask(state) ?? undefined;
      if (!current) {
        // Try to find the task at currentTaskIndex
        if (state.currentTaskIndex >= 0 && state.currentTaskIndex < state.tasks.length) {
          task = state.tasks[state.currentTaskIndex];
          if (task.status === "pending") {
            task.status = "in_progress";
          }
        }
      } else {
        task = current;
      }
    }

    if (!task) {
      return `\u2717 No task is currently in progress.\n\nRun repl_status to advance to the next task.`;
    }

    return processReport(state, task, result, detail, context.worktree);
  },
});

/**
 * Process a report for a task and update state.
 */
function processReport(
  state: ReplState,
  task: ReplTask,
  result: "pass" | "fail" | "skip",
  detail: string,
  cwd: string,
): string {
  // Record iteration
  task.iterations.push({
    at: new Date().toISOString(),
    result,
    detail: detail.substring(0, 2000), // Cap detail length
  });

  const taskNum = task.index + 1;
  const taskDesc = task.description;
  let output: string;

  switch (result) {
    case "pass": {
      task.status = "passed";
      task.completedAt = new Date().toISOString();
      const attempt = task.iterations.length;
      const suffix = attempt === 1 ? "1st" : attempt === 2 ? "2nd" : attempt === 3 ? "3rd" : `${attempt}th`;
      output = `\u2713 Task #${taskNum} PASSED (${suffix} attempt)\n  "${taskDesc}"\n  Detail: ${detail.substring(0, 200)}`;
      break;
    }

    case "fail": {
      task.retries += 1;
      const attempt = task.iterations.length;

      if (task.retries >= state.maxRetries) {
        // Retries exhausted
        task.status = "failed";
        task.completedAt = new Date().toISOString();
        output = `\u2717 Task #${taskNum} FAILED \u2014 retries exhausted (${attempt}/${state.maxRetries} attempts)\n  "${taskDesc}"\n  Detail: ${detail.substring(0, 200)}\n\n\u2192 ASK THE USER how to proceed. Suggest: fix manually, skip task, or abort loop.`;
      } else {
        // Retries remaining — stay in_progress
        const remaining = state.maxRetries - task.retries;
        output = `\u26A0 Task #${taskNum} FAILED (attempt ${attempt}/${state.maxRetries})\n  "${taskDesc}"\n  Detail: ${detail.substring(0, 200)}\n\n\u2192 Fix the issue and run build/tests again. ${remaining} retr${remaining > 1 ? "ies" : "y"} remaining.`;

        // Don't advance — keep task in_progress
        writeReplState(cwd, state);
        return output;
      }
      break;
    }

    case "skip": {
      task.status = "skipped";
      task.completedAt = new Date().toISOString();
      output = `\u2298 Task #${taskNum} SKIPPED\n  "${taskDesc}"\n  Reason: ${detail.substring(0, 200)}`;
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
    output += `\n\n\u2192 ${state.activeTaskIndices!.length} parallel task(s) still in progress.`;
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
        output += `\n\n\u2192 Next: Task #${ready[0].index + 1} "${ready[0].description}"`;
      } else {
        output += `\n\n\u2192 Next batch (${ready.length} parallel tasks):`;
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

  writeReplState(cwd, state);
  return output;
}

// ─── repl_resume ─────────────────────────────────────────────────────────────

export const resume = tool({
  description:
    "Detect and resume an interrupted REPL loop. Checks for incomplete state " +
    "in .spavn/repl-state.json and offers to continue from where it left off. " +
    "Call this at the start of a session to recover from crashes or context loss.",
  args: {},
  async execute(args, context) {
    const state = detectIncompleteState(context.worktree);
    if (!state) {
      return `\u2717 No interrupted REPL loop found.\n\nEither no loop has been started, or the previous loop completed normally.`;
    }

    const total = state.tasks.length;
    const passed = state.tasks.filter((t) => t.status === "passed").length;
    const failed = state.tasks.filter((t) => t.status === "failed").length;
    const skipped = state.tasks.filter((t) => t.status === "skipped").length;
    const done = passed + failed + skipped;
    const current = getCurrentTask(state);
    const next = getNextTask(state);

    const lines: string[] = [];
    lines.push(`\u2713 Interrupted REPL loop detected`);
    lines.push("");
    lines.push(`Plan: ${state.planFilename}`);
    lines.push(`Progress: ${done}/${total} tasks completed (${passed} passed, ${failed} failed, ${skipped} skipped)`);
    lines.push(`Started: ${state.startedAt}`);

    const activeCount = state.tasks.filter(t => t.status === "in_progress").length;
    if (activeCount > 1) {
      const activeTasks = state.tasks.filter(t => t.status === "in_progress");
      lines.push("");
      lines.push(`Interrupted parallel batch (${activeCount} tasks):`);
      for (const t of activeTasks) {
        lines.push(`  - Task #${t.index + 1}: "${t.description}" (${t.retries} retries)`);
      }
    } else if (current) {
      lines.push("");
      lines.push(`Interrupted task (#${current.index + 1}):`);
      lines.push(`  "${current.description}"`);
      lines.push(`  Status: in_progress (${current.retries} retries so far)`);
      if (current.iterations.length > 0) {
        const lastIter = current.iterations[current.iterations.length - 1];
        lines.push(`  Last attempt: ${lastIter.result} — ${lastIter.detail.substring(0, 100)}`);
      }
    } else if (next) {
      lines.push("");
      lines.push(`Next pending task (#${next.index + 1}):`);
      lines.push(`  "${next.description}"`);
    }

    lines.push("");
    lines.push(`\u2192 Run repl_status to continue the loop from where it left off.`);

    return lines.join("\n");
  },
});

// ─── repl_summary ────────────────────────────────────────────────────────────

export const summary = tool({
  description:
    "Generate a formatted summary of the REPL loop results for inclusion in " +
    "the quality gate report and PR body. Call after all tasks are complete " +
    "or when the loop is terminated.",
  args: {},
  async execute(args, context) {
    const state = readReplState(context.worktree);
    if (!state) {
      return `\u2717 No REPL loop data found.\n\nRun repl_init to start a loop, or this may have been cleaned up already.`;
    }

    return formatSummary(state);
  },
});
