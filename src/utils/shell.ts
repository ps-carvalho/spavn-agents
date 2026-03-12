import { execFile, spawn as cpSpawn } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  /** If true, resolve even on non-zero exit codes instead of rejecting. */
  nothrow?: boolean;
}

/**
 * Execute a command with array-based arguments (no shell invocation).
 * Uses child_process.execFile which never spawns a shell, preventing injection.
 *
 * By default, rejects on non-zero exit codes. Pass `nothrow: true` to always resolve.
 */
export function exec(
  cmd: string,
  args: string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        timeout: opts.timeout ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const result: ExecResult = {
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          exitCode: error ? (error as any).code ?? 1 : 0,
        };

        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(new Error(`Command not found: ${cmd}`));
            return;
          }
          if (!opts.nothrow) {
            const err = new Error(result.stderr || error.message);
            (err as any).exitCode = result.exitCode;
            (err as any).stdout = result.stdout;
            (err as any).stderr = result.stderr;
            reject(err);
            return;
          }
        }

        resolve(result);
      },
    );
  });
}

/**
 * Fire-and-forget spawn. Returns the ChildProcess for PID tracking.
 * Uses child_process.spawn with shell: false (default).
 */
export function spawn(
  cmd: string,
  args: string[],
  opts: ExecOptions & { stdio?: "ignore" | "pipe" } = {},
) {
  const stdio = opts.stdio ?? "ignore";
  const child = cpSpawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "ignore",
    detached: false,
  });
  // Prevent unhandled error crashes on spawn failure
  child.on("error", () => {});
  return child;
}

/**
 * Shorthand for running a git command.
 */
export async function git(cwd: string, ...args: string[]): Promise<ExecResult> {
  return exec("git", ["-C", cwd, ...args]);
}

/**
 * Shorthand for running a gh (GitHub CLI) command.
 */
export async function gh(cwd: string, ...args: string[]): Promise<ExecResult> {
  return exec("gh", args, { cwd });
}

/**
 * Check if a binary exists in PATH.
 */
export async function which(bin: string): Promise<string | null> {
  try {
    const result = await exec(process.platform === "win32" ? "where" : "which", [bin]);
    const p = result.stdout.trim().split("\n")[0];
    return p || null;
  } catch {
    return null;
  }
}

/**
 * Send a signal to a process. Returns true if signal was sent, false if
 * the process doesn't exist or we lack permissions.
 */
export function kill(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a process is alive (sends signal 0 — no actual signal).
 */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape a string for safe inclusion in a shell command.
 * Use only when array-based argument passing is impossible (e.g., osascript).
 */
export function shellEscape(str: string): string {
  // Replace backslashes first, then other dangerous characters
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "'\\''")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/!/g, "\\!");
}
