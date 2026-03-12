import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { git } from "../utils/shell.js";
import { readSpavnConfig } from "../utils/repl.js";

const SPAVN_DIR = ".spavn";
const SESSIONS_DIR = "sessions";

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

function getDatePrefix(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // YYYY-MM-DD
}

function ensureSessionsDir(worktree: string): string {
  const spavnPath = path.join(worktree, SPAVN_DIR);
  const sessionsPath = path.join(spavnPath, SESSIONS_DIR);

  if (!fs.existsSync(sessionsPath)) {
    fs.mkdirSync(sessionsPath, { recursive: true });
  }

  return sessionsPath;
}

function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 10);
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

    const sessionsPath = ensureSessionsDir(context.worktree);
    const datePrefix = getDatePrefix();
    const sessionId = generateSessionId();
    const filename = `${datePrefix}-${sessionId}.md`;
    const filepath = path.join(sessionsPath, filename);

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
    const { limit = 10 } = args;
    const sessionsPath = path.join(context.worktree, SPAVN_DIR, SESSIONS_DIR);

    if (!fs.existsSync(sessionsPath)) {
      return `No sessions found. The .spavn/sessions/ directory doesn't exist.

Sessions are created when you use session_save after completing work.`;
    }

    const files = fs
      .readdirSync(sessionsPath)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, limit);

    if (files.length === 0) {
      return "No session summaries found in .spavn/sessions/";
    }

    let output = `📝 Recent Sessions (showing ${files.length}):\n\n`;

    for (const file of files) {
      const filepath = path.join(sessionsPath, file);
      const content = fs.readFileSync(filepath, "utf-8");

      // Parse frontmatter
      let date = file.substring(0, 10);
      let branch = "unknown";

      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const fm = frontmatterMatch[1];
        const dateMatch = fm.match(/date:\s*(\S+)/);
        const branchMatch = fm.match(/branch:\s*(\S+)/);

        if (dateMatch) date = dateMatch[1].split("T")[0];
        if (branchMatch) branch = branchMatch[1];
      }

      // Get first line of summary (after frontmatter and heading)
      const summaryMatch = content.match(/# Session Summary\n\n([^\n]+)/);
      const summaryPreview = summaryMatch
        ? summaryMatch[1].substring(0, 80) + (summaryMatch[1].length > 80 ? "..." : "")
        : "(no summary)";

      output += `• ${date} [${branch}]\n`;
      output += `  ${summaryPreview}\n`;
      output += `  File: ${file}\n\n`;
    }

    return output.trim();
  },
});

export const load = tool({
  description: "Load a session summary by filename",
  args: {
    filename: tool.schema.string().describe("Session filename"),
  },
  async execute(args, context) {
    const { filename } = args;
    const sessionsPath = path.join(context.worktree, SPAVN_DIR, SESSIONS_DIR);
    const filepath = path.join(sessionsPath, filename);

    if (!fs.existsSync(filepath)) {
      return `✗ Session not found: ${filename}

Use session_list to see available sessions.`;
    }

    const content = fs.readFileSync(filepath, "utf-8");

    return `📝 Session: ${filename}
${"=".repeat(50)}

${content}`;
  },
});
