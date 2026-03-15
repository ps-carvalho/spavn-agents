import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SPAVN_DIR, PLANS_DIR, SESSIONS_DIR } from "../../utils/constants.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Initialize .spavn directory in project root for plan storage,
 * session history, and configuration.
 */
export function executeInit(worktree: string): HandlerResult {
  const spavnPath = path.join(worktree, SPAVN_DIR);
  try {
    if (!fs.existsSync(spavnPath)) {
      fs.mkdirSync(spavnPath, { recursive: true });
      fs.mkdirSync(path.join(spavnPath, PLANS_DIR), { recursive: true });
      fs.mkdirSync(path.join(spavnPath, SESSIONS_DIR), { recursive: true });
      return success(`✓ Initialized .spavn directory at ${spavnPath}`);
    } else {
      return success(`✓ .spavn directory already exists at ${spavnPath}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Check .spavn directory status — whether it exists, plan count, session count.
 */
export function executeStatus(worktree: string): HandlerResult {
  const spavnPath = path.join(worktree, SPAVN_DIR);
  if (!fs.existsSync(spavnPath)) {
    return success(`✗ .spavn directory not found at ${spavnPath}\n\nRun spavn_init to initialize.`);
  }

  const plansPath = path.join(spavnPath, PLANS_DIR);
  const sessionsPath = path.join(spavnPath, SESSIONS_DIR);

  const planCount = fs.existsSync(plansPath)
    ? fs.readdirSync(plansPath).filter((f) => f.endsWith(".md")).length
    : 0;
  const sessionCount = fs.existsSync(sessionsPath)
    ? fs.readdirSync(sessionsPath).filter((f) => f.endsWith(".md")).length
    : 0;

  return success(`✓ .spavn directory status\n\nLocation: ${spavnPath}\nPlans: ${planCount}\nSessions: ${sessionCount}`);
}

/**
 * Configure AI models for this project (primary agents and subagents).
 */
export function executeConfigure(
  worktree: string,
  args: { scope: string; primaryModel: string; subagentModel: string },
): HandlerResult {
  try {
    const configDir = args.scope === "project"
      ? path.join(worktree, SPAVN_DIR)
      : path.join(os.homedir(), SPAVN_DIR);
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");

    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        // corrupted file, start fresh
      }
    }

    config.primaryModel = args.primaryModel;
    config.subagentModel = args.subagentModel;
    config.updatedAt = new Date().toISOString();

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return success(`✓ Configured models (persisted to ${configPath})\n\nScope: ${args.scope}\nPrimary: ${args.primaryModel}\nSubagent: ${args.subagentModel}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
