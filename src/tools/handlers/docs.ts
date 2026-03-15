import * as fs from "fs";
import * as path from "path";
import { DOCS_DIR } from "../../utils/constants.js";
import { slugify, getDatePrefix } from "../../utils/strings.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Initialize docs directory with decision/feature/flow subdirectories.
 */
export function executeInit(worktree: string): HandlerResult {
  const docsPath = path.join(worktree, DOCS_DIR);
  try {
    fs.mkdirSync(path.join(docsPath, "decisions"), { recursive: true });
    fs.mkdirSync(path.join(docsPath, "features"), { recursive: true });
    fs.mkdirSync(path.join(docsPath, "flows"), { recursive: true });
    return success(`✓ Initialized docs directory at ${docsPath}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * Save a documentation file with mermaid diagrams to docs/.
 * Auto-rebuilds the index.
 */
export function executeSave(
  worktree: string,
  args: { title: string; type: string; content: string; tags?: string[]; relatedFiles?: string[] },
): HandlerResult {
  const typeToFolder: Record<string, string> = { decision: "decisions", feature: "features", flow: "flows" };
  const folder = typeToFolder[args.type] || args.type;
  const folderPath = path.join(worktree, DOCS_DIR, folder);

  try {
    fs.mkdirSync(folderPath, { recursive: true });

    const date = getDatePrefix();
    const slug = slugify(args.title, 60);
    const filename = `${date}-${slug}.md`;
    const filepath = path.join(folderPath, filename);

    const tagsStr = args.tags && args.tags.length > 0 ? `\ntags: [${args.tags.map((t) => `"${t}"`).join(", ")}]` : "";
    const filesStr = args.relatedFiles && args.relatedFiles.length > 0 ? `\nrelated_files: [${args.relatedFiles.map((f) => `"${f}"`).join(", ")}]` : "";

    const frontmatter = `---\ntitle: "${args.title}"\ntype: ${args.type}\ndate: ${new Date().toISOString()}${tagsStr}${filesStr}\n---\n\n`;
    fs.writeFileSync(filepath, frontmatter + args.content);

    return success(`✓ Documentation saved: ${folder}/${filename}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * List all documentation files organized by type.
 */
export function executeList(worktree: string): HandlerResult {
  const docsPath = path.join(worktree, DOCS_DIR);
  if (!fs.existsSync(docsPath)) {
    return success(`No docs found. Run docs_init to initialize.`);
  }

  const types = ["decisions", "features", "flows"];
  let output = `✓ Documentation:\n\n`;
  for (const type of types) {
    const typePath = path.join(docsPath, type);
    if (fs.existsSync(typePath)) {
      const files = fs.readdirSync(typePath).filter((f) => f.endsWith(".md"));
      output += `**${type}:** ${files.length} files\n`;
    }
  }
  return success(output);
}

/**
 * Rebuild docs/INDEX.md with links to all documentation files.
 */
export function executeIndex(worktree: string): HandlerResult {
  const docsPath = path.join(worktree, DOCS_DIR);
  if (!fs.existsSync(docsPath)) {
    return success(`No docs/ directory found. Run docs_init first.`);
  }

  const types = ["decisions", "features", "flows"];
  let totalDocs = 0;
  const now = getDatePrefix();
  let index = `# Project Documentation\n\n> Auto-generated. Last updated: ${now}\n`;

  for (const type of types) {
    const typePath = path.join(docsPath, type);
    if (!fs.existsSync(typePath)) continue;
    const files = fs.readdirSync(typePath).filter((f) => f.endsWith(".md") && f !== ".gitkeep").sort().reverse();
    totalDocs += files.length;
    index += `\n## ${type.charAt(0).toUpperCase() + type.slice(1)} (${files.length})\n\n`;
    for (const file of files) {
      index += `- [${file}](${type}/${file})\n`;
    }
  }

  fs.writeFileSync(path.join(docsPath, "INDEX.md"), index);
  return success(`✓ Index rebuilt: ${totalDocs} documents indexed`);
}
