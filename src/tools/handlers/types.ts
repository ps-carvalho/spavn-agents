/**
 * Standard result type for all tool handlers.
 * Framework-agnostic — both MCP server and OpenCode plugin wrappers
 * convert this to their own response format.
 */
export interface HandlerResult {
  ok: boolean;
  text: string;
}

export function success(text: string): HandlerResult {
  return { ok: true, text };
}

export function failure(text: string): HandlerResult {
  return { ok: false, text };
}
