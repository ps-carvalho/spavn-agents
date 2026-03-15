/**
 * Coordination Tools
 *
 * Manage task breakdown and skill assignment from approved plans.
 * Reads/writes .spavn/tasks.json for tracking coordinated work.
 */

import * as fs from "fs";
import * as path from "path";
import { SPAVN_DIR } from "../utils/constants.js";
const TASKS_FILE = "tasks.json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CoordinatedTask {
  id: number;
  description: string;
  skill?: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  assignedAt?: string;
  completedAt?: string;
}

export interface TasksState {
  planFilename: string;
  createdAt: string;
  tasks: CoordinatedTask[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tasksPath(worktree: string): string {
  return path.join(worktree, SPAVN_DIR, TASKS_FILE);
}

function readTasks(worktree: string): TasksState | null {
  const p = tasksPath(worktree);
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function writeTasks(worktree: string, state: TasksState): void {
  const dir = path.join(worktree, SPAVN_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(tasksPath(worktree), JSON.stringify(state, null, 2));
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Read an approved plan, break into a task list, write to .spavn/tasks.json.
 */
export function coordinateTasks(
  worktree: string,
  planFilename: string,
): string {
  const plansDir = path.join(worktree, SPAVN_DIR, "plans");
  const planPath = path.resolve(plansDir, planFilename);
  const resolvedPlansDir = path.resolve(plansDir);

  if (!planPath.startsWith(resolvedPlansDir + path.sep)) {
    return "✗ Invalid plan filename: path traversal not allowed";
  }

  let content: string;
  try {
    content = fs.readFileSync(planPath, "utf-8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return `✗ Plan not found: ${planFilename}`;
    }
    throw e;
  }

  // Parse tasks from checkbox items
  const taskRegex = /^-\s*\[[ x]\]\s+(.+)$/gm;
  const tasks: CoordinatedTask[] = [];
  let match;
  let id = 1;
  while ((match = taskRegex.exec(content)) !== null) {
    tasks.push({
      id: id++,
      description: match[1].trim(),
      status: "pending",
    });
  }

  if (tasks.length === 0) {
    return `✗ No tasks found in plan: ${planFilename}\n\nThe plan must contain checkbox items (- [ ] ...).`;
  }

  const state: TasksState = {
    planFilename,
    createdAt: new Date().toISOString(),
    tasks,
  };

  writeTasks(worktree, state);

  let output = `✓ Coordinated ${tasks.length} tasks from ${planFilename}\n\n`;
  for (const task of tasks) {
    output += `  ${task.id}. ${task.description}\n`;
  }

  return output;
}

/**
 * Assign enhanced skills to specific tasks.
 */
export function coordinateAssignSkills(
  worktree: string,
  assignments: Array<{ taskId: number; skill: string }>,
): string {
  const state = readTasks(worktree);
  if (!state) {
    return "✗ No task coordination active. Run coordinate_tasks first.";
  }

  const results: string[] = [];

  for (const { taskId, skill } of assignments) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) {
      results.push(`  ✗ Task #${taskId} not found`);
      continue;
    }
    task.skill = skill;
    task.assignedAt = new Date().toISOString();
    results.push(`  ✓ Task #${taskId} → ${skill}`);
  }

  writeTasks(worktree, state);

  return `✓ Skills assigned:\n\n${results.join("\n")}`;
}

/**
 * Show current task breakdown with assignments.
 */
export function coordinateStatus(worktree: string): string {
  const state = readTasks(worktree);
  if (!state) {
    return "✗ No task coordination active. Run coordinate_tasks first.";
  }

  const lines: string[] = [];
  lines.push(`✓ Coordination Status`);
  lines.push(`Plan: ${state.planFilename}`);
  lines.push(`Created: ${state.createdAt}`);
  lines.push("");

  const pending = state.tasks.filter((t) => t.status === "pending").length;
  const inProgress = state.tasks.filter((t) => t.status === "in_progress").length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const skipped = state.tasks.filter((t) => t.status === "skipped").length;

  lines.push(`Progress: ${done}/${state.tasks.length} done (${pending} pending, ${inProgress} in progress, ${skipped} skipped)`);
  lines.push("");

  for (const task of state.tasks) {
    const status =
      task.status === "done" ? "✓" :
      task.status === "in_progress" ? "▶" :
      task.status === "skipped" ? "⊘" : "○";
    const skill = task.skill ? ` [${task.skill}]` : "";
    lines.push(`  ${status} #${task.id}: ${task.description}${skill}`);
  }

  return lines.join("\n");
}
