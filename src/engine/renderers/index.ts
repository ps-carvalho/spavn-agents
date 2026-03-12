// ---------------------------------------------------------------------------
// Spavn Engine — Renderer registry
// Each target (claude, opencode, etc.) registers a factory that can produce
// rendered agent files and instructions from the canonical DB representation.
// ---------------------------------------------------------------------------

import type BetterSqlite3 from "better-sqlite3";
import type { SyncResult } from "../types.js";

/** A renderer knows how to turn DB rows into on-disk files for one target. */
export interface Renderer {
  /** Render a single agent to its target format string. */
  renderAgent(agentId: string): string;
  /** Render the instructions file content (CLAUDE.md, etc.). */
  renderInstructions(): string;
  /** Sync all agents + instructions to disk, return results. */
  sync(opts?: { scope?: string; projectPath?: string }): SyncResult;
}

/** Factory that creates a Renderer backed by the given database. */
export interface RendererFactory {
  (db: BetterSqlite3.Database): Renderer;
}

const registry = new Map<string, RendererFactory>();

export function registerRenderer(
  targetId: string,
  factory: RendererFactory,
): void {
  registry.set(targetId, factory);
}

export function getRenderer(
  targetId: string,
  db: BetterSqlite3.Database,
): Renderer | null {
  const factory = registry.get(targetId);
  return factory ? factory(db) : null;
}
