// ─── Spavn Code Event Bridge ─────────────────────────────────────────────────
//
// When running inside Spavn Code's embedded terminal, the environment provides:
//   SPAVN_EVENT_URL  — HTTP endpoint for structured events
//   SPAVN_TASK_ID    — ID of the parent task in Spavn Code
//   SPAVN_CODE       — "1" when running inside Spavn Code
//
// This bridge POSTs structured events so Spavn Code can precisely track agent
// state (working, waiting, finished) instead of relying on ANSI heuristics.
//
// Payload format (Spavn Event Protocol):
//   { spavn: "event", taskId, type, timestamp, ...fields }
//
// All HTTP calls are fire-and-forget with a 5s timeout — they never block the
// agent or throw errors.

export class SpavnCodeBridge {
  private readonly eventUrl: string | undefined;
  private readonly taskId: string | undefined;
  private readonly active: boolean;

  // Accumulated usage for task_finished summary
  private tokensIn = 0;
  private tokensOut = 0;
  private costUsd = 0;

  private sessionStartTime = Date.now();
  private started = false;

  constructor() {
    this.eventUrl = process.env.SPAVN_EVENT_URL;
    this.taskId = process.env.SPAVN_TASK_ID;
    const spavnCode = process.env.SPAVN_CODE;

    this.active = !!(this.eventUrl && this.taskId && spavnCode);
  }

  get isActive(): boolean {
    return this.active;
  }

  // ── Event Senders ─────────────────────────────────────────────────────────

  taskStarted(): void {
    if (this.started) return;
    this.started = true;
    this.sessionStartTime = Date.now();
    this.send("task_started", {});
  }

  taskFinished(): void {
    const duration = Date.now() - this.sessionStartTime;
    this.send("task_finished", {
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      costUsd: this.costUsd,
      duration,
    });
  }

  usage(tokensIn: number, tokensOut: number, costUsd: number, model?: string): void {
    this.tokensIn += tokensIn;
    this.tokensOut += tokensOut;
    this.costUsd += costUsd;
    this.send("usage", {
      tokensIn,
      tokensOut,
      costUsd,
      ...(model ? { model } : {}),
    });
  }

  interactionNeeded(reason: string, prompt?: string): void {
    this.send("interaction_needed", {
      reason,
      ...(prompt ? { prompt } : {}),
    });
  }

  text(content: string): void {
    this.send("text", { content });
  }

  toolCall(id: string, name: string, input?: unknown): void {
    this.send("tool_call", {
      id,
      name,
      ...(input !== undefined ? { input } : {}),
    });
  }

  error(message: string, code?: string, recoverable?: boolean): void {
    this.send("error", {
      message,
      ...(code ? { code } : {}),
      ...(recoverable !== undefined ? { recoverable } : {}),
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private send(type: string, fields: Record<string, unknown>): void {
    if (!this.active) return;

    const payload = {
      spavn: "event" as const,
      taskId: this.taskId!,
      type,
      timestamp: Date.now(),
      ...fields,
    };

    fetch(this.eventUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}
