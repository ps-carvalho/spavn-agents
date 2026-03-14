import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  PRIMARY_AGENTS,
  SUBAGENTS,
  ENHANCED_SKILLS,
  ALL_AGENTS,
  DISABLED_BUILTIN_AGENTS,
  STALE_AGENT_FILES,
  getPrimaryChoices,
  getSubagentChoices,
} from "../registry.js";

describe("Agent Constants", () => {
  describe("PRIMARY_AGENTS", () => {
    it("contains the correct primary agent names", () => {
      expect(PRIMARY_AGENTS).toEqual(["architect", "implement", "fix"]);
    });

    it("has 3 primary agents", () => {
      expect(PRIMARY_AGENTS).toHaveLength(3);
    });

    it("is a readonly tuple", () => {
      // TypeScript enforces readonly, runtime check for structure
      expect(Array.isArray(PRIMARY_AGENTS)).toBe(true);
    });
  });

  describe("SUBAGENTS", () => {
    it("contains only the generic worker", () => {
      expect(SUBAGENTS).toEqual(["worker"]);
    });

    it("has 1 subagent (worker)", () => {
      expect(SUBAGENTS).toHaveLength(1);
    });

    it("is a readonly tuple", () => {
      expect(Array.isArray(SUBAGENTS)).toBe(true);
    });
  });

  describe("ENHANCED_SKILLS", () => {
    it("contains the 9 former subagent names as enhanced skills", () => {
      expect(ENHANCED_SKILLS).toEqual([
        "audit", "coder", "debug", "devops", "docs-writer",
        "perf", "refactor", "security", "testing",
      ]);
    });

    it("has 9 enhanced skills", () => {
      expect(ENHANCED_SKILLS).toHaveLength(9);
    });
  });

  describe("ALL_AGENTS", () => {
    it("contains all primary agents and worker", () => {
      expect(ALL_AGENTS).toEqual([
        "architect",
        "implement",
        "fix",
        "worker",
      ]);
    });

    it("has 4 total agents", () => {
      expect(ALL_AGENTS).toHaveLength(4);
    });

    it("includes all primary agents", () => {
      for (const agent of PRIMARY_AGENTS) {
        expect(ALL_AGENTS).toContain(agent);
      }
    });

    it("includes all subagents", () => {
      for (const agent of SUBAGENTS) {
        expect(ALL_AGENTS).toContain(agent);
      }
    });

    it("has no duplicates", () => {
      const unique = new Set(ALL_AGENTS);
      expect(unique.size).toBe(ALL_AGENTS.length);
    });
  });

  describe("PRIMARY_AGENTS and SUBAGENTS are disjoint", () => {
    it("has no overlap between primary and subagent lists", () => {
      const primarySet = new Set<string>(PRIMARY_AGENTS);
      const subagentSet = new Set<string>(SUBAGENTS);
      
      for (const agent of primarySet) {
        expect(subagentSet.has(agent)).toBe(false);
      }
      
      for (const agent of subagentSet) {
        expect(primarySet.has(agent)).toBe(false);
      }
    });
  });
});

describe("MODEL_REGISTRY", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(MODEL_REGISTRY)).toBe(true);
    expect(MODEL_REGISTRY.length).toBeGreaterThan(0);
  });

  it("contains valid model entries", () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.id).toMatch(/^.+\/.+$/); // provider/model format
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(["premium", "standard", "fast"]).toContain(model.tier);
      expect(model.description).toBeTruthy();
    }
  });

  it("has at least one model in each tier", () => {
    const tiers = new Set(MODEL_REGISTRY.map((m) => m.tier));
    expect(tiers.has("premium")).toBe(true);
    expect(tiers.has("standard")).toBe(true);
    expect(tiers.has("fast")).toBe(true);
  });

  it("has unique model IDs", () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("DISABLED_BUILTIN_AGENTS", () => {
  it("contains the correct built-in agent names to disable", () => {
    expect(DISABLED_BUILTIN_AGENTS).toEqual(["build", "plan"]);
  });

  it("has 2 disabled agents", () => {
    expect(DISABLED_BUILTIN_AGENTS).toHaveLength(2);
  });

  it("has no overlap with spavn agent names", () => {
    const disabledSet = new Set<string>(DISABLED_BUILTIN_AGENTS);
    for (const agent of ALL_AGENTS) {
      expect(disabledSet.has(agent)).toBe(false);
    }
  });

  it("is a readonly tuple", () => {
    expect(Array.isArray(DISABLED_BUILTIN_AGENTS)).toBe(true);
  });
});

describe("STALE_AGENT_FILES", () => {
  it("contains old agent filenames for cleanup", () => {
    expect(STALE_AGENT_FILES).toContain("build.md");
    expect(STALE_AGENT_FILES).toContain("plan.md");
    expect(STALE_AGENT_FILES).toContain("review.md");
    expect(STALE_AGENT_FILES).toContain("crosslayer.md");
    expect(STALE_AGENT_FILES).toContain("qa.md");
    expect(STALE_AGENT_FILES).toContain("guard.md");
    expect(STALE_AGENT_FILES).toContain("ship.md");
  });

  it("has correct number of stale files", () => {
    expect(STALE_AGENT_FILES).toHaveLength(17);
  });

  it("includes former subagent files for cleanup", () => {
    expect(STALE_AGENT_FILES).toContain("audit.md");
    expect(STALE_AGENT_FILES).toContain("coder.md");
    expect(STALE_AGENT_FILES).toContain("debug.md");
    expect(STALE_AGENT_FILES).toContain("devops.md");
    expect(STALE_AGENT_FILES).toContain("docs-writer.md");
    expect(STALE_AGENT_FILES).toContain("perf.md");
    expect(STALE_AGENT_FILES).toContain("refactor.md");
    expect(STALE_AGENT_FILES).toContain("security.md");
    expect(STALE_AGENT_FILES).toContain("testing.md");
  });

  it("all entries have .md extension", () => {
    for (const file of STALE_AGENT_FILES) {
      expect(file).toMatch(/\.md$/);
    }
  });

  it("is a readonly tuple", () => {
    expect(Array.isArray(STALE_AGENT_FILES)).toBe(true);
  });
});

describe("getPrimaryChoices", () => {
  it("returns an array of choices", () => {
    const choices = getPrimaryChoices();
    expect(Array.isArray(choices)).toBe(true);
    expect(choices.length).toBeGreaterThan(0);
  });

  it("excludes fast tier models", () => {
    const choices = getPrimaryChoices();
    const fastModels = MODEL_REGISTRY.filter((m) => m.tier === "fast");
    
    for (const fast of fastModels) {
      const found = choices.find((c) => c.value === fast.id);
      expect(found).toBeUndefined();
    }
  });

  it("includes premium and standard tier models", () => {
    const choices = getPrimaryChoices();
    const goodModels = MODEL_REGISTRY.filter(
      (m) => m.tier === "premium" || m.tier === "standard"
    );
    
    expect(choices.length).toBe(goodModels.length);
  });

  it("has required choice properties", () => {
    const choices = getPrimaryChoices();
    
    for (const choice of choices) {
      expect(choice.title).toBeTruthy();
      expect(choice.description).toBeTruthy();
      expect(choice.value).toBeTruthy();
    }
  });

  it("includes provider name in title (lowercase)", () => {
    const choices = getPrimaryChoices();
    
    for (const choice of choices) {
      // Title should contain provider name in parentheses
      expect(choice.title).toMatch(/\(.+\)/);
    }
  });
});

describe("getSubagentChoices", () => {
  const testPrimaryModel = "anthropic/claude-sonnet-4-20250514";

  it("returns an array of choices", () => {
    const choices = getSubagentChoices(testPrimaryModel);
    expect(Array.isArray(choices)).toBe(true);
    expect(choices.length).toBeGreaterThan(0);
  });

  it("includes only fast tier models plus 'Same as primary'", () => {
    const choices = getSubagentChoices(testPrimaryModel);
    const fastModels = MODEL_REGISTRY.filter((m) => m.tier === "fast");
    
    // Should have fast models + 1 for "Same as primary"
    expect(choices.length).toBe(fastModels.length + 1);
  });

  it("includes 'Same as primary' option as last choice", () => {
    const choices = getSubagentChoices(testPrimaryModel);
    const lastChoice = choices[choices.length - 1];
    
    expect(lastChoice.title).toBe("Same as primary");
    expect(lastChoice.value).toBe("__same__");
    expect(lastChoice.description).toBe(testPrimaryModel);
  });

  it("has required choice properties", () => {
    const choices = getSubagentChoices(testPrimaryModel);
    
    for (const choice of choices) {
      expect(choice.title).toBeTruthy();
      expect(choice.description).toBeTruthy();
      expect(choice.value).toBeTruthy();
    }
  });

  it("uses different primary model correctly", () => {
    const customModel = "openai/o3";
    const choices = getSubagentChoices(customModel);
    const sameChoice = choices.find((c) => c.value === "__same__");
    
    expect(sameChoice?.description).toBe(customModel);
  });
});
