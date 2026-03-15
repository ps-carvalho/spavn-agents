import * as fs from "fs";
import * as path from "path";
import { SPAVN_DIR, SESSIONS_DIR } from "../../utils/constants.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * List recent session summaries from .spavn/sessions/.
 */
export function executeList(
  worktree: string,
  args: { limit?: number },
): HandlerResult {
  const sessionsPath = path.join(worktree, SPAVN_DIR, SESSIONS_DIR);
  if (!fs.existsSync(sessionsPath)) {
    return success(`No sessions found. Sessions are created when you use session_save.`);
  }

  const files = fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).sort().reverse();
  const limit = args.limit || 10;
  const limited = files.slice(0, Math.min(limit, files.length));

  if (limited.length === 0) {
    return success(`No session summaries found in .spavn/sessions/`);
  }

  let output = `✓ Recent Sessions (showing ${limited.length}):\n\n`;
  for (const file of limited) {
    output += `  • ${file}\n`;
  }
  return success(output);
}

/**
 * Load a session summary by filename.
 */
export function executeLoad(
  worktree: string,
  args: { filename: string },
): HandlerResult {
  const filepath = path.join(worktree, SPAVN_DIR, SESSIONS_DIR, args.filename);

  try {
    const content = fs.readFileSync(filepath, "utf-8");
    return success(`✓ Session: ${args.filename}\n\n${content}`);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return success(`✗ Session not found: ${args.filename}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Save a session summary with key decisions to .spavn/sessions/.
 */
export function executeSave(
  worktree: string,
  args: { summary: string; decisions: string[] },
): HandlerResult {
  const sessionsPath = path.join(worktree, SPAVN_DIR, SESSIONS_DIR);

  try {
    fs.mkdirSync(sessionsPath, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const sessionId = Math.random().toString(36).substring(2, 10);
    const filename = `${date}-${sessionId}.md`;
    const filepath = path.join(sessionsPath, filename);

    const content = `# Session Summary\n\n${args.summary}\n\n## Key Decisions\n\n${args.decisions.map((d) => `- ${d}`).join("\n")}`;
    fs.writeFileSync(filepath, content);
    return success(`✓ Session saved: ${filename}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
