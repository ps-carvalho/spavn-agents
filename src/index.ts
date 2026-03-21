import type { Plugin } from "@opencode-ai/plugin";
import { SpavnCodeBridge } from "./utils/spavn-code-bridge.js";

// Import all tool modules
import * as spavn from "./tools/spavn";
import * as worktree from "./tools/worktree";
import * as branch from "./tools/branch";
import * as plan from "./tools/plan";
import * as session from "./tools/session";
import * as docs from "./tools/docs";
import * as task from "./tools/task";
import * as github from "./tools/github";
import * as repl from "./tools/repl";
import * as qualityGate from "./tools/quality-gate";
import * as engineTools from "./tools/engine";
import * as ticket from "./tools/ticket";

// ─── Agent Descriptions (for handover toasts) ───────────────────────────────

const AGENT_DESCRIPTIONS: Record<string, string> = {
  implement: "Development mode — ready to implement",
  architect: "Planning mode — read-only analysis",
  fix: "Quick fix mode — fast turnaround",
  worker: "Worker agent — executing enhanced skill",
};

// ─── Tool Notification Config ────────────────────────────────────────────────
//
// Declarative map of tool → toast notification content.
// The `tool.execute.after` hook reads this map after every tool execution
// and fires a toast for tools listed here.
//
// Tools with existing factory-based toasts are NOT listed here to avoid
// double-notifications: worktree_create, worktree_remove, branch_create.
//
// Read-only tools are also excluded (plan_list, plan_load, session_list,
// session_load, docs_list, docs_index, spavn_status, branch_status,
// worktree_list, worktree_open).

interface ToolNotificationConfig {
  successTitle: string;
  successMsg: (args: any, output: string) => string;
  errorTitle: string;
  errorMsg: (args: any, output: string) => string;
  successDuration?: number; // default: 4000ms
  errorDuration?: number; // default: 8000ms
}

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
  plan_edit: {
    successTitle: "Plan Updated",
    successMsg: (args) => `Updated: ${args.filename ?? "plan"}`,
    errorTitle: "Plan Edit Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  plan_start: {
    successTitle: "Plan Created",
    successMsg: (args) => args.title ?? "New plan skeleton",
    errorTitle: "Plan Create Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  plan_interview: {
    successTitle: "Plan Refined",
    successMsg: (args) => `Q&A added to ${(args.planFilename ?? "plan").split("/").pop()?.substring(0, 40)}`,
    errorTitle: "Plan Refine Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  plan_approve: {
    successTitle: "Plan Approved",
    successMsg: (args) => (args.planFilename ?? "plan").split("/").pop()?.substring(0, 40) ?? "Plan approved",
    errorTitle: "Plan Approval Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  // plan_commit — excluded: uses factory-based toasts in createCommit()
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
      `Primary: ${args.primaryModel?.split("/").pop() || "set"}`,
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
  github_status: {
    successTitle: "GitHub Connected",
    successMsg: (_args: any, output: string) => {
      const repoMatch = output.match(/Repository:\s+(.+)/);
      return repoMatch ? `Connected to ${repoMatch[1].substring(0, 100)}` : "GitHub CLI available";
    },
    errorTitle: "GitHub Not Available",
    errorMsg: (_, out) =>
      out
        .replace(/^✗\s*/, "")
        .split("\n")[0]
        .substring(0, 100),
  },
  repl_init: {
    successTitle: "REPL Loop Started",
    successMsg: (args) =>
      `${(args.planFilename ?? "Plan").split("/").pop()?.substring(0, 40)} — tasks loaded`,
    errorTitle: "REPL Init Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  repl_report: {
    successTitle: "Task Update",
    successMsg: (args) => `Result: ${args.result ?? "reported"}`,
    errorTitle: "Report Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  quality_gate_summary: {
    successTitle: "Quality Gate",
    successMsg: (_args: any, output: string) => {
      const recMatch = output.match(/\*\*Recommendation:\s*(GO|NO-GO|GO-WITH-WARNINGS)\*\*/);
      return recMatch ? `Recommendation: ${recMatch[1]}` : "Summary generated";
    },
    errorTitle: "Quality Gate Failed",
    errorMsg: (_, out) => out.substring(0, 100),
    successDuration: 5000,
  },
  ticket_get: {
    successTitle: "Ticket Loaded",
    successMsg: (args) => `Ticket: ${args.ticketId}`,
    errorTitle: "Ticket Load Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  ticket_list: {
    successTitle: "Tickets Listed",
    successMsg: () => "Ticket list retrieved",
    errorTitle: "Ticket List Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  ticket_update: {
    successTitle: "Ticket Updated",
    successMsg: (args) => `Updated: ${args.ticketId}`,
    errorTitle: "Ticket Update Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  ticket_sync_plan: {
    successTitle: "Plan Synced",
    successMsg: (args) => `Synced with ${args.ticketId}`,
    errorTitle: "Plan Sync Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
  ticket_update_task: {
    successTitle: "Task Updated",
    successMsg: (args) => `Status: ${args.status}`,
    errorTitle: "Task Update Failed",
    errorMsg: (_, out) => out.substring(0, 100),
  },
};

// ─── Error Message Extraction ────────────────────────────────────────────────
//
// Extracts a human-readable message from the session error union type
// (ProviderAuthError | UnknownError | MessageOutputLengthError |
//  MessageAbortedError | ApiError).

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

// ─── Plugin Entry ────────────────────────────────────────────────────────────

export const SpavnPlugin: Plugin = async (ctx) => {
  const bridge = new SpavnCodeBridge();

  return {
    tool: {
      // Spavn tools - .spavn directory management
      spavn_init: spavn.init,
      spavn_status: spavn.status,
      spavn_configure: spavn.configure,

      // Worktree tools - git worktree management (factories for toast notifications)
      worktree_create: worktree.createCreate(ctx.client),
      worktree_list: worktree.list,
      worktree_remove: worktree.createRemove(ctx.client),
      worktree_open: worktree.open,

      // Branch tools - git branch operations (factory for toast notifications)
      branch_create: branch.createCreate(ctx.client),
      branch_status: branch.status,
      branch_switch: branch.switch_,

      // Plan tools - implementation plan persistence
      plan_save: plan.save,
      plan_list: plan.list,
      plan_load: plan.load,
      plan_delete: plan.delete_,
      plan_commit: plan.createCommit(ctx.client),
      plan_start: plan.start,
      plan_interview: plan.interview,
      plan_approve: plan.approve,
      plan_edit: plan.edit,

      // Session tools - session summaries with decisions
      session_save: session.save,
      session_list: session.list,
      session_load: session.load,

      // Documentation tools - mermaid docs for decisions, features, flows
      docs_init: docs.init,
      docs_save: docs.save,
      docs_list: docs.list,
      docs_index: docs.index,

      // Task tools - finalize workflow (commit, push, PR)
      task_finalize: task.finalize,

      // GitHub integration tools - work item listing, issue selection, project boards
      github_status: github.status,
      github_issues: github.issues,
      github_projects: github.projects,

      // REPL loop tools - iterative task-by-task implementation
      repl_init: repl.init,
      repl_status: repl.status,
      repl_report: repl.report,
      repl_resume: repl.resume,
      repl_summary: repl.summary,

      // Quality gate aggregation tool
      quality_gate_summary: qualityGate.qualityGateSummary,

      // Engine-backed tools
      spavn_get_skill: engineTools.getSkill,
      spavn_list_agents: engineTools.listAgents,

      // Ticket integration tools
      ticket_get: ticket.get,
      ticket_list: ticket.list,
      ticket_update: ticket.update,
      ticket_sync_plan: ticket.syncPlan,
      ticket_update_task: ticket.updateTask,
    },

    // ── Post-execution toast notifications ────────────────────────────────
    //
    // Fires after every tool execution. Uses the TOOL_NOTIFICATIONS map
    // to determine which tools get toasts and what content to display.
    // Tools with existing factory-based toasts are excluded from the map.
    "tool.execute.after": async (input, output) => {
      const config = TOOL_NOTIFICATIONS[input.tool];
      if (!config) return; // No notification configured for this tool

      try {
        const result = output.output;
        const isSuccess = result.startsWith("✓");
        const isError = result.startsWith("✗");

        if (isSuccess) {
          await ctx.client.tui.showToast({
            body: {
              title: config.successTitle,
              message: config.successMsg(input.args, result),
              variant: "success",
              duration: config.successDuration ?? 4000,
            },
          });
        } else if (isError) {
          await ctx.client.tui.showToast({
            body: {
              title: config.errorTitle,
              message: config.errorMsg(input.args, result),
              variant: "error",
              duration: config.errorDuration ?? 8000,
            },
          });
        }
        // Informational or warning outputs (⚠) — no toast to avoid noise
      } catch {
        // Toast failure is non-fatal
      }
    },

    // ── Event-driven notifications ───────────────────────────────────────
    async event({ event }) {
      // ── Spavn Code bridge (fire-and-forget, no-op outside Spavn Code) ──
      if (bridge.isActive) {
        // session.status busy → agent started working
        if (
          event.type === "session.status" &&
          event.properties.status.type === "busy"
        ) {
          bridge.taskStarted();
        }

        // session.status idle → agent waiting for user input
        if (
          event.type === "session.status" &&
          event.properties.status.type === "idle"
        ) {
          bridge.interactionNeeded("input");
        }

        // session.idle → all processing complete
        if (event.type === "session.idle") {
          bridge.taskFinished();
        }

        // session.error → forward error
        if (event.type === "session.error") {
          const rawError = event.properties.error;
          const error =
            rawError &&
            typeof rawError === "object" &&
            "name" in rawError &&
            typeof (rawError as Record<string, unknown>).name === "string"
              ? (rawError as { name: string; data: Record<string, unknown> })
              : undefined;
          bridge.error(extractErrorMessage(error));
        }

        // message.part.updated — text content
        if (
          event.type === "message.part.updated" &&
          event.properties.part.type === "text"
        ) {
          bridge.text(event.properties.part.text);
        }

        // message.part.updated — tool call
        if (
          event.type === "message.part.updated" &&
          event.properties.part.type === "tool"
        ) {
          const part = event.properties.part;
          bridge.toolCall(part.callID, part.tool, part.metadata);
        }

        // message.updated — token/cost tracking (assistant messages with usage)
        if (
          event.type === "message.updated" &&
          event.properties.info.role === "assistant"
        ) {
          const msg = event.properties.info;
          if ("tokens" in msg && msg.tokens) {
            bridge.usage(
              msg.tokens.input ?? 0,
              msg.tokens.output ?? 0,
              msg.cost ?? 0,
              "modelID" in msg ? (msg.modelID as string) : undefined,
            );
          }
        }
      }

      try {
        // Agent handover notifications
        if (
          event.type === "message.part.updated" &&
          "part" in event.properties &&
          event.properties.part.type === "agent"
        ) {
          const agentName = event.properties.part.name;
          const description =
            AGENT_DESCRIPTIONS[agentName] || `Switched to ${agentName}`;

          await ctx.client.tui.showToast({
            body: {
              title: `Agent: ${agentName}`,
              message: description,
              variant: "info",
              duration: 4000,
            },
          });
        }

        // Session error notifications
        if (event.type === "session.error") {
          const rawError = event.properties.error;
          // Runtime validation before cast — ensure error has expected shape
          const error =
            rawError &&
            typeof rawError === "object" &&
            "name" in rawError &&
            typeof (rawError as Record<string, unknown>).name === "string"
              ? (rawError as { name: string; data: Record<string, unknown> })
              : undefined;
          const message = extractErrorMessage(error);

          await ctx.client.tui.showToast({
            body: {
              title: "Session Error",
              message,
              variant: "error",
              duration: 10000,
            },
          });
        }

      } catch {
        // Toast failure is non-fatal — silently ignore
      }
    },
  };
};

// Default export for OpenCode plugin system
export default SpavnPlugin;
