import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { git } from "../utils/shell.js";
import { readSpavnConfig } from "../utils/repl.js";
import { SPAVN_DIR, SESSIONS_DIR } from "../utils/constants.js";
import { getDatePrefix } from "../utils/strings.js";
import * as sessionHandlers from "./handlers/session.js";

/**
 * Delete session files older than the configured retention period.
 */
function cleanExpiredSessions(worktree: string): number {
  const config = readSpavnConfig(worktree);
  const retentionDays = config.sessionRetentionDays;
  if (!retentionDays || retentionDays <= 0) return 0;

  const sessionsPath = path.join(worktree, SPAVN_DIR, SESSIONS_DIR);
  if (!fs.existsSync(sessionsPath)) return 0;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const file of fs.readdirSync(sessionsPath)) {
    if (!file.endsWith(".md")) continue;
    // Session filenames start with YYYY-MM-DD — parse the date prefix
    const dateStr = file.substring(0, 10);
    const fileDate = new Date(dateStr);
    if (!isNaN(fileDate.getTime()) && fileDate.getTime() < cutoff) {
      try {
        fs.unlinkSync(path.join(sessionsPath, file));
        deleted++;
      } catch {
        // Ignore deletion errors
      }
    }
  }
  return deleted;
}

export const save = tool({
  description:
    "Save a session summary with key decisions to .spavn/sessions/",
  args: {
    summary: tool.schema
      .string()
      .describe("Brief summary of what was accomplished in this session"),
    decisions: tool.schema
      .array(tool.schema.string())
      .describe("List of key decisions made during the session"),
    filesChanged: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Optional list of files that were modified"),
    relatedPlan: tool.schema
      .string()
      .optional()
      .describe("Optional filename of related plan"),
    branch: tool.schema
      .string()
      .optional()
      .describe("Git branch this work was done on"),
  },
  async execute(args, context) {
    const { summary, decisions, filesChanged, relatedPlan, branch } = args;

    // Get current branch if not provided
    let currentBranch = branch;
    if (!currentBranch) {
      try {
        const { stdout } = await git(context.worktree, "branch", "--show-current");
        currentBranch = stdout.trim();
      } catch {
        currentBranch = "unknown";
      }
    }

    // Use the handler for core save logic — but the OpenCode plugin version
    // has richer content (frontmatter, filesChanged, relatedPlan, branch)
    // that the simplified handler doesn't support. Keep the full logic here.
    const sessionsPath = path.join(context.worktree, SPAVN_DIR, SESSIONS_DIR);
    if (!fs.existsSync(sessionsPath)) {
      fs.mkdirSync(sessionsPath, { recursive: true });
    }

    const datePrefix = getDatePrefix();
    const sessionId = Math.random().toString(36).substring(2, 10);
    const filename = `${datePrefix}-${sessionId}.md`;
    const filepath = path.join(sessionsPath, filename);

    // Build content
    let content = `---
date: ${new Date().toISOString()}
branch: ${currentBranch}
${relatedPlan ? `relatedPlan: ${relatedPlan}` : ""}
---

# Session Summary

${summary}

## Key Decisions

${decisions.map((d) => `- ${d}`).join("\n")}
`;

    if (filesChanged && filesChanged.length > 0) {
      content += `
## Files Changed

${filesChanged.map((f) => `- \`${f}\``).join("\n")}
`;
    }

    if (relatedPlan) {
      content += `
## Related Plan

See: \`.spavn/plans/${relatedPlan}\`
`;
    }

    // Write file
    fs.writeFileSync(filepath, content);

    // Clean up expired sessions based on retention config
    const cleaned = cleanExpiredSessions(context.worktree);
    const cleanedMsg = cleaned > 0 ? `\nCleaned up ${cleaned} expired session(s).` : "";

    return `✓ Session summary saved

File: ${filename}
Branch: ${currentBranch}
Decisions recorded: ${decisions.length}
${filesChanged ? `Files tracked: ${filesChanged.length}` : ""}${cleanedMsg}

Session summaries are stored in .spavn/sessions/ and gitignored by default.`;
  },
});

export const list = tool({
  description: "List recent session summaries from .spavn/sessions/",
  args: {
    limit: tool.schema
      .number()
      .optional()
      .describe("Maximum number of sessions to return (default: 10)"),
  },
  async execute(args, context) {
    const result = sessionHandlers.executeList(context.worktree, { limit: args.limit });
    return result.text;
  },
});

export const load = tool({
  description: "Load a session summary by filename",
  args: {
    filename: tool.schema.string().describe("Session filename"),
  },
  async execute(args, context) {
    const result = sessionHandlers.executeLoad(context.worktree, { filename: args.filename });
    return result.text;
  },
});
