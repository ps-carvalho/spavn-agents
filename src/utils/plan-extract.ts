import * as fs from "fs";
import * as path from "path";
import { SPAVN_DIR, PLANS_DIR } from "./constants.js";
import { parseFrontmatter as parseRawFrontmatter } from "./frontmatter.js";

/**
 * Map plan types to git branch prefixes.
 */
export const TYPE_TO_PREFIX: Record<string, string> = {
  feature: "feature",
  bugfix: "bugfix",
  refactor: "refactor",
  architecture: "refactor",
  spike: "feature",
  docs: "docs",
};

/**
 * Parse YAML frontmatter from plan content, coercing all values to strings.
 * Returns a map of key-value pairs, or null if no frontmatter found.
 */
export function parseFrontmatter(content: string): Record<string, string> | null {
  const fields = parseRawFrontmatter(content);
  if (!fields) return null;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    result[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return result;
}

/**
 * Update or insert a field in the plan's YAML frontmatter.
 * Returns the updated file content.
 */
export function upsertFrontmatterField(content: string, key: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;

  const fmBody = fmMatch[2];
  const fieldRegex = new RegExp(`^${key}:\\s*.*$`, "m");

  let updatedFm: string;
  if (fieldRegex.test(fmBody)) {
    // Update existing field
    updatedFm = fmBody.replace(fieldRegex, `${key}: ${value}`);
  } else {
    // Insert before the closing ---
    updatedFm = fmBody + `\n${key}: ${value}`;
  }

  return fmMatch[1] + updatedFm + fmMatch[3] + content.slice(fmMatch[0].length);
}

/**
 * Sections extracted from a plan for use in a PR body.
 */
export interface PlanSections {
  /** Plan title from frontmatter or first heading */
  title: string;
  /** Summary paragraph(s) */
  summary: string;
  /** Task list in markdown checkbox format */
  tasks: string;
  /** Key decisions section */
  decisions: string;
  /** The raw plan filename */
  filename: string;
}

/**
 * Extract the branch name from plan frontmatter.
 *
 * Looks for `branch: feature/xyz` in YAML frontmatter.
 * Returns the branch name string, or null if not found.
 */
export function extractBranch(planContent: string): string | null {
  const frontmatterMatch = planContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const branchMatch = frontmatterMatch[1].match(/^branch:\s*(.+)$/m);
  if (!branchMatch) return null;

  const branch = branchMatch[1].trim();
  return branch || null;
}

/**
 * Extract GitHub issue references from plan frontmatter.
 *
 * Looks for `issues: [42, 51]` in YAML frontmatter.
 * Returns an array of issue numbers, or an empty array if none found.
 */
export function extractIssueRefs(planContent: string): number[] {
  const frontmatterMatch = planContent.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return [];

  // Match issues: [42, 51] or issues: [42]
  const issuesMatch = frontmatterMatch[1].match(/issues:\s*\[([^\]]*)\]/);
  if (!issuesMatch) return [];

  return issuesMatch[1]
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Extract relevant sections from a plan markdown file for composing a PR body.
 *
 * Parses the plan looking for ## Summary, ## Tasks, and ## Key Decisions sections.
 * Falls back gracefully if sections are missing.
 */
export function extractPlanSections(planContent: string, filename: string): PlanSections {
  const result: PlanSections = {
    title: "",
    summary: "",
    tasks: "",
    decisions: "",
    filename,
  };

  // Extract title from frontmatter
  const frontmatterMatch = planContent.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const titleMatch = frontmatterMatch[1].match(/title:\s*"?([^"\n]+)"?/);
    if (titleMatch) result.title = titleMatch[1].trim();
  }

  // Fallback: extract title from first # heading
  if (!result.title) {
    const headingMatch = planContent.match(/^#\s+(.+)$/m);
    if (headingMatch) result.title = headingMatch[1].trim();
  }

  // Extract sections by heading
  // Split on ## headings and capture each section
  const sections = splitByHeadings(planContent);

  for (const [heading, content] of sections) {
    const h = heading.toLowerCase();

    if (h.includes("summary")) {
      result.summary = content.trim();
    } else if (h.includes("task")) {
      result.tasks = content.trim();
    } else if (h.includes("decision") || h.includes("key decision")) {
      result.decisions = content.trim();
    }
  }

  return result;
}

/**
 * Split markdown content into sections based on ## headings.
 * Returns an array of [heading, content] tuples.
 */
function splitByHeadings(content: string): [string, string][] {
  const sections: [string, string][] = [];
  const lines = content.split("\n");

  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentHeading) {
        sections.push([currentHeading, currentContent.join("\n")]);
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else if (currentHeading) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeading) {
    sections.push([currentHeading, currentContent.join("\n")]);
  }

  return sections;
}

/**
 * Build a PR body from extracted plan sections.
 */
export function buildPrBodyFromPlan(sections: PlanSections): string {
  const parts: string[] = [];

  if (sections.summary) {
    parts.push(`## Summary\n\n${sections.summary}`);
  }

  if (sections.tasks) {
    parts.push(`## Tasks\n\n${sections.tasks}`);
  }

  if (sections.decisions) {
    parts.push(`## Key Decisions\n\n${sections.decisions}`);
  }

  if (parts.length === 0) {
    return `Implementation based on plan: \`${sections.filename}\``;
  }

  parts.push(
    `---\n*Auto-generated by spavn-agents from plan: \`${sections.filename}\`*`,
  );

  return parts.join("\n\n");
}

/**
 * Find and read a plan file from .spavn/plans/.
 *
 * If a specific filename is given, reads that file.
 * Otherwise, finds the most recent plan matching the branch type prefix.
 */
export function findPlanContent(
  worktree: string,
  planFilename?: string,
  branchName?: string,
): { content: string; filename: string } | null {
  const plansDir = path.join(worktree, SPAVN_DIR, PLANS_DIR);

  if (!fs.existsSync(plansDir)) return null;

  if (planFilename) {
    // Prevent path traversal — resolve and verify the path is strictly inside plansDir
    const filepath = path.resolve(plansDir, planFilename);
    const resolvedPlansDir = path.resolve(plansDir);
    if (!filepath.startsWith(resolvedPlansDir + path.sep)) {
      return null; // Reject traversal attempts and directory-level references (".", "")
    }
    if (fs.existsSync(filepath)) {
      return { content: fs.readFileSync(filepath, "utf-8"), filename: planFilename };
    }
    return null;
  }

  // Try to find a matching plan by branch type
  // e.g., branch "feature/auth" → look for plans with "feature" type
  const planFiles = fs
    .readdirSync(plansDir)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
    .sort()
    .reverse(); // Most recent first

  if (planFiles.length === 0) return null;

  // If branch name provided, try to match by type
  if (branchName) {
    const branchType = branchName.split("/")[0]; // "feature", "bugfix", etc.
    const matched = planFiles.find((f) => f.includes(branchType));
    if (matched) {
      const filepath = path.join(plansDir, matched);
      return { content: fs.readFileSync(filepath, "utf-8"), filename: matched };
    }
  }

  // Fall back to most recent plan
  const mostRecent = planFiles[0];
  const filepath = path.join(plansDir, mostRecent);
  return { content: fs.readFileSync(filepath, "utf-8"), filename: mostRecent };
}
