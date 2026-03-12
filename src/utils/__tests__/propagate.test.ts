import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { propagatePlan } from "../propagate.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("propagatePlan", () => {
  let tmpDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-prop-"));
    sourceDir = path.join(tmpDir, "source");
    targetDir = path.join(tmpDir, "target");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns empty result when source has no plans", () => {
    const result = propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
    });
    expect(result.copied).toEqual([]);
    expect(result.initialized).toBe(false);
  });

  it("copies all plans when no specific filename given", () => {
    const sourcePlans = path.join(sourceDir, ".spavn", "plans");
    fs.mkdirSync(sourcePlans, { recursive: true });
    fs.writeFileSync(path.join(sourcePlans, "plan-a.md"), "Plan A content");
    fs.writeFileSync(path.join(sourcePlans, "plan-b.md"), "Plan B content");

    const result = propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
    });

    expect(result.copied).toHaveLength(2);
    expect(result.copied).toContain("plan-a.md");
    expect(result.copied).toContain("plan-b.md");
    expect(result.initialized).toBe(true);

    // Verify files exist in target
    const targetPlans = path.join(targetDir, ".spavn", "plans");
    expect(fs.existsSync(path.join(targetPlans, "plan-a.md"))).toBe(true);
    expect(fs.readFileSync(path.join(targetPlans, "plan-a.md"), "utf-8")).toBe("Plan A content");
  });

  it("copies only specific plan when filename given", () => {
    const sourcePlans = path.join(sourceDir, ".spavn", "plans");
    fs.mkdirSync(sourcePlans, { recursive: true });
    fs.writeFileSync(path.join(sourcePlans, "plan-a.md"), "Plan A");
    fs.writeFileSync(path.join(sourcePlans, "plan-b.md"), "Plan B");

    const result = propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
      planFilename: "plan-a.md",
    });

    expect(result.copied).toEqual(["plan-a.md"]);
    const targetPlans = path.join(targetDir, ".spavn", "plans");
    expect(fs.existsSync(path.join(targetPlans, "plan-a.md"))).toBe(true);
    expect(fs.existsSync(path.join(targetPlans, "plan-b.md"))).toBe(false);
  });

  it("copies config.json if it exists", () => {
    const sourceSpavn = path.join(sourceDir, ".spavn");
    const sourcePlans = path.join(sourceSpavn, "plans");
    fs.mkdirSync(sourcePlans, { recursive: true });
    fs.writeFileSync(path.join(sourcePlans, "plan.md"), "Plan");
    fs.writeFileSync(path.join(sourceSpavn, "config.json"), '{"key": "value"}');

    propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
    });

    const targetConfig = path.join(targetDir, ".spavn", "config.json");
    expect(fs.existsSync(targetConfig)).toBe(true);
    expect(fs.readFileSync(targetConfig, "utf-8")).toBe('{"key": "value"}');
  });

  it("creates sessions dir in target", () => {
    const sourcePlans = path.join(sourceDir, ".spavn", "plans");
    fs.mkdirSync(sourcePlans, { recursive: true });
    fs.writeFileSync(path.join(sourcePlans, "plan.md"), "Plan");

    propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
    });

    const targetSessions = path.join(targetDir, ".spavn", "sessions");
    expect(fs.existsSync(targetSessions)).toBe(true);
  });

  it("skips .gitkeep files", () => {
    const sourcePlans = path.join(sourceDir, ".spavn", "plans");
    fs.mkdirSync(sourcePlans, { recursive: true });
    fs.writeFileSync(path.join(sourcePlans, ".gitkeep"), "");
    fs.writeFileSync(path.join(sourcePlans, "real-plan.md"), "Content");

    const result = propagatePlan({
      sourceWorktree: sourceDir,
      targetWorktree: targetDir,
    });

    expect(result.copied).toEqual(["real-plan.md"]);
  });
});
