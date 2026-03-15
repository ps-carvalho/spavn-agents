import * as fs from "fs";
import * as path from "path";
import { getEngine } from "./engine-singleton.js";
import { success, failure, type HandlerResult } from "./types.js";

/**
 * Load a spavn skill by name.
 * Skills provide specialized domain knowledge or enhanced behavioral instructions.
 *
 * @param bundledDir - The directory containing bundled skills (typically __dirname resolved to the package root)
 */
export function executeLoad(
  worktree: string,
  args: { name: string; mode?: string },
  bundledDir: string,
): HandlerResult {
  const skillPaths = [
    path.resolve(bundledDir, ".opencode", "skills", args.name, "SKILL.md"),
    path.join(worktree, ".opencode", "skills", args.name, "SKILL.md"),
  ];

  for (const skillPath of skillPaths) {
    try {
      const content = fs.readFileSync(skillPath, "utf-8");

      let header = `✓ Skill loaded: ${args.name}`;
      if (args.mode) {
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          const kindMatch = fm.match(/^kind:\s*(.+)$/m);
          const accessMatch = fm.match(/^access_level:\s*(.+)$/m);
          if (kindMatch && kindMatch[1].trim() === "enhanced" && accessMatch) {
            const skillAccess = accessMatch[1].trim();
            const ceilings: Record<string, string> = { architect: "read-only", implement: "full", fix: "full" };
            const ceiling = ceilings[args.mode];
            const order: Record<string, number> = { "read-only": 0, write: 1, full: 2 };
            const effective = ceiling && order[skillAccess] !== undefined && order[ceiling] !== undefined
              ? (order[skillAccess] <= order[ceiling] ? skillAccess : ceiling)
              : skillAccess;
            header += ` (enhanced, effective_access: ${effective})`;
          }
        }
      }

      return success(`${header}\n\n${content}`);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        continue; // Try next path
      }
      const msg = e instanceof Error ? e.message : String(e);
      return failure(`Error: ${msg}`);
    }
  }

  const bundledSkillsDir = path.resolve(bundledDir, ".opencode", "skills");
  let available: string[] = [];
  if (fs.existsSync(bundledSkillsDir)) {
    available = fs.readdirSync(bundledSkillsDir).filter((d) =>
      fs.existsSync(path.join(bundledSkillsDir, d, "SKILL.md")),
    );
  }

  return success(`✗ Skill not found: ${args.name}\n\nAvailable skills: ${available.join(", ")}`);
}

/**
 * Retrieve the full content of a domain skill by ID from the engine database.
 */
export async function executeGet(args: { skillId: string }): Promise<HandlerResult> {
  try {
    const engine = await getEngine();
    const content = engine.getSkillContent(args.skillId);

    if (!content) {
      const skills = engine.listSkills();
      const available = skills.map((s) => s.id).join(", ");
      return success(`✗ Skill not found: ${args.skillId}\n\nAvailable skills: ${available}`);
    }

    return success(content);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}

/**
 * List all available skills with metadata.
 */
export async function executeSkillList(): Promise<HandlerResult> {
  try {
    const engine = await getEngine();
    const skills = engine.listSkills();

    if (skills.length === 0) {
      return success("✗ No skills found. Run 'npx spavn-agents install' first.");
    }

    const knowledge = skills.filter((s) => s.kind === "knowledge");
    const enhanced = skills.filter((s) => s.kind === "enhanced");

    let output = `✓ ${skills.length} skills available:\n\n`;

    if (knowledge.length > 0) {
      output += `**Knowledge (${knowledge.length}):**\n`;
      output += knowledge.map((s) => `  - ${s.id}`).join("\n");
      output += "\n\n";
    }

    if (enhanced.length > 0) {
      output += `**Enhanced (${enhanced.length}):**\n`;
      output += enhanced.map((s) => `  - ${s.id} (access: ${s.access_level})`).join("\n");
    }

    return success(output);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return failure(`Error: ${msg}`);
  }
}
