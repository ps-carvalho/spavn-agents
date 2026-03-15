import { describe, it, expect } from "vitest";
import { exec, which, git } from "../shell.js";

describe("exec", () => {
  it("runs a simple command and returns stdout", async () => {
    const result = await exec("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("rejects on non-zero exitCode by default", async () => {
    await expect(exec("false", [])).rejects.toThrow();
  });

  it("resolves with nothrow on non-zero exitCode", async () => {
    const result = await exec("false", [], { nothrow: true });
    expect(result.exitCode).not.toBe(0);
  });

  it("rejects when command is not found", async () => {
    await expect(exec("nonexistent_cmd_12345", [])).rejects.toThrow("Command not found");
  });
});

describe("which", () => {
  it("finds a common binary", async () => {
    const result = await which("git");
    expect(result).toBeTruthy();
    expect(result).toContain("git");
  });

  it("returns null for non-existent binary", async () => {
    const result = await which("nonexistent_binary_xyz_12345");
    expect(result).toBeNull();
  });
});

describe("git", () => {
  it("runs git version", async () => {
    // git -C <cwd> version doesn't need a repo
    const result = await git(".", "version");
    expect(result.stdout).toContain("git version");
    expect(result.exitCode).toBe(0);
  });
});
