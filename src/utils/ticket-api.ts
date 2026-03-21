/**
 * Spavn Code Ticket API Client
 *
 * Provides interaction with the Spavn Code built-in ticket system.
 * Reads configuration from .spavn/config.json ticket_service section.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  labels: string[];
  acceptance_criteria: string[];
  tasks: TicketTask[];
  comments: TicketComment[];
  related_files?: string[];
  plan_ref?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketTask {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  order: number;
  acceptance_criteria?: string[];
}

export interface TicketComment {
  id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface TicketUpdate {
  status?: Ticket["status"];
  title?: string;
  description?: string;
  add_comment?: string;
  sync_tasks?: TicketTask[];
  plan_ref?: string;
}

export interface TicketListFilters {
  status?: string[];
  assignee?: string;
  label?: string;
  limit?: number;
}

interface TicketServiceConfig {
  enabled: boolean;
  base_url: string;
  auth_token?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function loadTicketConfig(worktree: string): TicketServiceConfig | null {
  const configPath = path.join(worktree, ".spavn", "config.json");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config.ticket_service || null;
  } catch {
    return null;
  }
}

function resolveAuthToken(config: TicketServiceConfig): string | undefined {
  if (!config.auth_token) return undefined;

  // Support environment variable interpolation: "${SPAVN_TICKET_TOKEN}"
  const envMatch = config.auth_token.match(/^\$\{([^}]+)\}$/);
  if (envMatch) {
    return process.env[envMatch[1]];
  }

  return config.auth_token;
}

// ─── API Client ──────────────────────────────────────────────────────────────

export class TicketApiClient {
  private baseUrl: string;
  private authToken?: string;
  private enabled: boolean;

  constructor(worktree: string) {
    const config = loadTicketConfig(worktree);

    if (!config || !config.enabled) {
      this.enabled = false;
      this.baseUrl = "";
      return;
    }

    this.enabled = true;
    this.baseUrl = config.base_url.replace(/\/$/, ""); // Remove trailing slash
    this.authToken = resolveAuthToken(config);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    if (!this.enabled) {
      throw new Error("Ticket service is not enabled");
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Ticket API error ${response.status}: ${errorText}`
      );
    }

    return response.json() as Promise<T>;
  }

  // ─── Ticket Operations ─────────────────────────────────────────────────────

  async getTicket(
    id: string,
    options?: { includeTasks?: boolean; includeComments?: boolean }
  ): Promise<Ticket> {
    const params = new URLSearchParams();
    if (options?.includeTasks) params.append("include", "tasks");
    if (options?.includeComments) params.append("include", "comments");

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<Ticket>("GET", `/tickets/${id}${query}`);
  }

  async listTickets(filters?: TicketListFilters): Promise<Ticket[]> {
    const params = new URLSearchParams();

    if (filters?.status?.length) {
      filters.status.forEach((s) => params.append("status", s));
    }
    if (filters?.assignee) {
      params.append("assignee", filters.assignee);
    }
    if (filters?.label) {
      params.append("label", filters.label);
    }
    if (filters?.limit) {
      params.append("limit", filters.limit.toString());
    }

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<Ticket[]>("GET", `/tickets${query}`);
  }

  async updateTicket(id: string, updates: TicketUpdate): Promise<Ticket> {
    return this.request<Ticket>("PATCH", `/tickets/${id}`, updates);
  }

  // ─── Task Operations ───────────────────────────────────────────────────────

  async updateTask(
    ticketId: string,
    taskId: string,
    status: TicketTask["status"],
    result?: string
  ): Promise<TicketTask> {
    return this.request<TicketTask>("PATCH", `/tickets/${ticketId}/tasks/${taskId}`, {
      status,
      result,
    });
  }

  async syncTasks(ticketId: string, tasks: TicketTask[]): Promise<Ticket> {
    return this.request<Ticket>("PATCH", `/tickets/${ticketId}`, {
      sync_tasks: tasks,
    });
  }

  // ─── Plan Sync ─────────────────────────────────────────────────────────────

  async syncPlan(
    ticketId: string,
    planRef: string,
    direction: "plan_to_ticket" | "ticket_to_plan"
  ): Promise<{ ticket: Ticket; syncedTasks: number }> {
    return this.request<{ ticket: Ticket; syncedTasks: number }>(
      "POST",
      `/tickets/${ticketId}/sync-plan`,
      {
        plan_ref: planRef,
        direction,
      }
    );
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

export function extractTicketId(input: string): string | null {
  // Match patterns like: PROJ-123, T-456, TICKET-789, #123
  const patterns = [
    /\b([A-Z]+-\d+)\b/, // PROJ-123, T-456
    /\bticket\s+([A-Z0-9-]+)/i, // "ticket PROJ-123"
    /#(\d+)/, // #123
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export function formatTicketForDisplay(ticket: Ticket): string {
  const lines = [
    `📋 Ticket: ${ticket.id}`,
    `Title: ${ticket.title}`,
    `Status: ${ticket.status} | Priority: ${ticket.priority}`,
  ];

  if (ticket.assignee) {
    lines.push(`Assignee: ${ticket.assignee}`);
  }

  if (ticket.labels.length) {
    lines.push(`Labels: ${ticket.labels.join(", ")}`);
  }

  if (ticket.acceptance_criteria.length) {
    lines.push(`\nAcceptance Criteria:`);
    ticket.acceptance_criteria.forEach((ac, i) => {
      lines.push(`  ${i + 1}. ${ac}`);
    });
  }

  if (ticket.tasks.length) {
    lines.push(`\nTasks (${ticket.tasks.length}):`);
    ticket.tasks.forEach((task) => {
      const icon =
        task.status === "completed"
          ? "✓"
          : task.status === "in_progress"
            ? "○"
            : "•";
      lines.push(`  ${icon} ${task.title}`);
    });
  }

  if (ticket.plan_ref) {
    lines.push(`\n📎 Linked Plan: ${ticket.plan_ref}`);
  }

  return lines.join("\n");
}

export function validatePlanAgainstTicket(
  planTasks: string[],
  ticketACs: string[]
): {
  covered: Array<{ ac: string; task: string }>;
  partial: Array<{ ac: string; task?: string; note: string }>;
  uncovered: string[];
} {
  const covered: Array<{ ac: string; task: string }> = [];
  const partial: Array<{ ac: string; task?: string; note: string }> = [];
  const uncovered: string[] = [];

  for (const ac of ticketACs) {
    const acLower = ac.toLowerCase();
    let found = false;

    for (const task of planTasks) {
      const taskLower = task.toLowerCase();

      // Check for strong match (AC keywords in task)
      const acWords = acLower
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const matchingWords = acWords.filter((w) => taskLower.includes(w));
      const matchRatio = matchingWords.length / acWords.length;

      if (matchRatio > 0.7) {
        covered.push({ ac, task });
        found = true;
        break;
      } else if (matchRatio > 0.3) {
        partial.push({
          ac,
          task,
          note: "Partial keyword match",
        });
        found = true;
        break;
      }
    }

    if (!found) {
      uncovered.push(ac);
    }
  }

  return { covered, partial, uncovered };
}
