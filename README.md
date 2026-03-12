<p align="center">
  <img src="https://img.shields.io/badge/spavn-agents-111?style=for-the-badge&labelColor=111&color=4d96ff" alt="spavn-agents" height="40">
</p>

<h3 align="center">Structured AI development workflows for <a href="https://opencode.ai">OpenCode</a>, <a href="https://claude.ai">Claude Code</a>, <a href="https://github.com/openai/codex">Codex CLI</a>, and <a href="https://github.com/google-gemini/gemini-cli">Gemini CLI</a>.<br>Plan. Build. Ship. With discipline.</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/spavn-agents"><img src="https://img.shields.io/npm/v/spavn-agents.svg?style=flat-square&color=4d96ff" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/spavn-agents"><img src="https://img.shields.io/npm/dm/spavn-agents.svg?style=flat-square&color=6bcb77" alt="npm downloads"></a>
  <a href="https://github.com/ps-carvalho/spavn-agents/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/spavn-agents.svg?style=flat-square&color=ffd93d" alt="license"></a>
  <a href="https://opencode.ai"><img src="https://img.shields.io/badge/OpenCode-Plugin-4d96ff?style=flat-square" alt="OpenCode Plugin"></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#-architecture">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#-agents">Agents</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#-tools">Tools</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#-skills">Skills</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#-contributing">Contributing</a>
</p>

---

## Why Spavn Agents?

AI coding assistants are powerful, but without structure they produce inconsistent results. **Spavn Agents** adds the missing layer: a complete development workflow that turns OpenCode into a disciplined engineering partner.

```
 Before                                    After
 ──────                                    ─────
 AI writes code wherever                   AI checks git status first
 No branching discipline                   Creates worktrees/branches automatically
 No documentation                          Generates docs with mermaid diagrams
 No quality checks                         Runs parallel quality gates (6 sub-agents)
 No plan, no traceability                  Plans with acceptance criteria, ships PRs
```

### Interview-First Planning

The **Architect agent** doesn't jump straight to solutions. Before creating any plan, it conducts a structured conversation:

1. **Acknowledge & Clarify** — Summarizes your request and asks 3-5 targeted questions about scope, constraints, and success criteria
2. **Deepen Understanding** — Follows up on unclear areas, identifies risks, presents trade-offs
3. **Readiness Check** — Presents problem statement + proposed approach + assumptions, asks for your approval
4. **Plan Review** — Only saves the plan after you explicitly approve it

This ensures you get plans that actually solve the right problem — not AI hallucinations.

---

## Quick Start

```bash
# OpenCode (default)
npx spavn-agents install              # Add plugin + agents + skills
npx spavn-agents configure            # Pick your models interactively

# Claude Code
npx spavn-agents install --target claude   # Render agents + CLAUDE.md
npx spavn-agents sync --target claude      # Re-sync after DB changes

# Codex CLI
npx spavn-agents install --target codex    # Render AGENTS.md instructions

# Gemini CLI
npx spavn-agents install --target gemini   # Render agents + GEMINI.md

# Multiple targets
npx spavn-agents install --target opencode
npx spavn-agents install --target claude
npx spavn-agents install --target codex
npx spavn-agents install --target gemini
```

Your sessions now have **12 specialized agents**, **35 tools**, and **17 domain skills**.

> **Built-in Agent Replacement** — Spavn automatically disables OpenCode's native `build` and `plan` agents (replaced by `implement` and `architect`). The `architect` agent becomes the default, promoting a planning-first workflow. Native agents are fully restored on `uninstall`.

---

## Architecture

### Agent Hierarchy

```
User Request
    |
    v
 Architect (read-only planning)
    |
     |-- read-only analysis -----> @security  @explore  @perf
    |
    v
 Implement / Fix (execution)
    |
    |-- REPL Loop (task-by-task) --> build + test per task
    |
    v
 Quality Gate (two-phase)
    |
    |-- Phase 1 (parallel, scope-based):
    |     @testing  @security  @audit  @docs-writer  @devops  @perf
    |
    |-- Phase 2 (cross-agent):
    |     @testing reacts to @security findings
    |
    v
 quality_gate_summary --> GO / NO-GO / GO-WITH-WARNINGS
    |
    v
 Fix blockers --> task_finalize --> PR
```

### The Workflow

```
You: "Add user authentication"

Architect Agent                         reads codebase, creates plan with mermaid diagrams
   saves to .spavn/plans/             commits plan on current branch
   "Plan committed. Proceed?"          offers worktree, branch, or stay

Implement Agent                         loads plan, checks git status
   repl_init → parses tasks + ACs      iterates task-by-task with build+test
   Quality Gate → 6 agents in parallel  testing + security + audit + docs + devops + perf
   quality_gate_summary → GO            aggregates findings, recommends go/no-go
   task_finalize                        stages, commits, pushes, opens PR
```

### Scope-Based Quality Gate

Not every change needs a full audit. The quality gate scales with risk:

| Scope | Criteria | Sub-Agents Launched |
|-------|----------|-------------------|
| **Trivial** | Docs, comments, formatting | `@docs-writer` only (or skip) |
| **Low** | Tests, config files | `@testing` |
| **Standard** | Normal code changes | `@testing` + `@security` + `@audit` + `@docs-writer` |
| **High** | Auth, payments, crypto, infra, DB migrations | All 6: `@testing` + `@security` + `@audit` + `@docs-writer` + `@devops` + `@perf` |

---

## Spavn Engine

Spavn Agents is backed by a **SQLite data model** at `~/.config/spavn-agents/spavn.db`. Agents, skills, and model configurations are stored in a single source of truth. Target-specific **renderers** transform DB records into each CLI's native format on `install` or `sync`.

```
┌──────────────────────────────────────────────────────────────┐
│                       SpavnEngine                           │
│          AgentStore │ SkillStore │ Models │ Targets           │
│                  SQLite (spavn.db)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │  Claude   │ │ OpenCode │ │  Codex   │ │   Gemini     │    │
│  │ Renderer  │ │ Renderer │ │ Renderer │ │  Renderer    │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

This means you can install once, then render to as many targets as you need. Four renderers ship out of the box:

| Target | Config Dir | Agent Format | Instructions File |
|--------|-----------|--------------|-------------------|
| **Claude Code** | `~/.claude` | Per-agent `.md` with Claude frontmatter | `CLAUDE.md` |
| **OpenCode** | `~/.config/opencode` | Per-agent `.md` with tools/permission YAML | — |
| **Codex CLI** | `~/.codex` | Single `agents/AGENTS.md` | `agents/AGENTS.md` |
| **Gemini CLI** | `~/.gemini` | Per-agent `.md` with Gemini frontmatter | `GEMINI.md` |

Changes to agents or skills in the DB are picked up by `sync` without re-downloading anything.

---

## Agents

### Primary Agents (3)

Handle complex, multi-step work. Use your best model.

| Agent | Role | Key Capabilities |
|-------|------|-----------------|
| **architect** | Read-only analysis & planning | Plans with mermaid diagrams, acceptance criteria, NFR analysis. Conducts mandatory requirements interview and plan review before saving. Commits plans and defers branch creation to handoff. Delegates read-only analysis to `@explore`, `@security`, `@perf` only. |
| **implement** | Full-access development | Skill-aware implementation, REPL loop with ACs, two-phase quality gate, parallel sub-agent orchestration, task finalizer. |
| **fix** | Quick turnaround bug fixes | Rapid diagnosis, scope-based quality gate, optional REPL loop. Delegates deep debugging to `@debug`. |

### Sub-Agents (9)

Focused specialists launched **automatically** by primary agents. Each auto-loads domain skills for deeper analysis. Use a fast/cheap model.

| Agent | Role | Auto-Loads Skill | Triggered By |
|-------|------|-----------------|-------------|
| **@testing** | Test writing, suite execution, coverage | `testing-strategies` | Implement (standard+high), Fix (low+standard+high) |
| **@security** | OWASP audit, secrets scan, threat modeling | `security-hardening` | Implement (standard+high), Fix (standard+high), Architect (read-only) |
| **@explore** | Read-only codebase exploration | — | Architect only (read-only analysis) |
| **@audit** | Code quality, tech debt, pattern review | `code-quality` | Implement (standard+high) |
| **@docs-writer** | Auto-documentation generation | — | Implement (standard+high) |
| **@perf** | Complexity analysis, N+1 detection, bundle impact | `performance-optimization` | Implement (high), Fix (high), Architect (read-only) |
| **@devops** | CI/CD validation, IaC review | `deployment-automation` | Implement (high, or infra files changed) |
| **@coder** | Cross-layer implementation, feasibility | Per-layer skills | Implement (3+ layers) |
| **@refactor** | Behavior-preserving restructuring | `design-patterns` + `code-quality` | Implement (refactor plans) |
| **@debug** | Root cause analysis, troubleshooting | `testing-strategies` | Fix (complex issues) |

Sub-agents return **structured reports** with severity levels (`BLOCKING`, `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) that the orchestrating agent uses to decide whether to proceed or fix issues first.

### Skill Routing

All agents detect the project's technology stack and **automatically load relevant skills** before working:

```
Implement Agent detects: package.json has React + Express + Prisma
  -> auto-loads: frontend-development, backend-development, database-design, api-design
  -> implements with deep framework-specific knowledge
```

### Design Spec Enforcement

All UI work is governed by a **mandatory design spec** (`.spavn/design-spec.md`). When any agent loads the `ui-design` skill:

1. **Check** — looks for `.spavn/design-spec.md`
2. **Create if missing** — analyzes the entire app (components, styles, Tailwind config, theme files, CSS variables) and synthesizes a spec covering brand identity, color palette, typography, spacing, component patterns, and look & feel
3. **Follow it** — every color, font, spacing value, and component pattern must align with the spec
4. **Extend it** — if a task needs something not in the spec, the spec is updated first

This ensures visual consistency across all agents and sessions — no more one-off colors, mismatched radii, or inconsistent button styles.

---

## Tools

35 tools bundled and auto-registered. No configuration needed.

<table>
<tr><td width="50%">

**Git Workflow**
- `branch_status` — Current branch + change detection
- `branch_create` — Convention-named branches (with toast)
- `branch_switch` — Safe branch switching
- `worktree_create` — Isolated worktree in `.worktrees/`
- `worktree_list` / `worktree_remove` / `worktree_open`

</td><td width="50%">

**Planning & Sessions**
- `plan_save` / `plan_load` / `plan_list` / `plan_delete`
- `plan_commit` — Commit plan artifacts on current branch (branch creation deferred to handoff)
- `session_save` / `session_list` / `session_load`
- `spavn_init` / `spavn_status` / `spavn_configure`

</td></tr>
<tr><td width="50%">

**Documentation**
- `docs_init` — Set up `docs/` structure
- `docs_save` — Save doc with mermaid diagrams
- `docs_list` — Browse all docs
- `docs_index` — Rebuild `docs/INDEX.md`

</td><td width="50%">

**Finalization**
- `task_finalize` — Stage, commit, push, create PR
  - Auto-detects worktree (targets main)
  - Auto-populates PR from `.spavn/plans/`
  - Auto-links issues via `Closes #N`
- `quality_gate_summary` — Aggregate sub-agent findings, GO/NO-GO recommendation

</td></tr>
<tr><td colspan="2">

**GitHub Integration**
- `github_status` — Check `gh` CLI availability, auth, and detect projects
- `github_issues` — List/filter repo issues by state, labels, milestone, assignee
- `github_projects` — List GitHub Project boards and their work items

The architect uses these to browse your backlog and seed plans from real issues. Issue numbers stored in plan frontmatter (`issues: [42, 51]`) are automatically appended as `Closes #N` to the PR body.

</td></tr>
<tr><td colspan="2">

**REPL Loop** — Iterative task-by-task implementation
- `repl_init` — Initialize loop from plan (parses tasks + ACs, auto-detects build/test)
- `repl_status` — Current progress, active task with ACs, retry counts
- `repl_report` — Report outcome (`pass`/`fail`/`skip`) with auto-retry and escalation
- `repl_resume` — Detect and resume interrupted loop from previous session
- `repl_summary` — Markdown results table with AC satisfaction for PR body

State persists to `.spavn/repl-state.json` — survives context compaction, session restarts, and agent switches.

</td></tr>
<tr><td colspan="2">

**Engine (NEW)**
- `spavn_get_skill` — Retrieve domain skill content from DB
- `spavn_list_agents` — List all registered agents with tools

</td></tr>
</table>

---

## Skills

17 domain-specific skill packs loaded on demand:

| Skill | Covers |
|-------|--------|
| `frontend-development` | React, Vue, Svelte, CSS architecture, accessibility |
| `ui-design` | Visual hierarchy, typography, color systems, spacing, motion, professional polish. **Enforces a mandatory design spec** (`.spavn/design-spec.md`) — auto-creates from codebase analysis if missing, ensuring brand consistency across all UI work. |
| `backend-development` | API design, middleware, auth, caching, queue systems |
| `mobile-development` | React Native, Flutter, native iOS/Android patterns |
| `desktop-development` | Electron, Tauri, native desktop application patterns |
| `database-design` | Schema design, migrations, indexing, query optimization |
| `api-design` | REST, GraphQL, gRPC, versioning, documentation |
| `testing-strategies` | Unit, integration, E2E, TDD, coverage strategies |
| `security-hardening` | OWASP, auth/authz, input validation, secure coding |
| `deployment-automation` | CI/CD, Docker, Kubernetes, cloud deployment |
| `architecture-patterns` | Microservices, monorepo, event-driven, CQRS |
| `design-patterns` | GoF patterns, SOLID principles, DDD |
| `performance-optimization` | Profiling, caching, lazy loading, bundle optimization |
| `code-quality` | Refactoring, linting, code review, maintainability |
| `git-workflow` | Branching strategies, worktrees, rebase vs merge |
| `monitoring-observability` | Structured logging, metrics, distributed tracing, health checks |
| `data-engineering` | ETL pipelines, data validation, streaming, message queues, partitioning |

---

## Model Configuration

Spavn agents are **model-agnostic**. Configure globally or per-project:

```bash
npx spavn-agents configure            # Global (all projects)
npx spavn-agents configure --project  # Per-project (saves to .opencode/models.json)
```

```
? Select model for PRIMARY agents (architect, implement, fix):
  Claude Sonnet 4    (anthropic)     Best balance of intelligence and speed
  Claude Opus 4      (anthropic)     Most capable, best for complex architecture
  GPT-4.1            (openai)        Fast multimodal model
  Gemini 2.5 Pro     (google)        Large context window, strong reasoning
  Kimi K2P5          (kimi)          Optimized for code generation
  Enter custom model ID

? Select model for SUBAGENTS (debug, coder, testing, security, devops, audit, ...):
  Claude 3.5 Haiku   (anthropic)     Fast and cost-effective
  o4 Mini            (openai)        Fast reasoning, cost-effective
  Gemini 2.5 Flash   (google)        Fast and efficient
  Same as primary
```

Agents can also configure models mid-session via `spavn_configure` — no need to leave OpenCode.

> Don't see your provider in the picker? Select **"Enter custom model ID"** and type any `provider/model` string.

---

## How It Works

### Implement Agent — Step by Step

```
Step 1   branch_status           Am I on a protected branch?
Step 2   spavn_status           Is .spavn initialized?
Step 3   plan_list / plan_load   Is there a plan for this work?
Step 4   Ask: strategy           Worktree (recommended) or branch?
Step 5   Execute                 Create worktree/branch
Step 6   REPL Loop               repl_init -> iterate tasks one-by-one
  6a     repl_init               Parse tasks + ACs, detect build/test commands
  6b     repl_status             Get current task with ACs, auto-advance
  6c     Implement task          Write code to satisfy acceptance criteria
  6d     Build + test            Run detected build/test commands
  6e     repl_report             Report pass/fail/skip -> auto-advance or retry
  6f     Loop                    Repeat 6b-6e until all tasks complete
Step 7   Quality Gate            Two-phase sub-agent review (scope-based)
  7a     repl_summary            Generate loop results
  7b     Assess scope            Classify changed files by risk tier
  7c     Phase 1                 Launch sub-agents in parallel
  7d     Phase 2                 Cross-agent reactions (@testing <- @security)
  7e     quality_gate_summary    Aggregate findings -> GO / NO-GO
Step 8   Documentation           Review @docs-writer output or prompt user
Step 9   session_save            Record what was done and why
Step 10  task_finalize           Commit, push, create PR (with quality gate in body)
Step 11  Cleanup                 Remove worktree if applicable
```

### REPL Loop Example

```
repl_init("my-plan.md")
  -> Parses tasks (- [ ] checkboxes) with ACs (- AC: lines)
  -> Auto-detects: npm run build, npx vitest run
  -> Creates .spavn/repl-state.json

Loop:
  repl_status              -> "Task #1: Implement user model"
                               AC: User model has name, email, password
                               AC: Email validation rejects malformed addresses
  [implement task]
  [run build + tests]
  repl_report(pass, "42 tests pass")
                           -> "Task #1 PASSED (1st attempt)"
                           -> "Next: Task #2"

  repl_status              -> "Task #2: Add API endpoints"
  [implement task]
  [run build + tests]
  repl_report(fail, "POST /users 500")
                           -> "Task #2 FAILED (attempt 1/3)"
                           -> "Fix and retry. 2 retries remaining."
  [fix issue, re-run tests]
  repl_report(pass, "All green")
                           -> "Task #2 PASSED (2nd attempt)"
  ...

repl_summary               -> Markdown table for PR body
```

### Quality Gate Example

```
quality_gate_summary receives reports from 6 agents:
  @testing:     PASS — 12 tests written, all passing
  @security:    PASS WITH WARNINGS — 1 medium finding (XSS in tooltip)
  @audit:       PASS — score A, no critical issues
  @docs-writer: 1 feature doc created
  @devops:      N/A
  @perf:        PASS — no regressions, all O(n) or better

  -> Recommendation: GO-WITH-WARNINGS
  -> Blocker: none
  -> PR body section auto-generated
```

---

## Project Structure

```
your-project/
  .spavn/                     Project context (auto-initialized)
     config.json              Configuration
     design-spec.md           UI design spec — branding, colors, typography, patterns
     plans/                   Implementation plans
     sessions/                Session summaries
     repl-state.json          REPL loop progress (auto-managed)
     quality-gate.json        Last quality gate results
  .opencode/
     models.json              Per-project model config (git tracked)
  .worktrees/                  Git worktrees
     feature-auth/            Isolated development copy
     bugfix-login/
  docs/                        Documentation (git tracked)
     INDEX.md                 Auto-generated index
     decisions/               Architecture Decision Records
     features/                Feature docs with diagrams
     flows/                   Process/data flow docs
```

---

## CLI Reference

```bash
npx spavn-agents install                              # Install plugin, agents, and skills (OpenCode default)
npx spavn-agents install --target claude|opencode|codex|gemini  # Install to specific CLI target
npx spavn-agents sync --target claude|opencode|codex|gemini     # Re-render from DB to target
npx spavn-agents configure                            # Global model selection
npx spavn-agents configure --project                  # Per-project model selection
npx spavn-agents configure --reset                    # Reset global models
npx spavn-agents configure --project --reset          # Reset per-project models
npx spavn-agents uninstall                            # Clean removal of everything
npx spavn-agents status                               # Show installation, model, and DB stats
```

---

## Requirements

- [OpenCode](https://opencode.ai) >= 1.0.0, [Claude Code](https://claude.ai), [Codex CLI](https://github.com/openai/codex), or [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- Node.js >= 18.0.0
- Git (for branch/worktree features)
- [GitHub CLI](https://cli.github.com/) (optional — for PR creation and issue integration)

---

## Contributing

We welcome contributions of all sizes. Whether it's a typo fix, a new skill pack, or a whole new agent — we appreciate it.

### Getting Started

```bash
git clone https://github.com/ps-carvalho/spavn-agents.git
cd spavn-agents
npm install
npm run build
npm test                    # All tests should pass
```

### Local Development

```bash
# Link for local testing with OpenCode
npm link
cd ~/.config/opencode && npm link spavn-agents

# Edit, rebuild, restart OpenCode to test
npm run build

# Unlink when done
cd ~/.config/opencode && npm unlink spavn-agents && npm install
```

### Project Layout

```
src/
  index.ts                   Plugin entry point, tool registration, event hooks
  registry.ts                Agent/model registry constants
  cli.ts                     CLI (install, configure, uninstall, status)
  engine/
    index.ts                 SpavnEngine facade
    db.ts                    SQLite connection factory
    schema.ts                DDL, migrations
    types.ts                 TypeScript interfaces
    agents.ts / skills.ts    Data stores
    models.ts / targets.ts
    seed.ts                  Import .opencode/ → DB
    renderers/
      index.ts               Renderer interface + registry
      claude.ts              Claude Code renderer
      opencode.ts            OpenCode renderer
      codex.ts               Codex CLI renderer
      gemini.ts              Gemini CLI renderer
  tools/
    engine.ts                Engine-backed MCP tools
    repl.ts                  REPL loop tools (init, status, report, resume, summary)
    quality-gate.ts          Quality gate aggregation tool
    spavn.ts                Project initialization tools
    worktree.ts              Git worktree tools
    branch.ts                Git branch tools
    plan.ts                  Plan persistence tools
    session.ts               Session summary tools
    docs.ts                  Documentation tools
    task.ts                  Task finalization tool
    github.ts                GitHub integration tools
  utils/
    repl.ts                  REPL state management, command detection, formatting
    change-scope.ts          Risk-based file classification
    plan-extract.ts          Plan parsing utilities
    shell.ts                 Shell command helpers
    github.ts                GitHub API helpers
    worktree-detect.ts       Worktree detection
  __tests__/                 Test files mirror src/ structure
.opencode/
  agents/                    12 agent definition files (.md frontmatter)
  skills/                    17 skill pack directories (SKILL.md each)
```

### What We're Looking For

| Type | Examples | Difficulty |
|------|----------|-----------|
| **New skills** | Rust, Go, AWS, Terraform, GraphQL | Easy — add a `SKILL.md` file |
| **New agents** | Reviewer, migration specialist, API designer | Medium — agent `.md` + registry update |
| **Tool improvements** | Better PR templates, test runners, linter integration | Medium — TypeScript + tests |
| **Quality gate enhancements** | New parsers for agent report formats, smarter severity mapping | Medium |
| **Bug fixes** | Anything that doesn't work as expected | Varies |
| **Documentation** | Guides, examples, tutorials | Easy |

### Adding a New Skill

1. Create `.opencode/skills/your-skill/SKILL.md` with frontmatter (`name`, `description`, `license`, `compatibility`)
2. Write the skill content — patterns, checklists, examples
3. Update the skill count in tests if applicable
4. Submit a PR

### Adding a New Agent

1. Create `.opencode/agents/your-agent.md` with frontmatter (`description`, `mode`, `temperature`, `tools`, `permission`)
2. Add the agent name to `SUBAGENTS` or `PRIMARY_AGENTS` in `src/registry.ts`
3. Add an agent description in `AGENT_DESCRIPTIONS` in `src/index.ts`
4. Update test expectations in `src/__tests__/registry.test.ts`
5. Submit a PR

### Submitting Changes

1. Fork the repository
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`) and the build is clean (`npm run build`)
5. Commit with conventional format (`feat:`, `fix:`, `docs:`, `chore:`)
6. Push and open a Pull Request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new capability
fix: correct a bug
docs: update documentation
chore: maintenance, dependencies
refactor: code restructuring without behavior change
test: add or update tests
```

---

## License

[Apache-2.0](LICENSE) — use it, modify it, ship it.

<p align="center">
  <br>
  <sub>Built for the <a href="https://opencode.ai">OpenCode</a>, <a href="https://claude.ai">Claude Code</a>, <a href="https://github.com/openai/codex">Codex CLI</a>, and <a href="https://github.com/google-gemini/gemini-cli">Gemini CLI</a> communities</sub>
</p>
