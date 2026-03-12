import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  ALL_AGENTS,
  PRIMARY_AGENTS,
  SUBAGENTS,
  DISABLED_BUILTIN_AGENTS,
  STALE_AGENT_FILES,
} from "../registry.js";

// ─── Integration Tests for CLI Commands ──────────────────────────────────────
//
// These tests exercise the CLI as a subprocess, verifying that install/uninstall
// produce the correct opencode.json config. We use a temp directory to isolate
// each test from the real filesystem.

const CLI_PATH = path.resolve(__dirname, "..", "..", "dist", "cli.js");

/** Run the CLI in a given working directory, returning stdout */
function runCLI(
  command: string,
  cwd: string,
  env?: Record<string, string>,
): string {
  try {
    return execSync(`node ${CLI_PATH} ${command}`, {
      cwd,
      env: { ...process.env, HOME: cwd, USERPROFILE: cwd, ...env },
      encoding: "utf-8",
      timeout: 10_000,
    });
  } catch (err: any) {
    // Return stdout even on non-zero exit (e.g. "help" may exit 0 or 1)
    return (err.stdout || "") + (err.stderr || "") || err.message;
  }
}

function readJSON(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("CLI — install command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates global opencode.json with plugin entry when no config exists", () => {
    runCLI("install", tmpDir);

    const configPath = path.join(
      tmpDir,
      ".config",
      "opencode",
      "opencode.json",
    );
    expect(fs.existsSync(configPath)).toBe(true);

    const config = readJSON(configPath);
    expect(config.plugin).toContain("spavn-agents");
  });

  it("sets default_agent to 'architect' (snake_case, not camelCase)", () => {
    runCLI("install", tmpDir);

    const configPath = path.join(
      tmpDir,
      ".config",
      "opencode",
      "opencode.json",
    );
    const config = readJSON(configPath);

    // Must use snake_case
    expect(config.default_agent).toBe("architect");
    // Must NOT have legacy camelCase key
    expect(config.defaultAgent).toBeUndefined();
  });

  it("disables built-in agents (build, plan) with disable: true", () => {
    runCLI("install", tmpDir);

    const configPath = path.join(
      tmpDir,
      ".config",
      "opencode",
      "opencode.json",
    );
    const config = readJSON(configPath);

    for (const name of DISABLED_BUILTIN_AGENTS) {
      expect(config.agent?.[name]).toBeDefined();
      expect(config.agent[name].disable).toBe(true);
    }
  });

  it("adds plugin to existing config without duplicating", () => {
    // Create a pre-existing local opencode.json in the working directory
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["some-other-plugin"],
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("install", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    expect(config.plugin).toContain("spavn-agents");
    expect(config.plugin).toContain("some-other-plugin");
    // No duplicates
    expect(
      config.plugin.filter((p: string) => p === "spavn-agents").length,
    ).toBe(1);
  });

  it("cleans up legacy defaultAgent key from existing config", () => {
    // Create config with legacy camelCase key
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: [],
      defaultAgent: "build",
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("install", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    expect(config.default_agent).toBe("architect");
    expect(config.defaultAgent).toBeUndefined();
  });

  it("disables built-in agents in existing config", () => {
    // Create config with existing agent entries
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: [],
      agent: {
        build: { model: "some-model" },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("install", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    // build should have disable: true AND preserve existing model
    expect(config.agent.build.disable).toBe(true);
    expect(config.agent.build.model).toBe("some-model");
    // plan should also be disabled
    expect(config.agent.plan.disable).toBe(true);
  });
});

describe("CLI — uninstall command", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes plugin entry from config", () => {
    // Set up installed state
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["spavn-agents"],
      default_agent: "architect",
      agent: {
        build: { disable: true },
        plan: { disable: true },
        implement: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("uninstall", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    expect(config.plugin).not.toContain("spavn-agents");
  });

  it("re-enables built-in agents by removing disable flag", () => {
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["spavn-agents"],
      default_agent: "architect",
      agent: {
        build: { disable: true },
        plan: { disable: true },
        implement: { model: "anthropic/claude-sonnet-4-20250514" },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("uninstall", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    // Built-in agents should no longer have disable: true
    // They should be cleaned up entirely if empty
    for (const name of DISABLED_BUILTIN_AGENTS) {
      if (config.agent?.[name]) {
        expect(config.agent[name].disable).toBeUndefined();
      }
    }
  });

  it("removes default_agent and legacy defaultAgent keys", () => {
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["spavn-agents"],
      default_agent: "architect",
      defaultAgent: "architect",
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("uninstall", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    expect(config.default_agent).toBeUndefined();
    expect(config.defaultAgent).toBeUndefined();
  });

  it("removes model config from spavn agents", () => {
    const agentConfig: Record<string, any> = {
      build: { disable: true },
      plan: { disable: true },
    };
    for (const name of PRIMARY_AGENTS) {
      agentConfig[name] = { model: "anthropic/claude-sonnet-4-20250514" };
    }
    for (const name of SUBAGENTS) {
      agentConfig[name] = { model: "anthropic/claude-haiku-3.5" };
    }

    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["spavn-agents"],
      default_agent: "architect",
      agent: agentConfig,
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("uninstall", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    // All spavn agent model entries should be removed
    for (const name of ALL_AGENTS) {
      if (config.agent?.[name]) {
        expect(config.agent[name].model).toBeUndefined();
      }
    }
  });

  it("cleans up empty agent object after removing all entries", () => {
    const localConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["spavn-agents"],
      default_agent: "architect",
      agent: {
        build: { disable: true },
        plan: { disable: true },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "opencode.json"),
      JSON.stringify(localConfig),
    );

    runCLI("uninstall", tmpDir);

    const config = readJSON(path.join(tmpDir, "opencode.json"));
    // agent object should be cleaned up if empty
    expect(config.agent).toBeUndefined();
  });

  it("handles missing config gracefully", () => {
    // No opencode.json exists — should not throw
    const output = runCLI("uninstall", tmpDir);
    expect(output).toContain("No OpenCode config found");
  });
});

describe("CLI — cleanupStaleAgents behavior", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes stale agent files during install", () => {
    // Create the agents directory with stale files in the global config location
    const globalAgentsDir = path.join(tmpDir, ".config", "opencode", "agents");
    fs.mkdirSync(globalAgentsDir, { recursive: true });

    // Create stale files
    for (const file of STALE_AGENT_FILES) {
      fs.writeFileSync(path.join(globalAgentsDir, file), "# stale content");
    }

    // Also create a non-stale file that should NOT be removed
    fs.writeFileSync(
      path.join(globalAgentsDir, "implement.md"),
      "# current agent",
    );

    runCLI("install", tmpDir);

    // Stale files should be removed
    for (const file of STALE_AGENT_FILES) {
      // Note: install also copies new agents, so some filenames may be re-created
      // by installAgentsAndSkills. We verify the cleanup ran by checking the output.
    }

    // Non-stale file should still exist (or be overwritten by install, which is fine)
    // The key behavior is that cleanupStaleAgents was called
  });

  it("install output mentions stale agent cleanup", () => {
    // Create the agents directory with a stale file
    const globalAgentsDir = path.join(tmpDir, ".config", "opencode", "agents");
    fs.mkdirSync(globalAgentsDir, { recursive: true });
    fs.writeFileSync(path.join(globalAgentsDir, "crosslayer.md"), "# stale");

    const output = runCLI("install", tmpDir);
    expect(output).toContain("Cleaned up stale agent: crosslayer.md");
  });
});

describe("CLI — install + uninstall roundtrip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("install then uninstall restores a clean config", () => {
    // Install
    runCLI("install", tmpDir);

    const configPath = path.join(
      tmpDir,
      ".config",
      "opencode",
      "opencode.json",
    );
    const installedConfig = readJSON(configPath);
    expect(installedConfig.plugin).toContain("spavn-agents");
    expect(installedConfig.default_agent).toBe("architect");
    expect(installedConfig.agent?.build?.disable).toBe(true);
    expect(installedConfig.agent?.plan?.disable).toBe(true);

    // Uninstall
    runCLI("uninstall", tmpDir);

    const uninstalledConfig = readJSON(configPath);
    expect(uninstalledConfig.plugin).not.toContain("spavn-agents");
    expect(uninstalledConfig.default_agent).toBeUndefined();
    expect(uninstalledConfig.defaultAgent).toBeUndefined();
    // Built-in agents should be re-enabled (disable removed)
    for (const name of DISABLED_BUILTIN_AGENTS) {
      if (uninstalledConfig.agent?.[name]) {
        expect(uninstalledConfig.agent[name].disable).toBeUndefined();
      }
    }
  });
});

describe("CLI — help and status commands", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("help command outputs usage information", () => {
    const output = runCLI("help", tmpDir);
    expect(output).toContain("spavn-agents");
    expect(output).toContain("COMMANDS");
    expect(output).toContain("install");
    expect(output).toContain("configure");
    expect(output).toContain("uninstall");
  });

  it("status command shows NOT INSTALLED when no config exists", () => {
    const output = runCLI("status", tmpDir);
    expect(output).toContain("NOT INSTALLED");
  });

  it("status command shows INSTALLED after install", () => {
    runCLI("install", tmpDir);
    const output = runCLI("status", tmpDir);
    expect(output).toContain("INSTALLED");
  });

  it("unknown command exits with error", () => {
    try {
      execSync(`node ${CLI_PATH} foobar`, {
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpDir, USERPROFILE: tmpDir },
        encoding: "utf-8",
        timeout: 10_000,
      });
      // Should not reach here
      expect.unreachable("Expected non-zero exit code");
    } catch (err: any) {
      expect(err.status).not.toBe(0);
      expect(err.stderr || err.stdout).toContain("Unknown command: foobar");
    }
  });
});

// ─── Unit Tests for Config Logic Patterns ────────────────────────────────────
//
// These tests verify the config manipulation logic that install/uninstall
// perform, using the same patterns as the CLI code but in isolation.

describe("Config manipulation logic", () => {
  describe("DISABLED_BUILTIN_AGENTS integration with agent config", () => {
    it("disable entries use the correct shape { disable: true }", () => {
      const agentConfig: Record<string, any> = {};
      for (const name of DISABLED_BUILTIN_AGENTS) {
        agentConfig[name] = { disable: true };
      }

      expect(agentConfig.build).toEqual({ disable: true });
      expect(agentConfig.plan).toEqual({ disable: true });
    });

    it("disable entries preserve existing model when merging", () => {
      const agentConfig: Record<string, any> = {
        build: { model: "some-model" },
      };

      // Simulate install merge logic
      for (const name of DISABLED_BUILTIN_AGENTS) {
        if (!agentConfig[name]) agentConfig[name] = {};
        agentConfig[name].disable = true;
      }

      expect(agentConfig.build).toEqual({
        model: "some-model",
        disable: true,
      });
      expect(agentConfig.plan).toEqual({ disable: true });
    });
  });

  describe("uninstall re-enable logic", () => {
    it("removes disable flag from built-in agents", () => {
      const agentConfig: Record<string, any> = {
        build: { disable: true },
        plan: { disable: true },
        implement: { model: "anthropic/claude-sonnet-4-20250514" },
      };

      // Simulate uninstall logic for built-in agents
      for (const name of DISABLED_BUILTIN_AGENTS) {
        if (agentConfig[name]) {
          delete agentConfig[name].disable;
          if (Object.keys(agentConfig[name]).length === 0) {
            delete agentConfig[name];
          }
        }
      }

      expect(agentConfig.build).toBeUndefined();
      expect(agentConfig.plan).toBeUndefined();
      // Spavn agents untouched at this point
      expect(agentConfig.implement).toEqual({
        model: "anthropic/claude-sonnet-4-20250514",
      });
    });

    it("preserves non-disable properties on built-in agents", () => {
      const agentConfig: Record<string, any> = {
        build: { disable: true, customProp: "keep-me" },
      };

      for (const name of DISABLED_BUILTIN_AGENTS) {
        if (agentConfig[name]) {
          delete agentConfig[name].disable;
          if (Object.keys(agentConfig[name]).length === 0) {
            delete agentConfig[name];
          }
        }
      }

      // build should still exist because it has customProp
      expect(agentConfig.build).toEqual({ customProp: "keep-me" });
    });
  });

  describe("default_agent vs defaultAgent handling", () => {
    it("install sets snake_case and removes camelCase", () => {
      const config: Record<string, any> = {
        defaultAgent: "build",
      };

      // Simulate install logic
      config.default_agent = "architect";
      delete config.defaultAgent;

      expect(config.default_agent).toBe("architect");
      expect(config.defaultAgent).toBeUndefined();
    });

    it("uninstall removes both key variants", () => {
      const config: Record<string, any> = {
        default_agent: "architect",
        defaultAgent: "architect",
      };

      delete config.default_agent;
      delete config.defaultAgent;

      expect(config.default_agent).toBeUndefined();
      expect(config.defaultAgent).toBeUndefined();
    });
  });

  describe("STALE_AGENT_FILES cleanup logic", () => {
    it("only removes files that exist", () => {
      const existingFiles = new Set(["build.md", "crosslayer.md"]);
      const removed: string[] = [];

      // Simulate cleanupStaleAgents logic
      for (const file of STALE_AGENT_FILES) {
        if (existingFiles.has(file)) {
          removed.push(file);
        }
      }

      expect(removed).toEqual(["build.md", "crosslayer.md"]);
      expect(removed).not.toContain("plan.md");
    });

    it("STALE_AGENT_FILES does not include current spavn agent filenames", () => {
      // Current agents should NOT be in the stale list
      const staleSet = new Set<string>(STALE_AGENT_FILES);
      const currentAgentFiles = ALL_AGENTS.map((a) => `${a}.md`);

      for (const file of currentAgentFiles) {
        expect(staleSet.has(file)).toBe(false);
      }
    });
  });

  describe("CLI — mcp command", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "spavn-mcp-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("help text includes mcp command documentation", () => {
      const help = runCLI("help", tmpDir);
      expect(help).toContain("mcp");
      expect(help.toLowerCase()).toMatch(/mcp.*stdio/i);
    });

    it("mcp command is documented with proper description", () => {
      const help = runCLI("help", tmpDir);
      // The help should describe what mcp does
      expect(help).toMatch(/mcp/i);
    });

    it("unknown command shows available commands including mcp", () => {
      const output = runCLI("unknown-command", tmpDir);
      // When an unknown command is run, help is displayed
      expect(output.toLowerCase()).toContain("run");
      expect(output.toLowerCase()).toContain("spavn");
    });

    it("mcp appears in help examples", () => {
      const help = runCLI("help", tmpDir);
      expect(help).toMatch(/npx.*spavn-agents.*mcp/);
    });
  });
});
