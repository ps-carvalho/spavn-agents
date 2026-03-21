import { tool } from "@opencode-ai/plugin";
import * as ticketHandlers from "./handlers/ticket.js";

// ─── Tool: ticket_get ─────────────────────────────────────────────────────────

export const get = tool({
  description:
    "Fetch ticket details from Spavn Code. Use this when the user mentions a ticket ID " +
    "to load context, acceptance criteria, and current task status. " +
    "Returns formatted ticket with ACs, tasks, and metadata.",
  args: {
    ticketId: tool.schema
      .string()
      .describe("Ticket ID (e.g., 'PROJ-123', 'T-456')"),
    includeTasks: tool.schema
      .boolean()
      .optional()
      .describe("Include ticket tasks in response (default: true)"),
    includeComments: tool.schema
      .boolean()
      .optional()
      .describe("Include ticket comments in response (default: false)"),
  },
  async execute(args, context) {
    const result = await ticketHandlers.executeGet(context.worktree, {
      ticketId: args.ticketId,
      includeTasks: args.includeTasks ?? true,
      includeComments: args.includeComments ?? false,
    });
    return result.text;
  },
});

// ─── Tool: ticket_list ────────────────────────────────────────────────────────

export const list = tool({
  description:
    "List tickets from Spavn Code with optional filters. " +
    "Use this to browse the backlog or find tickets by status/label.",
  args: {
    status: tool.schema
      .array(tool.schema.enum(["backlog", "todo", "in_progress", "review", "done"]))
      .optional()
      .describe("Filter by ticket status"),
    assignee: tool.schema
      .string()
      .optional()
      .describe("Filter by assignee username"),
    label: tool.schema
      .string()
      .optional()
      .describe("Filter by label"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of tickets to return (default: 20)"),
  },
  async execute(args, context) {
    const result = await ticketHandlers.executeList(context.worktree, {
      status: args.status,
      assignee: args.assignee,
      label: args.label,
      limit: args.limit ?? 20,
    });
    return result.text;
  },
});

// ─── Tool: ticket_update ──────────────────────────────────────────────────────

export const update = tool({
  description:
    "Update a ticket's status, add a comment, or modify fields. " +
    "Use this to sync plan progress back to the ticket. " +
    "WARNING: This modifies the ticket — always confirm with user before using.",
  args: {
    ticketId: tool.schema.string().describe("Ticket ID to update"),
    status: tool.schema
      .enum(["backlog", "todo", "in_progress", "review", "done"])
      .optional()
      .describe("New ticket status"),
    addComment: tool.schema
      .string()
      .optional()
      .describe("Add a comment to the ticket (markdown supported)"),
    planRef: tool.schema
      .string()
      .optional()
      .describe("Link a plan file to this ticket (e.g., '.spavn/plans/2026-03-21-feature-auth.md')"),
  },
  async execute(args, context) {
    const result = await ticketHandlers.executeUpdate(context.worktree, {
      ticketId: args.ticketId,
      status: args.status,
      addComment: args.addComment,
      planRef: args.planRef,
    });
    return result.text;
  },
});

// ─── Tool: ticket_sync_plan ───────────────────────────────────────────────────

export const syncPlan = tool({
  description:
    "Synchronize a plan with a ticket. Creates/updates ticket tasks to match plan tasks, " +
    "or vice versa. Also links the plan to the ticket. " +
    "Use this after plan approval to enable ticket-based progress tracking.",
  args: {
    ticketId: tool.schema.string().describe("Ticket ID to sync with"),
    planFilename: tool.schema
      .string()
      .describe("Plan filename from .spavn/plans/ (e.g., '2026-03-21-feature-auth.md')"),
    direction: tool.schema
      .enum(["plan_to_ticket", "ticket_to_plan"])
      .describe("Sync direction: plan_to_ticket creates ticket tasks from plan, ticket_to_plan creates plan from ticket ACs"),
  },
  async execute(args, context) {
    const result = await ticketHandlers.executeSyncPlan(context.worktree, {
      ticketId: args.ticketId,
      planFilename: args.planFilename,
      direction: args.direction,
    });
    return result.text;
  },
});

// ─── Tool: ticket_update_task ─────────────────────────────────────────────────

export const updateTask = tool({
  description:
    "Update the status of a specific ticket task. " +
    "Use this when implementing agent completes a task to sync progress.",
  args: {
    ticketId: tool.schema.string().describe("Ticket ID containing the task"),
    taskId: tool.schema.string().describe("Task ID to update"),
    status: tool.schema
      .enum(["pending", "in_progress", "completed"])
      .describe("New task status"),
    result: tool.schema
      .string()
      .optional()
      .describe("Optional result/notes (e.g., 'Tests passing', 'Blocked by X')"),
  },
  async execute(args, context) {
    const result = await ticketHandlers.executeUpdateTask(context.worktree, {
      ticketId: args.ticketId,
      taskId: args.taskId,
      status: args.status,
      result: args.result,
    });
    return result.text;
  },
});
