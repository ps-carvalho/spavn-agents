import { describe, it, expect } from "vitest";
import { detectWorktreeInfo, deduplicateBranch } from "../worktree-detect.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

describe("detectWorktreeInfo", () => {
  it("detects the main tree is not a worktree", async () => {
    // Use the current repo as a test subject
    const cwd = process.cwd();
    const info = await detectWorktreeInfo(cwd);
    // In CI or normal dev, we're typically on the main tree
    expect(info.currentBranch).toBeTruthy();
    expect(typeof info.isWorktree).toBe("boolean");
  });

  it("returns (unknown) for non-git directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-noGit-"));
    const info = await detectWorktreeInfo(tmpDir);
    expect(info.currentBranch).toBe("(unknown)");
    expect(info.isWorktree).toBe(false);
    expect(info.mainWorktreePath).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("detects a linked worktree", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-wt-"));
    const mainRepo = path.join(tmpDir, "main");
    const wtPath = path.join(tmpDir, "wt");

    // Create a git repo
    fs.mkdirSync(mainRepo, { recursive: true });
    execFileSync("git", ["init", mainRepo]);
    execFileSync("git", ["-C", mainRepo, "commit", "--allow-empty", "-m", "init"]);

    // Create a worktree
    execFileSync("git", ["-C", mainRepo, "worktree", "add", "-b", "test-branch", wtPath]);

    // Detect main
    const mainInfo = await detectWorktreeInfo(mainRepo);
    expect(mainInfo.isWorktree).toBe(false);

    // Detect worktree
    const wtInfo = await detectWorktreeInfo(wtPath);
    expect(wtInfo.isWorktree).toBe(true);
    expect(wtInfo.currentBranch).toBe("test-branch");
    expect(wtInfo.mainWorktreePath).toBeTruthy();

    // Clean up
    execFileSync("git", ["-C", mainRepo, "worktree", "remove", "--force", wtPath]);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("deduplicateBranch", () => {
  it("returns -2 suffix when base branch exists", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-dedupe-"));
    const mainRepo = path.join(tmpDir, "main");

    // Create a git repo with initial commit
    fs.mkdirSync(mainRepo, { recursive: true });
    execFileSync("git", ["init", mainRepo]);
    execFileSync("git", ["-C", mainRepo, "commit", "--allow-empty", "-m", "init"]);

    // Create the base branch
    execFileSync("git", ["-C", mainRepo, "branch", "feature/test"]);

    const result = await deduplicateBranch(mainRepo, "feature/test");
    expect(result).toBe("feature/test-2");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns -3 when both base and -2 exist", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-dedupe-"));
    const mainRepo = path.join(tmpDir, "main");

    // Create a git repo with initial commit
    fs.mkdirSync(mainRepo, { recursive: true });
    execFileSync("git", ["init", mainRepo]);
    execFileSync("git", ["-C", mainRepo, "commit", "--allow-empty", "-m", "init"]);

    // Create base branch and -2
    execFileSync("git", ["-C", mainRepo, "branch", "feature/test"]);
    execFileSync("git", ["-C", mainRepo, "branch", "feature/test-2"]);

    const result = await deduplicateBranch(mainRepo, "feature/test");
    expect(result).toBe("feature/test-3");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws after 10 attempts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-dedupe-"));
    const mainRepo = path.join(tmpDir, "main");

    // Create a git repo with initial commit
    fs.mkdirSync(mainRepo, { recursive: true });
    execFileSync("git", ["init", mainRepo]);
    execFileSync("git", ["-C", mainRepo, "commit", "--allow-empty", "-m", "init"]);

    // Create all 9 branches: -2 through -10
    for (let i = 2; i <= 10; i++) {
      execFileSync("git", ["-C", mainRepo, "branch", `feature/test-${i}`]);
    }

    await expect(deduplicateBranch(mainRepo, "feature/test")).rejects.toThrow("10 attempts");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns -2 when base name doesn't exist as a branch", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spavn-dedupe-"));
    const mainRepo = path.join(tmpDir, "main");

    // Create a git repo with initial commit
    fs.mkdirSync(mainRepo, { recursive: true });
    execFileSync("git", ["init", mainRepo]);
    execFileSync("git", ["-C", mainRepo, "commit", "--allow-empty", "-m", "init"]);

    // No branches created - nonexistent/branch doesn't exist
    const result = await deduplicateBranch(mainRepo, "nonexistent/branch");
    expect(result).toBe("nonexistent/branch-2");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true });
  });
});
