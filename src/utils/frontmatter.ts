import * as fs from "fs";

/**
 * Parsed frontmatter result. Values are strings for simple fields,
 * or string arrays for bracket-delimited lists like `tags: [a, b, c]`.
 */
export interface FrontmatterFields {
  [key: string]: string | string[];
}

/**
 * Parse YAML-like frontmatter from content delimited by `---`.
 * Handles:
 * - Simple key-value: `key: value`
 * - Quoted values: `key: "value with spaces"`
 * - Array values: `key: [a, b, c]` or `key: ["a", "b"]`
 *
 * Does NOT handle nested YAML (that's handled by engine/seed.ts).
 * Returns null if no frontmatter block is found.
 */
export function parseFrontmatter(content: string): FrontmatterFields | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields: FrontmatterFields = {};
  for (const line of match[1].split("\n")) {
    // Try array value first: key: [a, b, c]
    const arrMatch = line.match(/^(\w+):\s*\[([^\]]*)\]/);
    if (arrMatch) {
      fields[arrMatch[1]] = arrMatch[2]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      continue;
    }

    // Simple key-value (with optional quotes)
    const kvMatch = line.match(/^(\w+):\s*"?([^"\n]*)"?\s*$/);
    if (kvMatch) {
      fields[kvMatch[1]] = kvMatch[2].trim();
    }
  }

  return fields;
}

/**
 * Read only the first N bytes of a file and parse frontmatter.
 * Useful for list operations where only metadata is needed.
 * Returns null if the file doesn't exist or has no frontmatter.
 */
export function readFrontmatterOnly(filePath: string, maxBytes = 512): FrontmatterFields | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    const content = buf.toString("utf-8", 0, bytesRead);
    return parseFrontmatter(content);
  } finally {
    fs.closeSync(fd);
  }
}
