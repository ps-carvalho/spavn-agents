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
import * as replHandlers from "./handlers/repl.js";

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
    skipBuild: tool.schema
      .boolean()
      .optional()
      .describe("Skip build verification during task loop — defer to quality gate (default: false)"),
  },
  async execute(args, context) {
    const result = await replHandlers.executeInit(context.worktree, {
      planFilename: args.planFilename,
      buildCommand: args.buildCommand,
      testCommand: args.testCommand,
      maxRetries: args.maxRetries,
      skipBuild: args.skipBuild,
    });
    return result.text;
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
    const result = replHandlers.executeStatus(context.worktree);
    return result.text;
  },
});

// ─── repl_report ─────────────────────────────────────────────────────────────

export const report = tool({
  description:
    "Report the outcome of the current task iteration. " +
    "After implementing a task and reviewing the output, report whether it passed, " +
    "failed, or should be skipped. The loop will auto-advance on pass, " +
    "retry on fail (up to max), or escalate to user when retries exhausted.",
  args: {
    result: tool.schema
      .enum(["pass", "fail", "skip"])
      .describe(
        "Task result: 'pass' (implementation looks correct), 'fail' (something broke), 'skip' (defer task)",
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
    const result = replHandlers.executeReport(context.worktree, {
      result: args.result,
      detail: args.detail,
      taskIndex: args.taskIndex,
    });
    return result.text;
  },
});

// ─── repl_resume ─────────────────────────────────────────────────────────────

export const resume = tool({
  description:
    "Detect and resume an interrupted REPL loop. Checks for incomplete state " +
    "in .spavn/repl-state.json and offers to continue from where it left off. " +
    "Call this at the start of a session to recover from crashes or context loss.",
  args: {},
  async execute(args, context) {
    const result = replHandlers.executeResume(context.worktree);
    return result.text;
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
    const result = replHandlers.executeSummary(context.worktree);
    return result.text;
  },
});
