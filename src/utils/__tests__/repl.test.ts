import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseTasksFromPlan,
  parseTasksWithAC,
  detectCommands,
  readReplState,
  writeReplState,
  getNextTask,
  getCurrentTask,
  isLoopComplete,
  formatProgress,
  formatSummary,
  type ReplState,
  type ReplTask,
} from "../repl.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "spavn-repl-"));
}

function makeState(overrides: Partial<ReplState> = {}): ReplState {
  return {
    version: 1,
    planFilename: "test-plan.md",
    startedAt: "2026-01-01T00:00:00Z",
    buildCommand: "npm run build",
    testCommand: "npx vitest run",
    lintCommand: null,
    maxRetries: 3,
    currentTaskIndex: -1,
    tasks: [
      { index: 0, description: "Task A", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      { index: 1, description: "Task B", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      { index: 2, description: "Task C", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
    ],
    ...overrides,
  };
}

// ─── parseTasksFromPlan ──────────────────────────────────────────────────────

describe("parseTasksFromPlan", () => {
  it("extracts tasks from ## Tasks section", () => {
    const content = `# My Plan

## Summary
Some summary here.

## Tasks

- [ ] Create the utility module
- [ ] Write tests for the module
- [ ] Update documentation

## Notes
Some notes.
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual([
      "Create the utility module",
      "Write tests for the module",
      "Update documentation",
    ]);
  });

  it("strips 'Task N:' prefix from descriptions", () => {
    const content = `## Tasks

- [ ] Task 1: Create src/utils/repl.ts
- [ ] Task 2: Create src/tools/repl.ts
- [ ] Task 3: Register tools
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual([
      "Create src/utils/repl.ts",
      "Create src/tools/repl.ts",
      "Register tools",
    ]);
  });

  it("handles tasks without 'Task N:' prefix", () => {
    const content = `## Tasks

- [ ] Implement feature A
- [ ] Fix bug B
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["Implement feature A", "Fix bug B"]);
  });

  it("returns empty array for plan with no tasks", () => {
    const content = `# My Plan

## Summary
Just a summary, no tasks.
`;
    expect(parseTasksFromPlan(content)).toEqual([]);
  });

  it("ignores checked tasks (- [x])", () => {
    const content = `## Tasks

- [x] Already done
- [ ] Still pending
- [x] Also done
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["Still pending"]);
  });

  it("falls back to any checkboxes when no ## Tasks section", () => {
    const content = `# Plan

Some intro.

- [ ] First thing
- [ ] Second thing
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["First thing", "Second thing"]);
  });

  it("handles asterisk list markers", () => {
    const content = `## Tasks

* [ ] Task with asterisk
- [ ] Task with dash
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["Task with asterisk", "Task with dash"]);
  });

  it("handles case-insensitive Task prefix", () => {
    const content = `## Tasks

- [ ] task 1: lowercase prefix
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["lowercase prefix"]);
  });
});

// ─── detectCommands ──────────────────────────────────────────────────────────

describe("detectCommands", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("detects vitest from package.json devDependencies", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { build: "tsc", test: "vitest run" },
        devDependencies: { vitest: "^3.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBe("npm run build");
    expect(result.testCommand).toBe("npx vitest run");
    expect(result.framework).toBe("vitest");
  });

  it("detects jest from package.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { build: "tsc", test: "jest" },
        devDependencies: { jest: "^29.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.testCommand).toBe("npx jest");
    expect(result.framework).toBe("jest");
  });

  it("detects npm test when no specific framework", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { test: "node test.js" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.testCommand).toBe("npm test");
    expect(result.framework).toBe("npm-test");
  });

  it("ignores default npm test script", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.testCommand).toBeNull();
  });

  it("detects lint command from package.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { build: "tsc", test: "vitest", lint: "eslint ." },
        devDependencies: { vitest: "^3.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.lintCommand).toBe("npm run lint");
  });

  it("detects Cargo.toml for Rust projects", async () => {
    fs.writeFileSync(path.join(tmpDir, "Cargo.toml"), "[package]\nname = \"myapp\"");

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBe("cargo build");
    expect(result.testCommand).toBe("cargo test");
    expect(result.framework).toBe("cargo");
  });

  it("detects go.mod for Go projects", async () => {
    fs.writeFileSync(path.join(tmpDir, "go.mod"), "module example.com/myapp\n\ngo 1.21");

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBe("go build ./...");
    expect(result.testCommand).toBe("go test ./...");
    expect(result.framework).toBe("go-test");
  });

  it("detects pyproject.toml for Python projects", async () => {
    fs.writeFileSync(path.join(tmpDir, "pyproject.toml"), '[tool.pytest]\ntestpaths = ["tests"]');

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.testCommand).toBe("pytest");
    expect(result.framework).toBe("pytest");
  });

  it("detects mix.exs for Elixir projects", async () => {
    fs.writeFileSync(path.join(tmpDir, "mix.exs"), 'defmodule MyApp.MixProject do\nend');

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBe("mix compile");
    expect(result.testCommand).toBe("mix test");
    expect(result.framework).toBe("ExUnit");
  });

  it("returns not-detected when no config found", async () => {
    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(false);
    expect(result.buildCommand).toBeNull();
    expect(result.testCommand).toBeNull();
    expect(result.framework).toBe("unknown");
  });

  it("prefers vitest over jest when both present", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        devDependencies: { vitest: "^3.0.0", jest: "^29.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.framework).toBe("vitest");
    expect(result.testCommand).toBe("npx vitest run");
  });

  it("prefers package.json over Makefile", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        scripts: { build: "tsc" },
        devDependencies: { vitest: "^3.0.0" },
      }),
    );
    fs.writeFileSync(path.join(tmpDir, "Makefile"), "build:\n\tgo build\ntest:\n\tgo test");

    const result = await detectCommands(tmpDir);
    expect(result.framework).toBe("vitest");
  });
});

// ─── State Management ────────────────────────────────────────────────────────

describe("state management", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    fs.mkdirSync(path.join(tmpDir, ".spavn"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("writes and reads repl-state.json", () => {
    const state = makeState();
    writeReplState(tmpDir, state);

    const read = readReplState(tmpDir);
    expect(read).toEqual(state);
  });

  it("returns null for missing state file", () => {
    expect(readReplState(tmpDir)).toBeNull();
  });

  it("returns null for corrupted state file", () => {
    fs.writeFileSync(path.join(tmpDir, ".spavn", "repl-state.json"), "not json");
    expect(readReplState(tmpDir)).toBeNull();
  });

  it("creates .spavn directory if missing", () => {
    const newTmp = makeTmpDir();
    const state = makeState();
    writeReplState(newTmp, state);
    expect(readReplState(newTmp)).toEqual(state);
    fs.rmSync(newTmp, { recursive: true });
  });

  it("getNextTask returns first pending task", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      ],
    });
    const next = getNextTask(state);
    expect(next?.index).toBe(1);
    expect(next?.description).toBe("B");
  });

  it("getNextTask returns null when all done", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "failed", retries: 3, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "skipped", retries: 0, iterations: [] },
      ],
    });
    expect(getNextTask(state)).toBeNull();
  });

  it("getCurrentTask returns in_progress task", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "in_progress", retries: 0, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      ],
    });
    const current = getCurrentTask(state);
    expect(current?.index).toBe(1);
  });

  it("getCurrentTask returns null when no task in progress", () => {
    const state = makeState();
    expect(getCurrentTask(state)).toBeNull();
  });

  it("isLoopComplete returns false when tasks pending", () => {
    expect(isLoopComplete(makeState())).toBe(false);
  });

  it("isLoopComplete returns true when all done", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "failed", retries: 3, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "skipped", retries: 0, iterations: [] },
      ],
    });
    expect(isLoopComplete(state)).toBe(true);
  });

  it("isLoopComplete returns false when task in_progress", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "in_progress", retries: 0, iterations: [] },
      ],
    });
    expect(isLoopComplete(state)).toBe(false);
  });
});

// ─── Formatting ──────────────────────────────────────────────────────────────

describe("formatProgress", () => {
  it("shows correct progress counts", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [{ at: "t", result: "pass", detail: "" }] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "in_progress", retries: 1, iterations: [{ at: "t", result: "fail", detail: "" }] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("1/3 tasks");
    expect(output).toContain("Passed: 1");
    expect(output).toContain("Pending: 1");
    expect(output).toContain("npm run build");
    expect(output).toContain("npx vitest run");
  });

  it("includes current task with retry info", () => {
    const state = makeState({
      currentTaskIndex: 1,
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "Task B desc", acceptanceCriteria: [], status: "in_progress", retries: 2, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("Task B desc");
    expect(output).toContain("Attempt: 3/3");
  });

  it("shows 'All tasks complete' when done", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 1, description: "B", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
        { index: 2, description: "C", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [] },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("All tasks complete");
    expect(output).toContain("3/3 tasks (100%)");
  });

  it("shows task history with status icons", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "Passed task", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [{ at: "t", result: "pass", detail: "" }] },
        { index: 1, description: "Failed task", acceptanceCriteria: [], status: "failed", retries: 3, iterations: [] },
        { index: 2, description: "Skipped task", acceptanceCriteria: [], status: "skipped", retries: 0, iterations: [] },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("Task History:");
    expect(output).toContain("#1 Passed task");
    expect(output).toContain("#2 Failed task");
    expect(output).toContain("#3 Skipped task");
  });
});

describe("formatSummary", () => {
  it("generates markdown table with all tasks", () => {
    const state = makeState({
      completedAt: "2026-01-01T00:12:00Z",
      tasks: [
        { index: 0, description: "Task A", acceptanceCriteria: [], status: "passed", retries: 0, iterations: [{ at: "t", result: "pass", detail: "" }] },
        { index: 1, description: "Task B", acceptanceCriteria: [], status: "passed", retries: 1, iterations: [{ at: "t", result: "fail", detail: "" }, { at: "t", result: "pass", detail: "" }] },
        { index: 2, description: "Task C", acceptanceCriteria: [], status: "skipped", retries: 0, iterations: [] },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("## REPL Loop Summary");
    expect(output).toContain("| 1 | Task A | Passed | 1 |");
    expect(output).toContain("| 2 | Task B | Passed | 2 |");
    expect(output).toContain("| 3 | Task C | Skipped | — |");
    expect(output).toContain("2 passed, 0 failed, 1 skipped");
    expect(output).toContain("3 total iterations");
  });

  it("includes failed task details", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Failing task",
          acceptanceCriteria: [],
          status: "failed",
          retries: 3,
          iterations: [
            { at: "t", result: "fail", detail: "TypeScript error in line 42" },
          ],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("### Failed Tasks");
    expect(output).toContain("Failing task");
    expect(output).toContain("TypeScript error in line 42");
  });

  it("includes timing information", () => {
    const state = makeState({
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:05:00Z",
    });

    const output = formatSummary(state);
    expect(output).toContain("5 minutes");
  });

  it("truncates long task descriptions in table", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "A".repeat(100),
          acceptanceCriteria: [],
          status: "passed",
          retries: 0,
          iterations: [{ at: "t", result: "pass", detail: "" }],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("...");
  });

  it("handles empty task list", () => {
    const state = makeState({ tasks: [] });
    const output = formatSummary(state);
    expect(output).toContain("0 passed, 0 failed, 0 skipped");
  });

  it("shows '< 1 minute' for very short durations", () => {
    const state = makeState({
      startedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:20Z", // 20 seconds — rounds to 0 minutes
    });

    const output = formatSummary(state);
    expect(output).toContain("< 1 minute");
  });

  it("shows in_progress task status in table", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Active task",
          acceptanceCriteria: [],
          status: "in_progress",
          retries: 0,
          iterations: [{ at: "t", result: "fail", detail: "first try" }],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("In Progress");
    expect(output).toContain("| 1 |");
  });

  it("shows pending task status in table", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Not started",
          acceptanceCriteria: [],
          status: "pending",
          retries: 0,
          iterations: [],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("Pending");
    expect(output).toContain("| — |");
  });

  it("uses current time when completedAt is not set", () => {
    const state = makeState({
      startedAt: "2026-01-01T00:00:00Z",
      // no completedAt — should use Date.now()
    });

    const output = formatSummary(state);
    // Should contain duration info (uses current time as end)
    expect(output).toContain("Duration:");
  });

  it("truncates last error detail in failed tasks section to 200 chars", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Failing task",
          acceptanceCriteria: [],
          status: "failed",
          retries: 3,
          iterations: [
            { at: "t", result: "fail", detail: "E".repeat(300) },
          ],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("### Failed Tasks");
    // The detail should be truncated to 200 chars
    expect(output).toContain("E".repeat(200));
    expect(output).not.toContain("E".repeat(201));
  });

  it("includes plan filename", () => {
    const state = makeState({ planFilename: "my-special-plan.md" });
    const output = formatSummary(state);
    expect(output).toContain("Plan: my-special-plan.md");
  });
});

// ─── Additional parseTasksFromPlan edge cases ────────────────────────────────

describe("parseTasksFromPlan edge cases", () => {
  it("returns empty array for empty string", () => {
    expect(parseTasksFromPlan("")).toEqual([]);
  });

  it("returns empty array for whitespace-only content", () => {
    expect(parseTasksFromPlan("   \n\n  \n")).toEqual([]);
  });

  it("ignores indented checkboxes (not top-level list items)", () => {
    const content = `## Tasks

- [ ] Top level task
  - [ ] Nested subtask
`;
    const tasks = parseTasksFromPlan(content);
    // The regex requires ^[-*] so indented items won't match
    expect(tasks).toEqual(["Top level task"]);
  });

  it("handles multiple ## Tasks sections (uses first one)", () => {
    const content = `## Tasks

- [ ] First section task

## Other Section

Some content.

## Tasks

- [ ] Second section task
`;
    const tasks = parseTasksFromPlan(content);
    // extractTasksSection stops at the next ## heading
    expect(tasks).toEqual(["First section task"]);
  });

  it("handles task descriptions with special characters", () => {
    const content = `## Tasks

- [ ] Create \`src/utils/repl.ts\` with types & interfaces
- [ ] Fix bug #123 (critical)
- [ ] Add "quoted" strings support
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toContain("`src/utils/repl.ts`");
    expect(tasks[1]).toContain("#123");
    expect(tasks[2]).toContain('"quoted"');
  });

  it("strips 'Task' prefix case-insensitively with varying spacing", () => {
    const content = `## Tasks

- [ ] TASK 1:  Extra spaces
- [ ] task 99: High number
`;
    const tasks = parseTasksFromPlan(content);
    expect(tasks).toEqual(["Extra spaces", "High number"]);
  });

  it("does not strip partial 'Task' prefix matches", () => {
    const content = `## Tasks

- [ ] Tasking the team with reviews
`;
    const tasks = parseTasksFromPlan(content);
    // "Tasking" should NOT be stripped since it doesn't match "Task N:"
    expect(tasks).toEqual(["Tasking the team with reviews"]);
  });
});

// ─── Additional detectCommands edge cases ────────────────────────────────────

describe("detectCommands edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("handles malformed package.json gracefully", async () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{ invalid json }}}");

    const result = await detectCommands(tmpDir);
    // Should not crash, should continue to next detector
    expect(result.framework).toBe("unknown");
    expect(result.detected).toBe(false);
  });

  it("detects mocha from package.json", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        devDependencies: { mocha: "^10.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.testCommand).toBe("npx mocha");
    expect(result.framework).toBe("mocha");
    expect(result.detected).toBe(true);
  });

  it("detects Makefile with build and test targets", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "Makefile"),
      "build:\n\tgo build ./...\n\ntest:\n\tgo test ./...\n\nlint:\n\tgolangci-lint run",
    );

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBe("make build");
    expect(result.testCommand).toBe("make test");
    expect(result.lintCommand).toBe("make lint");
    expect(result.framework).toBe("make");
  });

  it("detects pyproject.toml without pytest mention", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "pyproject.toml"),
      '[project]\nname = "myapp"\nversion = "1.0.0"',
    );

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.testCommand).toBe("python -m pytest");
    expect(result.framework).toBe("pytest");
  });

  it("detects setup.py for Python projects", async () => {
    fs.writeFileSync(path.join(tmpDir, "setup.py"), 'from setuptools import setup\nsetup(name="myapp")');

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.testCommand).toBe("python -m pytest");
    expect(result.framework).toBe("pytest");
  });

  it("detects vitest from dependencies (not just devDependencies)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { vitest: "^3.0.0" },
      }),
    );

    const result = await detectCommands(tmpDir);
    expect(result.testCommand).toBe("npx vitest run");
    expect(result.framework).toBe("vitest");
  });

  it("package.json with no scripts and no test deps returns not detected", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "empty-project" }),
    );

    const result = await detectCommands(tmpDir);
    // No build, no test, no lint — should fall through
    expect(result.detected).toBe(false);
  });

  it("Makefile with only test target (no build)", async () => {
    fs.writeFileSync(path.join(tmpDir, "Makefile"), "test:\n\tpytest\n");

    const result = await detectCommands(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.buildCommand).toBeNull();
    expect(result.testCommand).toBe("make test");
  });
});

// ─── Additional formatProgress edge cases ────────────────────────────────────

describe("formatProgress edge cases", () => {
  it("handles zero tasks gracefully", () => {
    const state = makeState({ tasks: [] });
    const output = formatProgress(state);
    expect(output).toContain("0/0 tasks (0%)");
    expect(output).toContain("All tasks complete");
  });

  it("shows next task when no current task and tasks pending", () => {
    const state = makeState({
      tasks: [
        { index: 0, description: "Next up", acceptanceCriteria: [], status: "pending", retries: 0, iterations: [] },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("Next Task (#1):");
    expect(output).toContain('"Next up"');
  });

  it("shows lint command when present", () => {
    const state = makeState({ lintCommand: "npm run lint" });
    const output = formatProgress(state);
    expect(output).toContain("Lint:  npm run lint");
  });

  it("omits lint line when lintCommand is null", () => {
    const state = makeState({ lintCommand: null });
    const output = formatProgress(state);
    expect(output).not.toContain("Lint:");
  });

  it("shows (not detected) for null commands", () => {
    const state = makeState({ buildCommand: null, testCommand: null });
    const output = formatProgress(state);
    expect(output).toContain("Build: (not detected)");
    expect(output).toContain("Test:  (not detected)");
  });

  it("shows iteration count and retry info in task history", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Retried task",
          acceptanceCriteria: [],
          status: "passed",
          retries: 2,
          iterations: [
            { at: "t", result: "fail", detail: "" },
            { at: "t", result: "fail", detail: "" },
            { at: "t", result: "pass", detail: "" },
          ],
        },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("3 iterations");
    expect(output).toContain("2 retries");
  });

  it("shows singular 'retry' for 1 retry", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "One retry task",
          acceptanceCriteria: [],
          status: "passed",
          retries: 1,
          iterations: [
            { at: "t", result: "fail", detail: "" },
            { at: "t", result: "pass", detail: "" },
          ],
        },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("1 retry");
    expect(output).not.toContain("1 retries");
  });

  it("shows singular 'iteration' for 1 iteration", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Single try",
          acceptanceCriteria: [],
          status: "passed",
          retries: 0,
          iterations: [{ at: "t", result: "pass", detail: "" }],
        },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("1 iteration)");
    expect(output).not.toContain("1 iterations");
  });
});

// ─── parseTasksWithAC ─────────────────────────────────────────────────────────

describe("parseTasksWithAC", () => {
  it("extracts tasks with acceptance criteria", () => {
    const content = `## Tasks

- [ ] Task 1: Implement user model
  - AC: User model schema includes name, email, password fields
  - AC: Email validation rejects malformed addresses
  - AC: Passwords hashed with bcrypt before storage
- [ ] Task 2: Add API endpoint
  - AC: POST /users returns 201 on success
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe("Implement user model");
    expect(tasks[0].acceptanceCriteria).toEqual([
      "User model schema includes name, email, password fields",
      "Email validation rejects malformed addresses",
      "Passwords hashed with bcrypt before storage",
    ]);
    expect(tasks[1].description).toBe("Add API endpoint");
    expect(tasks[1].acceptanceCriteria).toEqual([
      "POST /users returns 201 on success",
    ]);
  });

  it("returns empty acceptanceCriteria when no AC lines present", () => {
    const content = `## Tasks

- [ ] Simple task without ACs
- [ ] Another simple task
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].acceptanceCriteria).toEqual([]);
    expect(tasks[1].acceptanceCriteria).toEqual([]);
  });

  it("handles mixed tasks with and without ACs", () => {
    const content = `## Tasks

- [ ] Task with ACs
  - AC: First criterion
- [ ] Task without ACs
- [ ] Another task with ACs
  - AC: Second criterion
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].acceptanceCriteria).toEqual(["First criterion"]);
    expect(tasks[1].acceptanceCriteria).toEqual([]);
    expect(tasks[2].acceptanceCriteria).toEqual(["Second criterion"]);
  });

  it("handles blank lines between AC lines", () => {
    const content = `## Tasks

- [ ] Task with spaced ACs
  - AC: First criterion

  - AC: Second criterion
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks[0].acceptanceCriteria).toEqual([
      "First criterion",
      "Second criterion",
    ]);
  });

  it("stops collecting ACs at next task checkbox", () => {
    const content = `## Tasks

- [ ] First task
  - AC: Belongs to first
- [ ] Second task
  - AC: Belongs to second
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks[0].acceptanceCriteria).toEqual(["Belongs to first"]);
    expect(tasks[1].acceptanceCriteria).toEqual(["Belongs to second"]);
  });

  it("handles asterisk AC markers", () => {
    const content = `## Tasks

- [ ] Task
  * AC: Asterisk criterion
`;
    const tasks = parseTasksWithAC(content);
    expect(tasks[0].acceptanceCriteria).toEqual(["Asterisk criterion"]);
  });

  it("is backward-compatible with parseTasksFromPlan", () => {
    const content = `## Tasks

- [ ] Task 1: Description
  - AC: Some criterion
- [ ] Task 2: Another
`;
    const descriptions = parseTasksFromPlan(content);
    const withAC = parseTasksWithAC(content);
    expect(descriptions).toEqual(withAC.map((t) => t.description));
  });
});

// ─── formatProgress with acceptance criteria ──────────────────────────────────

describe("formatProgress with acceptance criteria", () => {
  it("shows acceptance criteria for current task", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Task with ACs",
          acceptanceCriteria: ["First AC", "Second AC"],
          status: "in_progress",
          retries: 0,
          iterations: [],
        },
      ],
    });

    const output = formatProgress(state);
    expect(output).toContain("Acceptance Criteria:");
    expect(output).toContain("- First AC");
    expect(output).toContain("- Second AC");
  });

  it("does not show acceptance criteria section when empty", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Task without ACs",
          acceptanceCriteria: [],
          status: "in_progress",
          retries: 0,
          iterations: [],
        },
      ],
    });

    const output = formatProgress(state);
    expect(output).not.toContain("Acceptance Criteria:");
  });
});

// ─── formatSummary with acceptance criteria ───────────────────────────────────

describe("formatSummary with acceptance criteria", () => {
  it("shows AC counts when tasks have acceptance criteria", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Passed task",
          acceptanceCriteria: ["AC1", "AC2"],
          status: "passed",
          retries: 0,
          iterations: [{ at: "t", result: "pass", detail: "" }],
        },
        {
          index: 1,
          description: "Failed task",
          acceptanceCriteria: ["AC3"],
          status: "failed",
          retries: 3,
          iterations: [{ at: "t", result: "fail", detail: "err" }],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).toContain("ACs: 2/3 satisfied");
  });

  it("omits AC counts when no tasks have acceptance criteria", () => {
    const state = makeState({
      tasks: [
        {
          index: 0,
          description: "Task",
          acceptanceCriteria: [],
          status: "passed",
          retries: 0,
          iterations: [{ at: "t", result: "pass", detail: "" }],
        },
      ],
    });

    const output = formatSummary(state);
    expect(output).not.toContain("ACs:");
  });
});
