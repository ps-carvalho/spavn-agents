/**
 * Ticket API Handlers
 *
 * Business logic for ticket-related MCP tools.
 */

import * as fs from "fs";
import * as path from "path";
import {
  TicketApiClient,
  extractTicketId,
  formatTicketForDisplay,
  validatePlanAgainstTicket,
  type TicketTask,
} from "../../utils/ticket-api.js";
import { SPAVN_DIR, PLANS_DIR } from "../../utils/constants.js";
import { success, failure, type HandlerResult } from "./types.js";

// ─── ticket_get ───────────────────────────────────────────────────────────────

interface GetArgs {
  ticketId: string;
  includeTasks?: boolean;
  includeComments?: boolean;
}

export async function executeGet(
  worktree: string,
  args: GetArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure(
      "✗ Ticket service is not enabled.\n\n" +
        "To enable ticket integration, add to .spavn/config.json:\n" +
        '{\n  "ticket_service": {\n    "enabled": true,\n    "base_url": "http://localhost:3000/api/v1"\n  }\n}'
    );
  }

  try {
    const ticket = await client.getTicket(args.ticketId, {
      includeTasks: args.includeTasks,
      includeComments: args.includeComments,
    });

    const formatted = formatTicketForDisplay(ticket);

    return success(`✓ Ticket loaded\n\n${formatted}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("404") || message.includes("not found")) {
      return failure(`✗ Ticket not found: ${args.ticketId}`);
    }

    if (message.includes("401") || message.includes("403")) {
      return failure(
        `✗ Authentication failed. Check your ticket_service.auth_token in .spavn/config.json`
      );
    }

    return failure(`✗ Failed to load ticket: ${message}`);
  }
}

// ─── ticket_list ──────────────────────────────────────────────────────────────

interface ListArgs {
  status?: string[];
  assignee?: string;
  label?: string;
  limit?: number;
}

export async function executeList(
  worktree: string,
  args: ListArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure(
      "✗ Ticket service is not enabled.\n\n" +
        "To enable ticket integration, add to .spavn/config.json:\n" +
        '{\n  "ticket_service": {\n    "enabled": true,\n    "base_url": "http://localhost:3000/api/v1"\n  }\n}'
    );
  }

  try {
    const tickets = await client.listTickets({
      status: args.status,
      assignee: args.assignee,
      label: args.label,
      limit: args.limit ?? 20,
    });

    if (tickets.length === 0) {
      return success("No tickets found matching the criteria.");
    }

    const lines = [`📋 Tickets (${tickets.length}):\n`];

    for (const ticket of tickets) {
      const statusEmoji =
        ticket.status === "done"
          ? "✅"
          : ticket.status === "in_progress"
            ? "🔄"
            : ticket.status === "review"
              ? "👀"
              : ticket.status === "todo"
                ? "📋"
                : "📥";

      const priorityEmoji =
        ticket.priority === "critical"
          ? "🔴"
          : ticket.priority === "high"
            ? "🟠"
            : ticket.priority === "medium"
              ? "🟡"
              : "🔵";

      lines.push(
        `${statusEmoji} ${ticket.id}: ${ticket.title} ${priorityEmoji}`
      );
      lines.push(`   Status: ${ticket.status} | Tasks: ${ticket.tasks.length}`);

      if (ticket.plan_ref) {
        lines.push(`   📎 Plan: ${ticket.plan_ref}`);
      }

      lines.push("");
    }

    return success(lines.join("\n"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`✗ Failed to list tickets: ${message}`);
  }
}

// ─── ticket_update ────────────────────────────────────────────────────────────

interface UpdateArgs {
  ticketId: string;
  status?: string;
  addComment?: string;
  planRef?: string;
}

export async function executeUpdate(
  worktree: string,
  args: UpdateArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure(
      "✗ Ticket service is not enabled.\n\n" +
        "To enable ticket integration, add to .spavn/config.json"
    );
  }

  // Validate at least one update field is provided
  if (!args.status && !args.addComment && !args.planRef) {
    return failure("✗ No updates specified. Provide status, addComment, or planRef.");
  }

  try {
    const updates: Parameters<typeof client.updateTicket>[1] = {};

    if (args.status) {
      updates.status = args.status as
        | "backlog"
        | "todo"
        | "in_progress"
        | "review"
        | "done";
    }

    if (args.addComment) {
      updates.add_comment = args.addComment;
    }

    if (args.planRef) {
      updates.plan_ref = args.planRef;
    }

    const ticket = await client.updateTicket(args.ticketId, updates);

    const changes: string[] = [];
    if (args.status) changes.push(`status → ${args.status}`);
    if (args.addComment) changes.push("comment added");
    if (args.planRef) changes.push(`plan linked → ${args.planRef}`);

    return success(
      `✓ Ticket ${args.ticketId} updated\n\nChanges: ${changes.join(", ")}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`✗ Failed to update ticket: ${message}`);
  }
}

// ─── ticket_sync_plan ─────────────────────────────────────────────────────────

interface SyncPlanArgs {
  ticketId: string;
  planFilename: string;
  direction: "plan_to_ticket" | "ticket_to_plan";
}

export async function executeSyncPlan(
  worktree: string,
  args: SyncPlanArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure(
      "✗ Ticket service is not enabled.\n\n" +
        "To enable ticket integration, add to .spavn/config.json"
    );
  }

  // Validate plan file exists
  const planPath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.planFilename);
  if (!fs.existsSync(planPath)) {
    return failure(
      `✗ Plan file not found: ${args.planFilename}\n\n` +
        `Use plan_list to see available plans.`
    );
  }

  try {
    const planRef = path.join(".spavn", "plans", args.planFilename);

    const result = await client.syncPlan(
      args.ticketId,
      planRef,
      args.direction
    );

    const directionText =
      args.direction === "plan_to_ticket"
        ? "Plan tasks → Ticket"
        : "Ticket ACs → Plan";

    return success(
      `✓ Plan synced with ticket ${args.ticketId}\n\n` +
        `Direction: ${directionText}\n` +
        `Synced tasks: ${result.syncedTasks}\n` +
        `Ticket status: ${result.ticket.status}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`✗ Failed to sync plan: ${message}`);
  }
}

// ─── ticket_update_task ───────────────────────────────────────────────────────

interface UpdateTaskArgs {
  ticketId: string;
  taskId: string;
  status: "pending" | "in_progress" | "completed";
  result?: string;
}

export async function executeUpdateTask(
  worktree: string,
  args: UpdateTaskArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure(
      "✗ Ticket service is not enabled.\n\n" +
        "To enable ticket integration, add to .spavn/config.json"
    );
  }

  try {
    const task = await client.updateTask(
      args.ticketId,
      args.taskId,
      args.status,
      args.result
    );

    const statusEmoji =
      args.status === "completed" ? "✅" : args.status === "in_progress" ? "🔄" : "⏳";

    return success(
      `${statusEmoji} Task updated\n\n` +
        `Ticket: ${args.ticketId}\n` +
        `Task: ${task.title}\n` +
        `Status: ${args.status}` +
        (args.result ? `\nResult: ${args.result}` : "")
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`✗ Failed to update task: ${message}`);
  }
}

// ─── Helper: Validate Plan Against Ticket ─────────────────────────────────────

interface ValidationArgs {
  ticketId: string;
  planFilename: string;
}

export async function executeValidatePlan(
  worktree: string,
  args: ValidationArgs
): Promise<HandlerResult> {
  const client = new TicketApiClient(worktree);

  if (!client.isEnabled) {
    return failure("✗ Ticket service is not enabled.");
  }

  // Load ticket directly via client
  let ticket;
  try {
    ticket = await client.getTicket(args.ticketId, { includeTasks: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`✗ Failed to load ticket: ${message}`);
  }

  // Load plan and extract tasks
  const planPath = path.join(worktree, SPAVN_DIR, PLANS_DIR, args.planFilename);
  if (!fs.existsSync(planPath)) {
    return failure(`✗ Plan file not found: ${args.planFilename}`);
  }

  const planContent = fs.readFileSync(planPath, "utf-8");

  // Extract tasks from plan (look for - [ ] Task pattern)
  const taskRegex = /^- \[ \] (.+)$/gm;
  const planTasks: string[] = [];
  let match;
  while ((match = taskRegex.exec(planContent)) !== null) {
    planTasks.push(match[1]);
  }

  // Validate against ticket ACs
  const validation = validatePlanAgainstTicket(
    planTasks,
    ticket.acceptance_criteria
  );

  // Build report
  const lines = [
    `📋 Plan vs Ticket Validation`,
    `Ticket: ${ticket.id} - ${ticket.title}`,
    `Plan: ${args.planFilename}`,
    "",
    `✅ Covered (${validation.covered.length}):`,
  ];

  if (validation.covered.length === 0) {
    lines.push("  None");
  } else {
    for (const item of validation.covered) {
      lines.push(`  ✓ "${item.ac.substring(0, 50)}..." → Task: ${item.task.substring(0, 40)}...`);
    }
  }

  lines.push("", `⚠️ Partially Covered (${validation.partial.length}):`);
  if (validation.partial.length === 0) {
    lines.push("  None");
  } else {
    for (const item of validation.partial) {
      lines.push(`  ~ "${item.ac.substring(0, 50)}..."`);
      if (item.note) lines.push(`    Note: ${item.note}`);
    }
  }

  lines.push("", `❌ Not Covered (${validation.uncovered.length}):`);
  if (validation.uncovered.length === 0) {
    lines.push("  None");
  } else {
    for (const ac of validation.uncovered) {
      lines.push(`  ✗ "${ac.substring(0, 60)}..."`);
    }
  }

  const coverage =
    ticket.acceptance_criteria.length > 0
      ? Math.round(
          (validation.covered.length / ticket.acceptance_criteria.length) * 100
        )
      : 100;

  lines.push("", `📊 Coverage: ${coverage}%`);

  return success(lines.join("\n"));
}
