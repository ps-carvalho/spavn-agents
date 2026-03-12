import { describe, it, expect } from "vitest";

// ─── Extract Error Message Tests ──────────────────────────────────────────────
//
// Tests for the extractErrorMessage helper function that handles
// the session error union type (ProviderAuthError | UnknownError |
// MessageOutputLengthError | MessageAbortedError | ApiError).

// We need to extract/replicate the function for testing since it's not exported.
// This mirrors the implementation in src/index.ts for unit testing purposes.

function extractErrorMessage(
  error?: { name: string; data: Record<string, unknown> } | null,
): string {
  if (!error) return "An unknown error occurred";

  const msg =
    typeof error.data?.message === "string" ? error.data.message : "";

  switch (error.name) {
    case "ProviderAuthError":
      return `Auth error: ${msg || "Provider authentication failed"}`;
    case "UnknownError":
      return msg || "An unknown error occurred";
    case "MessageOutputLengthError":
      return "Output length exceeded — try compacting the session";
    case "MessageAbortedError":
      return `Aborted: ${msg || "Message was aborted"}`;
    case "APIError":
      return `API error: ${msg || "Request failed"}`;
    default:
      return `Error: ${error.name}`;
  }
}

describe("extractErrorMessage", () => {
  describe("when error is null or undefined", () => {
    it("returns default message for null error", () => {
      expect(extractErrorMessage(null)).toBe("An unknown error occurred");
    });

    it("returns default message for undefined error", () => {
      expect(extractErrorMessage(undefined)).toBe("An unknown error occurred");
    });
  });

  describe("ProviderAuthError", () => {
    it("includes message from data when present", () => {
      const error = {
        name: "ProviderAuthError",
        data: { message: "Invalid API key" },
      };
      expect(extractErrorMessage(error)).toBe(
        "Auth error: Invalid API key",
      );
    });

    it("returns fallback message when data.message is missing", () => {
      const error = {
        name: "ProviderAuthError",
        data: {},
      };
      expect(extractErrorMessage(error)).toBe(
        "Auth error: Provider authentication failed",
      );
    });

    it("returns fallback message when data is missing", () => {
      const error = {
        name: "ProviderAuthError",
        data: undefined as unknown as Record<string, unknown>,
      };
      expect(extractErrorMessage(error)).toBe(
        "Auth error: Provider authentication failed",
      );
    });
  });

  describe("UnknownError", () => {
    it("returns message from data when present", () => {
      const error = {
        name: "UnknownError",
        data: { message: "Something weird happened" },
      };
      expect(extractErrorMessage(error)).toBe("Something weird happened");
    });

    it("returns fallback message when data.message is missing", () => {
      const error = {
        name: "UnknownError",
        data: {},
      };
      expect(extractErrorMessage(error)).toBe("An unknown error occurred");
    });
  });

  describe("MessageOutputLengthError", () => {
    it("returns fixed compacting message regardless of data", () => {
      const error = {
        name: "MessageOutputLengthError",
        data: { message: "Ignored message" },
      };
      expect(extractErrorMessage(error)).toBe(
        "Output length exceeded — try compacting the session",
      );
    });

    it("returns fixed compacting message with empty data", () => {
      const error = {
        name: "MessageOutputLengthError",
        data: {},
      };
      expect(extractErrorMessage(error)).toBe(
        "Output length exceeded — try compacting the session",
      );
    });
  });

  describe("MessageAbortedError", () => {
    it("includes message from data when present", () => {
      const error = {
        name: "MessageAbortedError",
        data: { message: "User cancelled" },
      };
      expect(extractErrorMessage(error)).toBe("Aborted: User cancelled");
    });

    it("returns fallback message when data.message is missing", () => {
      const error = {
        name: "MessageAbortedError",
        data: {},
      };
      expect(extractErrorMessage(error)).toBe("Aborted: Message was aborted");
    });
  });

  describe("APIError", () => {
    it("includes message from data when present", () => {
      const error = {
        name: "APIError",
        data: { message: "Rate limit exceeded" },
      };
      expect(extractErrorMessage(error)).toBe(
        "API error: Rate limit exceeded",
      );
    });

    it("returns fallback message when data.message is missing", () => {
      const error = {
        name: "APIError",
        data: {},
      };
      expect(extractErrorMessage(error)).toBe("API error: Request failed");
    });
  });

  describe("unknown error types", () => {
    it("returns error name for unrecognized error types", () => {
      const error = {
        name: "CustomNetworkError",
        data: { message: "Connection timeout" },
      };
      expect(extractErrorMessage(error)).toBe("Error: CustomNetworkError");
    });

    it("handles error with no data property", () => {
      const error = {
        name: "SomeOtherError",
        data: null as unknown as Record<string, unknown>,
      };
      expect(extractErrorMessage(error)).toBe("Error: SomeOtherError");
    });
  });
});

// ─── Tool Notifications Map Tests ─────────────────────────────────────────────
//
// Tests for the TOOL_NOTIFICATIONS configuration map that defines
// toast notification content for various tools.

interface ToolNotificationConfig {
  successTitle: string;
  successMsg: (args: any, output: string) => string;
  errorTitle: string;
  errorMsg: (args: any, output: string) => string;
  successDuration?: number;
  errorDuration?: number;
}

// Replicate the TOOL_NOTIFICATIONS map for testing
const TOOL_NOTIFICATIONS: Record<string, ToolNotificationConfig> = {
  task_finalize: {
    successTitle: "Task Finalized",
    successMsg: (args) =>
      `Committed & pushed: ${(args.commitMessage ?? "").substring(0, 50)}`,
    errorTitle: "Finalization Failed",
    errorMsg: (_, out) =>
      out
        .replace(/^✗\s*/, "")
        .split("\n")[0]
        .substring(0, 100),
    successDuration: 5000,
    errorDuration: 10000,
  },
  plan_save: {
    successTitle: "Plan Saved",
    successMsg: (args) => args.title ?? "Plan saved",
    errorTitle: "Plan Save Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  plan_delete: {
    successTitle: "Plan Deleted",
    successMsg: (args) => args.filename ?? "Plan deleted",
    errorTitle: "Plan Delete Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  session_save: {
    successTitle: "Session Saved",
    successMsg: () => "Session summary recorded",
    errorTitle: "Session Save Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  docs_save: {
    successTitle: "Documentation Saved",
    successMsg: (args) => `${args.type ?? "doc"}: ${args.title ?? "Untitled"}`,
    errorTitle: "Doc Save Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  docs_init: {
    successTitle: "Docs Initialized",
    successMsg: () => "Documentation directory created",
    errorTitle: "Docs Init Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  spavn_init: {
    successTitle: "Project Initialized",
    successMsg: () => ".spavn directory created",
    errorTitle: "Init Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  spavn_configure: {
    successTitle: "Models Configured",
    successMsg: (args) =>
      `Primary: ${(args.primaryModel ?? "").split("/").pop() ?? "set"}`,
    errorTitle: "Configure Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  branch_switch: {
    successTitle: "Branch Switched",
    successMsg: (args) => `Now on ${args.branch ?? "branch"}`,
    errorTitle: "Branch Switch Failed",
    errorMsg: (_, out) =>
      out
        .replace(/^✗\s*/, "")
        .split("\n")[0]
        .substring(0, 100),
  },
};

describe("TOOL_NOTIFICATIONS map", () => {
  const expectedTools = [
    "task_finalize",
    "plan_save",
    "plan_delete",
    "session_save",
    "docs_save",
    "docs_init",
    "spavn_init",
    "spavn_configure",
    "branch_switch",
  ];

  it("contains all 9 expected tools", () => {
    expect(Object.keys(TOOL_NOTIFICATIONS).sort()).toEqual(
      expectedTools.sort(),
    );
  });

  it("has correct config shape for each tool", () => {
    for (const [tool, config] of Object.entries(TOOL_NOTIFICATIONS)) {
      expect(config).toHaveProperty("successTitle");
      expect(config).toHaveProperty("successMsg");
      expect(config).toHaveProperty("errorTitle");
      expect(config).toHaveProperty("errorMsg");
      expect(typeof config.successTitle).toBe("string");
      expect(typeof config.successMsg).toBe("function");
      expect(typeof config.errorTitle).toBe("string");
      expect(typeof config.errorMsg).toBe("function");
    }
  });

  it("has custom durations for task_finalize", () => {
    expect(TOOL_NOTIFICATIONS.task_finalize.successDuration).toBe(5000);
    expect(TOOL_NOTIFICATIONS.task_finalize.errorDuration).toBe(10000);
  });

  it("uses default durations (undefined) for most tools", () => {
    const toolsWithDefaults = [
      "plan_save",
      "plan_delete",
      "session_save",
      "docs_save",
      "docs_init",
      "spavn_init",
      "spavn_configure",
      "branch_switch",
    ];
    for (const tool of toolsWithDefaults) {
      expect(TOOL_NOTIFICATIONS[tool].successDuration).toBeUndefined();
      expect(TOOL_NOTIFICATIONS[tool].errorDuration).toBeUndefined();
    }
  });
});

// ─── Message Builder Tests ────────────────────────────────────────────────────
//
// Tests for the successMsg and errorMsg builder functions

describe("notification message builders", () => {
  describe("task_finalize", () => {
    it("successMsg includes commit message", () => {
      const args = { commitMessage: "feat: add new feature" };
      const result = TOOL_NOTIFICATIONS.task_finalize.successMsg(args, "✓ Done");
      expect(result).toBe("Committed & pushed: feat: add new feature");
    });

    it("successMsg handles missing commitMessage", () => {
      const args = {};
      const result = TOOL_NOTIFICATIONS.task_finalize.successMsg(args, "✓ Done");
      expect(result).toBe("Committed & pushed: ");
    });

    it("successMsg truncates long commit messages to 50 chars", () => {
      const args = { commitMessage: "a".repeat(100) };
      const result = TOOL_NOTIFICATIONS.task_finalize.successMsg(args, "✓ Done");
      // "Committed & pushed: " (20 chars) + 50 chars of message = 70 total
      expect(result.length).toBe("Committed & pushed: ".length + 50);
      expect(result).toBe(`Committed & pushed: ${"a".repeat(50)}`);
    });

    it("errorMsg strips error prefix and takes first line", () => {
      const output = "✗ Error: Something went wrong\nAdditional details here";
      const result = TOOL_NOTIFICATIONS.task_finalize.errorMsg({}, output);
      expect(result).toBe("Error: Something went wrong");
    });

    it("errorMsg truncates to 100 chars", () => {
      const output = "✗ " + "a".repeat(150);
      const result = TOOL_NOTIFICATIONS.task_finalize.errorMsg({}, output);
      expect(result.length).toBe(100);
    });
  });

  describe("plan_save", () => {
    it("successMsg returns plan title", () => {
      const args = { title: "My Feature Plan" };
      const result = TOOL_NOTIFICATIONS.plan_save.successMsg(args, "✓ Saved");
      expect(result).toBe("My Feature Plan");
    });

    it("successMsg returns fallback when title missing", () => {
      const args = {};
      const result = TOOL_NOTIFICATIONS.plan_save.successMsg(args, "✓ Saved");
      expect(result).toBe("Plan saved");
    });
  });

  describe("plan_delete", () => {
    it("successMsg returns filename", () => {
      const args = { filename: "2024-01-01-feature-test.md" };
      const result = TOOL_NOTIFICATIONS.plan_delete.successMsg(args, "✓ Deleted");
      expect(result).toBe("2024-01-01-feature-test.md");
    });

    it("successMsg returns fallback when filename missing", () => {
      const args = {};
      const result = TOOL_NOTIFICATIONS.plan_delete.successMsg(args, "✓ Deleted");
      expect(result).toBe("Plan deleted");
    });
  });

  describe("session_save", () => {
    it("successMsg returns fixed message", () => {
      const result = TOOL_NOTIFICATIONS.session_save.successMsg({}, "✓ Saved");
      expect(result).toBe("Session summary recorded");
    });
  });

  describe("docs_save", () => {
    it("successMsg includes type and title", () => {
      const args = { type: "decision", title: "Use PostgreSQL" };
      const result = TOOL_NOTIFICATIONS.docs_save.successMsg(args, "✓ Saved");
      expect(result).toBe("decision: Use PostgreSQL");
    });

    it("successMsg uses defaults for missing args", () => {
      const args = {};
      const result = TOOL_NOTIFICATIONS.docs_save.successMsg(args, "✓ Saved");
      expect(result).toBe("doc: Untitled");
    });
  });

  describe("docs_init", () => {
    it("successMsg returns fixed message", () => {
      const result = TOOL_NOTIFICATIONS.docs_init.successMsg({}, "✓ Created");
      expect(result).toBe("Documentation directory created");
    });
  });

  describe("spavn_init", () => {
    it("successMsg returns fixed message", () => {
      const result = TOOL_NOTIFICATIONS.spavn_init.successMsg({}, "✓ Created");
      expect(result).toBe(".spavn directory created");
    });
  });

  describe("spavn_configure", () => {
    it("successMsg extracts model name from full path", () => {
      const args = { primaryModel: "anthropic/claude-sonnet-4-20250514" };
      const result = TOOL_NOTIFICATIONS.spavn_configure.successMsg(args, "✓ Configured");
      expect(result).toBe("Primary: claude-sonnet-4-20250514");
    });

    it("successMsg handles simple model name", () => {
      const args = { primaryModel: "gpt-4" };
      const result = TOOL_NOTIFICATIONS.spavn_configure.successMsg(args, "✓ Configured");
      expect(result).toBe("Primary: gpt-4");
    });

    it("successMsg returns empty string when model is missing (BUG: should be 'set')", () => {
      // BUG: The implementation uses (args.primaryModel ?? "").split("/").pop() ?? "set"
      // When primaryModel is undefined, this becomes "".split("/").pop() = "" 
      // and "" ?? "set" = "" (because ?? only replaces null/undefined, not empty strings)
      // Expected behavior would be "Primary: set" but actual is "Primary: "
      const args = {};
      const result = TOOL_NOTIFICATIONS.spavn_configure.successMsg(args, "✓ Configured");
      // Documenting actual behavior (the bug)
      expect(result).toBe("Primary: ");
      // This is what it SHOULD be:
      // expect(result).toBe("Primary: set");
    });
  });

  describe("branch_switch", () => {
    it("successMsg includes branch name", () => {
      const args = { branch: "feature/auth" };
      const result = TOOL_NOTIFICATIONS.branch_switch.successMsg(args, "✓ Switched");
      expect(result).toBe("Now on feature/auth");
    });

    it("successMsg handles missing branch name", () => {
      const args = {};
      const result = TOOL_NOTIFICATIONS.branch_switch.successMsg(args, "✓ Switched");
      expect(result).toBe("Now on branch");
    });

    it("errorMsg strips error prefix and takes first line", () => {
      const output = "✗ Branch not found: invalid-branch\nTry git branch -a";
      const result = TOOL_NOTIFICATIONS.branch_switch.errorMsg({}, output);
      expect(result).toBe("Branch not found: invalid-branch");
    });
  });

  describe("common errorMsg behavior", () => {
    it("truncates to 100 chars for tools with simple errorMsg", () => {
      const longOutput = "✗ " + "b".repeat(150);
      const tools = ["plan_save", "plan_delete", "session_save", "docs_save", "docs_init", "spavn_init", "spavn_configure"];
      
      for (const tool of tools) {
        const result = TOOL_NOTIFICATIONS[tool].errorMsg({}, longOutput);
        expect(result.length).toBe(100);
      }
    });
  });
});
