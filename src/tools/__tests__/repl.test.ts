import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReplState, ReplTask, CommandDetection } from "../../utils/repl.js";

// ─── Mock @opencode-ai/plugin ────────────────────────────────────────────────
// The tool() call is a passthrough that returns the definition as-is,
// so we can call execute() directly in tests.

function createSchemaChain(type: string): any {
  const chain: any = {
    _type: type,
    optional: () => createSchemaChain(`${type}?`),
    describe: () => ({ _type: type }),
    enum: (values: string[]) => createSchemaChain(`enum(${values.join(",")})`),
    array: () => createSchemaChain("array"),
  };
  return chain;
}

vi.mock("@opencode-ai/plugin", () => {
  const toolFn: any = (definition: any) => definition;
  toolFn.schema = {
    string: () => createSchemaChain("string"),
    number: () => createSchemaChain("number"),
    boolean: () => createSchemaChain("boolean"),
    enum: (values: string[]) => createSchemaChain(`enum(${values.join(",")})`),
    array: () => createSchemaChain("array"),
  };
  return { tool: toolFn };
});

// ─── Mock fs ─────────────────────────────────────────────────────────────────

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// ─── Mock utils/repl.js ──────────────────────────────────────────────────────

vi.mock("../../utils/repl.js", () => ({
  parseTasksWithAC: vi.fn(),
  detectCommands: vi.fn(),
  readSpavnConfig: vi.fn().mockReturnValue({}),
  readReplState: vi.fn(),
  writeReplState: vi.fn(),
  getNextTask: vi.fn(),
  getCurrentTask: vi.fn(),
  isLoopComplete: vi.fn(),
  detectIncompleteState: vi.fn(),
  formatProgress: vi.fn(),
  formatSummary: vi.fn(),
  computeBatches: vi.fn().mockReturnValue([]),
  getReadyTasks: vi.fn().mockReturnValue([]),
}));

// Import after mocks
const fs = await import("fs");
const {
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
} = await import("../../utils/repl.js");
const replTools = await import("../repl.js");

const mockParseTasksWithAC = vi.mocked(parseTasksWithAC);
const mockDetectCommands = vi.mocked(detectCommands);
const mockReadReplState = vi.mocked(readReplState);
const mockWriteReplState = vi.mocked(writeReplState);
const mockGetNextTask = vi.mocked(getNextTask);
const mockGetCurrentTask = vi.mocked(getCurrentTask);
const mockIsLoopComplete = vi.mocked(isLoopComplete);
const mockFormatProgress = vi.mocked(formatProgress);
const mockFormatSummary = vi.mocked(formatSummary);
const mockComputeBatches = vi.mocked(computeBatches);
const mockGetReadyTasks = vi.mocked(getReadyTasks);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockContext = { worktree: "/tmp/test-repl" } as any;

function makeTask(overrides: Partial<ReplTask> = {}): ReplTask {
  return {
    index: 0,
    description: "Implement feature X",
    acceptanceCriteria: [],
    status: "pending",
    retries: 0,
    iterations: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<ReplState> = {}): ReplState {
  return {
    version: 2,
    planFilename: "2024-01-01-feature-test.md",
    startedAt: "2024-01-01T00:00:00.000Z",
    buildCommand: "npm run build",
    testCommand: "npx vitest run",
    lintCommand: null,
    maxRetries: 3,
    currentTaskIndex: -1,
    tasks: [
      makeTask({ index: 0, description: "Task A" }),
      makeTask({ index: 1, description: "Task B" }),
      makeTask({ index: 2, description: "Task C" }),
    ],
    ...overrides,
  };
}

function makeDetection(overrides: Partial<CommandDetection> = {}): CommandDetection {
  return {
    buildCommand: "npm run build",
    testCommand: "npx vitest run",
    lintCommand: null,
    framework: "vitest",
    detected: true,
    ...overrides,
  };
}

// ─── Tool Exports Shape ──────────────────────────────────────────────────────

describe("repl tools module exports", () => {
  it("should export 'init' tool", () => {
    expect(replTools.init).toBeDefined();
    expect(typeof replTools.init).toBe("object");
  });

  it("should export 'status' tool", () => {
    expect(replTools.status).toBeDefined();
    expect(typeof replTools.status).toBe("object");
  });

  it("should export 'report' tool", () => {
    expect(replTools.report).toBeDefined();
    expect(typeof replTools.report).toBe("object");
  });

  it("should export 'summary' tool", () => {
    expect(replTools.summary).toBeDefined();
    expect(typeof replTools.summary).toBe("object");
  });

  it("should export exactly five named tools", () => {
    const exportedKeys = Object.keys(replTools).filter(
      (k) => !k.startsWith("__"),
    );
    expect(exportedKeys).toContain("init");
    expect(exportedKeys).toContain("status");
    expect(exportedKeys).toContain("report");
    expect(exportedKeys).toContain("resume");
    expect(exportedKeys).toContain("summary");
    expect(exportedKeys).toHaveLength(5);
  });
});

// ─── Tool Descriptions ───────────────────────────────────────────────────────

describe("repl tools have descriptions", () => {
  it("init tool should describe REPL initialization", () => {
    expect(typeof replTools.init.description).toBe("string");
    expect(replTools.init.description.length).toBeGreaterThan(0);
    expect(replTools.init.description).toContain("REPL");
  });

  it("status tool should describe progress tracking", () => {
    expect(typeof replTools.status.description).toBe("string");
    expect(replTools.status.description.length).toBeGreaterThan(0);
    expect(replTools.status.description).toContain("progress");
  });

  it("report tool should describe task outcome reporting", () => {
    expect(typeof replTools.report.description).toBe("string");
    expect(replTools.report.description.length).toBeGreaterThan(0);
    expect(replTools.report.description).toContain("outcome");
  });

  it("summary tool should describe summary generation", () => {
    expect(typeof replTools.summary.description).toBe("string");
    expect(replTools.summary.description.length).toBeGreaterThan(0);
    expect(replTools.summary.description).toContain("summary");
  });
});

// ─── Tool Execute Functions ──────────────────────────────────────────────────

describe("repl tools have execute functions", () => {
  it("init tool should have an execute function", () => {
    expect(typeof replTools.init.execute).toBe("function");
  });

  it("status tool should have an execute function", () => {
    expect(typeof replTools.status.execute).toBe("function");
  });

  it("report tool should have an execute function", () => {
    expect(typeof replTools.report.execute).toBe("function");
  });

  it("summary tool should have an execute function", () => {
    expect(typeof replTools.summary.execute).toBe("function");
  });
});

// ─── Argument Schemas ────────────────────────────────────────────────────────

describe("repl tools argument schemas", () => {
  it("init tool should accept planFilename, buildCommand, testCommand, maxRetries", () => {
    const argKeys = Object.keys(replTools.init.args);
    expect(argKeys).toContain("planFilename");
    expect(argKeys).toContain("buildCommand");
    expect(argKeys).toContain("testCommand");
    expect(argKeys).toContain("maxRetries");
  });

  it("status tool should have empty args", () => {
    expect(Object.keys(replTools.status.args)).toHaveLength(0);
  });

  it("report tool should accept result, detail, and taskIndex", () => {
    const argKeys = Object.keys(replTools.report.args);
    expect(argKeys).toContain("result");
    expect(argKeys).toContain("detail");
    expect(argKeys).toContain("taskIndex");
    expect(argKeys).toHaveLength(3);
  });

  it("summary tool should have empty args", () => {
    expect(Object.keys(replTools.summary.args)).toHaveLength(0);
  });
});

// ─── repl_init execution ─────────────────────────────────────────────────────

describe("repl_init execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when plan file not found", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await replTools.init.execute(
      { planFilename: "nonexistent.md" },
      mockContext,
    );

    expect(result).toContain("✗ Error: Plan not found");
    expect(result).toContain("nonexistent.md");
  });

  it("returns error when plan has no tasks", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("# Empty Plan\n\nNo tasks here.");
    mockParseTasksWithAC.mockReturnValue([]);

    const result = await replTools.init.execute(
      { planFilename: "empty-plan.md" },
      mockContext,
    );

    expect(result).toContain("✗ Error: No tasks found");
    expect(result).toContain("empty-plan.md");
  });

  it("initializes loop with auto-detected commands", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A\n- [ ] Task B");
    mockParseTasksWithAC.mockReturnValue([
      { description: "Task A", acceptanceCriteria: [], dependsOn: [] },
      { description: "Task B", acceptanceCriteria: [], dependsOn: [] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    const result = await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    expect(result).toContain("✓ REPL loop initialized");
    expect(result).toContain("Tasks: 2");
    expect(result).toContain("Auto-detected (vitest)");
    expect(result).toContain("npm run build");
    expect(result).toContain("npx vitest run");
    expect(result).toContain("Task A");
    expect(mockWriteReplState).toHaveBeenCalledOnce();
  });

  it("uses override commands when provided", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    const result = await replTools.init.execute(
      {
        planFilename: "test-plan.md",
        buildCommand: "make build",
        testCommand: "make test",
      },
      mockContext,
    );

    expect(result).toContain("✓ REPL loop initialized");
    expect(result).toContain("make build");
    expect(result).toContain("make test");
  });

  it("uses custom maxRetries when provided", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    const result = await replTools.init.execute(
      { planFilename: "test-plan.md", maxRetries: 5 },
      mockContext,
    );

    expect(result).toContain("Max retries: 5");

    // Verify the state was written with maxRetries: 5
    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.maxRetries).toBe(5);
  });

  it("shows 'Not detected' when no commands found", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(
      makeDetection({ detected: false, framework: "unknown", buildCommand: null, testCommand: null }),
    );

    const result = await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    expect(result).toContain("Not detected");
    expect(result).toContain("(none)");
  });

  it("writes state with correct initial structure", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A\n- [ ] Task B");
    mockParseTasksWithAC.mockReturnValue([
      { description: "Task A", acceptanceCriteria: [], dependsOn: [] },
      { description: "Task B", acceptanceCriteria: [], dependsOn: [] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    expect(mockWriteReplState).toHaveBeenCalledWith(
      "/tmp/test-repl",
      expect.objectContaining({
        planFilename: "test-plan.md",
        buildCommand: "npm run build",
        testCommand: "npx vitest run",
        maxRetries: 3,
        currentTaskIndex: -1,
        tasks: expect.arrayContaining([
          expect.objectContaining({ index: 0, description: "Task A", status: "pending" }),
          expect.objectContaining({ index: 1, description: "Task B", status: "pending" }),
        ]),
      }),
    );
  });

  it("prevents path traversal in plan filename", async () => {
    // existsSync returns true for the traversal path but the tool should reject it
    mockExistsSync.mockReturnValue(true);

    const result = await replTools.init.execute(
      { planFilename: "../../etc/passwd" },
      mockContext,
    );

    expect(result).toContain("✗ Error: Invalid plan filename");
  });

  it("shows lint command when detected", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(
      makeDetection({ lintCommand: "npm run lint" }),
    );

    const result = await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    expect(result).toContain("Lint:  npm run lint");
  });
});

// ─── repl_status execution ───────────────────────────────────────────────────

describe("repl_status execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no REPL loop active", async () => {
    mockReadReplState.mockReturnValue(null);

    const result = await replTools.status.execute({}, mockContext);

    expect(result).toContain("✗ No REPL loop active");
    expect(result).toContain("repl_init");
  });

  it("returns formatted progress when loop is active", async () => {
    const state = makeState();
    const task = makeTask({ index: 0, status: "in_progress" });
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(task);
    mockFormatProgress.mockReturnValue("Progress: ██░░ 1/3 tasks (33%)");

    const result = await replTools.status.execute({}, mockContext);

    expect(result).toContain("✓ REPL Loop Status");
    expect(result).toContain("Progress: ██░░ 1/3 tasks (33%)");
  });

  it("auto-advances to next pending task when none in progress", async () => {
    const nextTask = makeTask({ index: 0, description: "Task A", status: "pending" });
    const state = makeState({ tasks: [nextTask] });
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);
    mockIsLoopComplete.mockReturnValue(false);
    mockGetReadyTasks.mockReturnValue([nextTask]);
    mockFormatProgress.mockReturnValue("Progress: ░░░░ 0/3 tasks (0%)");

    await replTools.status.execute({}, mockContext);

    // Should have promoted the next task to in_progress
    expect(nextTask.status).toBe("in_progress");
    expect(state.currentTaskIndex).toBe(0);
    expect(state.activeTaskIndices).toEqual([0]);
    expect(mockWriteReplState).toHaveBeenCalledWith("/tmp/test-repl", state);
  });

  it("does not auto-advance when loop is complete", async () => {
    const state = makeState();
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);
    mockIsLoopComplete.mockReturnValue(true);
    mockFormatProgress.mockReturnValue("All tasks complete.");

    await replTools.status.execute({}, mockContext);

    expect(mockGetNextTask).not.toHaveBeenCalled();
    expect(mockWriteReplState).not.toHaveBeenCalled();
  });
});

// ─── repl_report execution ───────────────────────────────────────────────────

describe("repl_report execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no REPL loop active", async () => {
    mockReadReplState.mockReturnValue(null);

    const result = await replTools.report.execute(
      { result: "pass", detail: "All tests green" },
      mockContext,
    );

    expect(result).toContain("✗ No REPL loop active");
  });

  it("returns error when no task is in progress", async () => {
    const state = makeState({ currentTaskIndex: -1 });
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);

    const result = await replTools.report.execute(
      { result: "pass", detail: "All tests green" },
      mockContext,
    );

    expect(result).toContain("✗ No task is currently in progress");
  });

  it("marks task as passed and advances to next", async () => {
    const currentTask = makeTask({ index: 0, description: "Task A", status: "in_progress" });
    const nextTask = makeTask({ index: 1, description: "Task B", status: "pending" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0],
      tasks: [currentTask, nextTask, makeTask({ index: 2, description: "Task C" })],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([nextTask]);
    mockIsLoopComplete.mockReturnValue(false);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Build and tests passed" },
      mockContext,
    );

    expect(result).toContain("✓ Task #1 PASSED");
    expect(result).toContain("1st attempt");
    expect(result).toContain("Next: Task #2");
    expect(currentTask.status).toBe("passed");
    expect(nextTask.status).toBe("in_progress");
    expect(mockWriteReplState).toHaveBeenCalled();
  });

  it("records iteration on pass", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    await replTools.report.execute(
      { result: "pass", detail: "All green" },
      mockContext,
    );

    expect(currentTask.iterations).toHaveLength(1);
    expect(currentTask.iterations[0].result).toBe("pass");
    expect(currentTask.iterations[0].detail).toBe("All green");
  });

  it("retries on fail when retries remaining", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 0 });
    const state = makeState({ currentTaskIndex: 0, maxRetries: 3, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);

    const result = await replTools.report.execute(
      { result: "fail", detail: "Test failed: expected 2 got 3" },
      mockContext,
    );

    expect(result).toContain("⚠ Task #1 FAILED");
    expect(result).toContain("attempt 1/3");
    expect(result).toContain("2 retries remaining");
    // Task should stay in_progress, not advance
    expect(currentTask.status).toBe("in_progress");
    expect(currentTask.retries).toBe(1);
    expect(mockWriteReplState).toHaveBeenCalled();
  });

  it("escalates to user when retries exhausted", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 2 });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], maxRetries: 3, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "fail", detail: "Still broken" },
      mockContext,
    );

    expect(result).toContain("✗ Task #1 FAILED");
    expect(result).toContain("retries exhausted");
    expect(result).toContain("ASK THE USER");
    expect(currentTask.status).toBe("failed");
  });

  it("marks task as skipped and advances", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const nextTask = makeTask({ index: 1, description: "Task B", status: "pending" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0],
      tasks: [currentTask, nextTask],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([nextTask]);
    mockIsLoopComplete.mockReturnValue(false);

    const result = await replTools.report.execute(
      { result: "skip", detail: "Not applicable to this project" },
      mockContext,
    );

    expect(result).toContain("⊘ Task #1 SKIPPED");
    expect(result).toContain("Not applicable");
    expect(result).toContain("Next: Task #2");
    expect(currentTask.status).toBe("skipped");
  });

  it("reports all tasks complete when no next task", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    expect(result).toContain("All tasks complete");
    expect(result).toContain("repl_summary");
    expect(state.completedAt).toBeDefined();
  });

  it("truncates detail to 2000 characters", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const longDetail = "x".repeat(3000);
    await replTools.report.execute(
      { result: "pass", detail: longDetail },
      mockContext,
    );

    expect(currentTask.iterations[0].detail).toHaveLength(2000);
  });

  it("handles pending task at currentTaskIndex gracefully", async () => {
    const pendingTask = makeTask({ index: 1, description: "Task B", status: "pending" });
    const state = makeState({
      currentTaskIndex: 1,
      activeTaskIndices: [],
      tasks: [
        makeTask({ index: 0, status: "passed" }),
        pendingTask,
      ],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null); // No in_progress task
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    // Should have promoted the pending task and processed it
    expect(pendingTask.status).toBe("passed");
  });

  it("shows correct ordinal suffixes for attempts", async () => {
    const currentTask = makeTask({
      index: 0,
      status: "in_progress",
      iterations: [
        { at: "2024-01-01T00:00:00Z", result: "fail", detail: "first try" },
      ],
    });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Fixed it" },
      mockContext,
    );

    expect(result).toContain("2nd attempt");
  });
});

// ─── repl_summary execution ──────────────────────────────────────────────────

describe("repl_summary execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no REPL loop data found", async () => {
    mockReadReplState.mockReturnValue(null);

    const result = await replTools.summary.execute({}, mockContext);

    expect(result).toContain("✗ No REPL loop data found");
  });

  it("returns formatted summary from state", async () => {
    const state = makeState();
    mockReadReplState.mockReturnValue(state);
    mockFormatSummary.mockReturnValue("## REPL Loop Summary\n\n| # | Task | Status |\n...");

    const result = await replTools.summary.execute({}, mockContext);

    expect(result).toContain("## REPL Loop Summary");
    expect(mockFormatSummary).toHaveBeenCalledWith(state);
  });
});

// ─── Additional repl_report edge cases ───────────────────────────────────────

describe("repl_report edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 3rd attempt ordinal suffix", async () => {
    const currentTask = makeTask({
      index: 0,
      status: "in_progress",
      iterations: [
        { at: "2024-01-01T00:00:00Z", result: "fail", detail: "try 1" },
        { at: "2024-01-01T00:01:00Z", result: "fail", detail: "try 2" },
      ],
    });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Finally worked" },
      mockContext,
    );

    expect(result).toContain("3rd attempt");
  });

  it("shows 4th attempt ordinal suffix (uses 'th')", async () => {
    const currentTask = makeTask({
      index: 0,
      status: "in_progress",
      iterations: [
        { at: "t", result: "fail", detail: "" },
        { at: "t", result: "fail", detail: "" },
        { at: "t", result: "fail", detail: "" },
      ],
    });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], maxRetries: 5, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    expect(result).toContain("4th attempt");
  });

  it("immediately exhausts retries when maxRetries is 1", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 0 });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], maxRetries: 1, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "fail", detail: "Broken" },
      mockContext,
    );

    expect(result).toContain("retries exhausted");
    expect(result).toContain("ASK THE USER");
    expect(currentTask.status).toBe("failed");
  });

  it("shows singular 'retry' when 1 retry remaining", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 1 });
    const state = makeState({ currentTaskIndex: 0, maxRetries: 3, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);

    const result = await replTools.report.execute(
      { result: "fail", detail: "Still broken" },
      mockContext,
    );

    expect(result).toContain("1 retry remaining");
    expect(result).not.toContain("1 retries remaining");
  });

  it("shows plural 'retries' when multiple retries remaining", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 0 });
    const state = makeState({ currentTaskIndex: 0, maxRetries: 3, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);

    const result = await replTools.report.execute(
      { result: "fail", detail: "Broken" },
      mockContext,
    );

    expect(result).toContain("2 retries remaining");
  });

  it("sets completedAt when all tasks done after pass", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    expect(state.completedAt).toBeDefined();
    expect(state.currentTaskIndex).toBe(-1);
  });

  it("sets completedAt when all tasks done after skip", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    await replTools.report.execute(
      { result: "skip", detail: "Not needed" },
      mockContext,
    );

    expect(state.completedAt).toBeDefined();
    expect(state.currentTaskIndex).toBe(-1);
  });

  it("sets completedAt when all tasks done after final fail", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress", retries: 2 });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], maxRetries: 3, tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    await replTools.report.execute(
      { result: "fail", detail: "Exhausted" },
      mockContext,
    );

    expect(state.completedAt).toBeDefined();
    expect(currentTask.status).toBe("failed");
  });

  it("does not process report for non-pending task at currentTaskIndex", async () => {
    const passedTask = makeTask({ index: 0, status: "passed" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [],
      tasks: [passedTask],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Already done" },
      mockContext,
    );

    // Task is at currentTaskIndex but status is "passed" (not "pending"),
    // so it should still be processed via processReport
    // The task status should be overwritten to "passed" again
    expect(passedTask.status).toBe("passed");
    expect(passedTask.iterations).toHaveLength(1);
  });

  it("truncates detail in output to 200 characters", async () => {
    const currentTask = makeTask({ index: 0, status: "in_progress" });
    const state = makeState({ currentTaskIndex: 0, activeTaskIndices: [0], tasks: [currentTask] });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(true);

    const longDetail = "D".repeat(500);
    const result = await replTools.report.execute(
      { result: "pass", detail: longDetail },
      mockContext,
    );

    // The output should contain the truncated detail (200 chars)
    expect(result).toContain("D".repeat(200));
    // But the iteration detail is capped at 2000
    expect(currentTask.iterations[0].detail).toHaveLength(500);
  });

  it("handles report when currentTaskIndex is out of bounds", async () => {
    const state = makeState({
      currentTaskIndex: 99, // out of bounds
      tasks: [makeTask({ index: 0, status: "passed" })],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    expect(result).toContain("✗ No task is currently in progress");
  });

  it("handles report when currentTaskIndex is negative", async () => {
    const state = makeState({
      currentTaskIndex: -1,
      tasks: [makeTask({ index: 0, status: "pending" })],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done" },
      mockContext,
    );

    expect(result).toContain("✗ No task is currently in progress");
  });
});

// ─── Additional repl_init edge cases ─────────────────────────────────────────

describe("repl_init edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with a single task plan", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Only task");
    mockParseTasksWithAC.mockReturnValue([{ description: "Only task", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    const result = await replTools.init.execute(
      { planFilename: "single-task.md" },
      mockContext,
    );

    expect(result).toContain("Tasks: 1");
    expect(result).toContain("Only task");
    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.tasks).toHaveLength(1);
  });

  it("uses default maxRetries of 3 when not provided", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.maxRetries).toBe(3);
  });

  it("sets startedAt to current ISO timestamp", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.startedAt).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(writtenState.startedAt).toISOString()).toBe(writtenState.startedAt);
  });

  it("does not set completedAt on initialization", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.completedAt).toBeUndefined();
  });

  it("all tasks start with pending status and zero retries", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] A\n- [ ] B\n- [ ] C");
    mockParseTasksWithAC.mockReturnValue([
      { description: "A", acceptanceCriteria: [], dependsOn: [] },
      { description: "B", acceptanceCriteria: [], dependsOn: [] },
      { description: "C", acceptanceCriteria: [], dependsOn: [] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());

    await replTools.init.execute(
      { planFilename: "test-plan.md" },
      mockContext,
    );

    const writtenState = mockWriteReplState.mock.calls[0][1];
    for (const task of writtenState.tasks) {
      expect(task.status).toBe("pending");
      expect(task.retries).toBe(0);
      expect(task.iterations).toEqual([]);
    }
  });

  it("preserves lint command from detection even with build/test overrides", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A");
    mockParseTasksWithAC.mockReturnValue([{ description: "Task A", acceptanceCriteria: [], dependsOn: [] }]);
    mockDetectCommands.mockResolvedValue(
      makeDetection({ lintCommand: "npm run lint" }),
    );

    await replTools.init.execute(
      {
        planFilename: "test-plan.md",
        buildCommand: "custom build",
        testCommand: "custom test",
      },
      mockContext,
    );

    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.buildCommand).toBe("custom build");
    expect(writtenState.testCommand).toBe("custom test");
    expect(writtenState.lintCommand).toBe("npm run lint");
  });
});

// ─── repl_status edge cases ──────────────────────────────────────────────────

describe("repl_status edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write state when task is already in progress", async () => {
    const state = makeState();
    const currentTask = makeTask({ index: 1, status: "in_progress" });
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(currentTask);
    mockFormatProgress.mockReturnValue("Progress info");

    await replTools.status.execute({}, mockContext);

    // Should NOT call writeReplState since there's already a current task
    expect(mockWriteReplState).not.toHaveBeenCalled();
  });

  it("does not call getNextTask when loop is complete", async () => {
    const state = makeState();
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);
    mockIsLoopComplete.mockReturnValue(true);
    mockFormatProgress.mockReturnValue("All done");

    await replTools.status.execute({}, mockContext);

    expect(mockGetNextTask).not.toHaveBeenCalled();
  });

  it("promotes all ready tasks in batch when auto-advancing", async () => {
    const taskA = makeTask({ index: 0, description: "Task A", status: "pending" });
    const taskB = makeTask({ index: 1, description: "Task B", status: "pending" });
    const state = makeState({
      tasks: [taskA, taskB],
    });
    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(null);
    mockIsLoopComplete.mockReturnValue(false);
    mockGetReadyTasks.mockReturnValue([taskA, taskB]);
    mockFormatProgress.mockReturnValue("Progress info");

    await replTools.status.execute({}, mockContext);

    // Both tasks should be promoted to in_progress
    expect(taskA.status).toBe("in_progress");
    expect(taskB.status).toBe("in_progress");
    expect(state.activeTaskIndices).toEqual([0, 1]);
    expect(state.currentTaskIndex).toBe(0);
    expect(mockWriteReplState).toHaveBeenCalledWith("/tmp/test-repl", state);
  });
});

// ─── repl_report with taskIndex ──────────────────────────────────────────────

describe("repl_report with explicit taskIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports on specific task by index", async () => {
    const taskA = makeTask({ index: 0, description: "Task A", status: "in_progress" });
    const taskB = makeTask({ index: 1, description: "Task B", status: "in_progress" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0, 1],
      tasks: [taskA, taskB],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(taskA);
    mockGetReadyTasks.mockReturnValue([]);
    mockIsLoopComplete.mockReturnValue(false);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 1 },
      mockContext,
    );

    expect(result).toContain("Task #2 PASSED");
    expect(taskB.status).toBe("passed");
  });

  it("returns error for invalid task index", async () => {
    const state = makeState({
      tasks: [makeTask({ index: 0, status: "in_progress" })],
    });

    mockReadReplState.mockReturnValue(state);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 99 },
      mockContext,
    );

    expect(result).toContain("✗ Invalid task index: 99");
  });

  it("returns error when task at index is not in_progress", async () => {
    const state = makeState({
      tasks: [
        makeTask({ index: 0, status: "pending" }),
        makeTask({ index: 1, status: "passed" }),
      ],
    });

    mockReadReplState.mockReturnValue(state);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 1 },
      mockContext,
    );

    expect(result).toContain("✗ Task #2 is not in progress (status: passed)");
  });

  it("shows parallel tasks still in progress after completing one", async () => {
    const taskA = makeTask({ index: 0, description: "Task A", status: "in_progress" });
    const taskB = makeTask({ index: 1, description: "Task B", status: "in_progress" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0, 1],
      tasks: [taskA, taskB],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(taskA);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 0 },
      mockContext,
    );

    expect(result).toContain("1 parallel task(s) still in progress");
    expect(state.activeTaskIndices).toEqual([1]);
  });

  it("advances to next batch when all parallel tasks complete", async () => {
    const taskA = makeTask({ index: 0, description: "Task A", status: "in_progress" });
    const taskB = makeTask({ index: 1, description: "Task B", status: "pending", dependsOn: [0] });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0],
      tasks: [taskA, taskB],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(taskA);
    mockGetReadyTasks.mockReturnValue([taskB]);
    mockIsLoopComplete.mockReturnValue(false);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 0 },
      mockContext,
    );

    expect(result).toContain("Next: Task #2");
    expect(taskB.status).toBe("in_progress");
    expect(state.activeTaskIndices).toEqual([1]);
  });

  it("shows next batch info when multiple tasks become ready", async () => {
    const taskA = makeTask({ index: 0, description: "Task A", status: "in_progress" });
    const taskB = makeTask({ index: 1, description: "Task B", status: "pending" });
    const taskC = makeTask({ index: 2, description: "Task C", status: "pending" });
    const state = makeState({
      currentTaskIndex: 0,
      activeTaskIndices: [0],
      tasks: [taskA, taskB, taskC],
    });

    mockReadReplState.mockReturnValue(state);
    mockGetCurrentTask.mockReturnValue(taskA);
    mockGetReadyTasks.mockReturnValue([taskB, taskC]);
    mockIsLoopComplete.mockReturnValue(false);

    const result = await replTools.report.execute(
      { result: "pass", detail: "Done", taskIndex: 0 },
      mockContext,
    );

    expect(result).toContain("Next batch (2 parallel tasks):");
    expect(result).toContain('Task #2: "Task B"');
    expect(result).toContain('Task #3: "Task C"');
  });
});

// ─── repl_init with dependencies ─────────────────────────────────────────────

describe("repl_init with dependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates dependsOn from parsed tasks and computes batches", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A\n- [ ] Task B (depends: 1)");
    mockParseTasksWithAC.mockReturnValue([
      { description: "Task A", acceptanceCriteria: [], dependsOn: [] },
      { description: "Task B", acceptanceCriteria: [], dependsOn: [0] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());
    mockComputeBatches.mockReturnValue([
      { id: 0, taskIndices: [0], status: "pending" as const },
      { id: 1, taskIndices: [1], status: "pending" as const },
    ]);

    const result = await replTools.init.execute(
      { planFilename: "dep-plan.md" },
      mockContext,
    );

    expect(result).toContain("✓ REPL loop initialized");
    expect(result).toContain("Batches: 2");
    expect(result).toContain("first batch: 1 parallel task)");

    const writtenState = mockWriteReplState.mock.calls[0][1];
    expect(writtenState.version).toBe(3);
    expect(writtenState.tasks[0].dependsOn).toEqual([]);
    expect(writtenState.tasks[1].dependsOn).toEqual([0]);
    expect(writtenState.batches).toHaveLength(2);
    expect(writtenState.activeTaskIndices).toEqual([]);
  });

  it("returns error when circular dependency detected", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] Task A (depends: 2)\n- [ ] Task B (depends: 1)");
    mockParseTasksWithAC.mockReturnValue([
      { description: "Task A", acceptanceCriteria: [], dependsOn: [1] },
      { description: "Task B", acceptanceCriteria: [], dependsOn: [0] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());
    mockComputeBatches.mockImplementation(() => {
      throw new Error("Circular dependency detected among tasks: #1, #2");
    });

    const result = await replTools.init.execute(
      { planFilename: "circular-plan.md" },
      mockContext,
    );

    expect(result).toContain("✗ Error: Circular dependency");
    expect(mockWriteReplState).not.toHaveBeenCalled();
  });

  it("shows plural 'tasks' in batch info when first batch has multiple tasks", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("## Tasks\n- [ ] A\n- [ ] B\n- [ ] C (depends: 1, 2)");
    mockParseTasksWithAC.mockReturnValue([
      { description: "A", acceptanceCriteria: [], dependsOn: [] },
      { description: "B", acceptanceCriteria: [], dependsOn: [] },
      { description: "C", acceptanceCriteria: [], dependsOn: [0, 1] },
    ]);
    mockDetectCommands.mockResolvedValue(makeDetection());
    mockComputeBatches.mockReturnValue([
      { id: 0, taskIndices: [0, 1], status: "pending" as const },
      { id: 1, taskIndices: [2], status: "pending" as const },
    ]);

    const result = await replTools.init.execute(
      { planFilename: "parallel-plan.md" },
      mockContext,
    );

    expect(result).toContain("Batches: 2 (first batch: 2 parallel tasks)");
  });
});
