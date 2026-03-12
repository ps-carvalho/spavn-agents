// ---------------------------------------------------------------------------
// Spavn Engine — Core type definitions
// Maps 1:1 to the SQLite schema with typed JSON fields and union literals.
// ---------------------------------------------------------------------------

// ---- Literal union types --------------------------------------------------

export type AgentMode = 'primary' | 'subagent';
export type PermissionLevel = 'allow' | 'ask' | 'deny';
export type ModelTier = 'premium' | 'standard' | 'fast';
export type BindingType = 'auto' | 'recommended';
export type InstallScope = 'global' | 'project';

// ---- Row interfaces -------------------------------------------------------

/** Row from the `agents` table. */
export interface Agent {
  id: string;
  description: string;
  mode: AgentMode;
  temperature: number;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

/** Payload for creating or updating an agent. */
export interface AgentInput {
  id: string;
  description: string;
  mode: AgentMode;
  temperature?: number;
  system_prompt: string;
}

/** Row from the `agent_tools` table. */
export interface AgentTool {
  agent_id: string;
  tool_name: string;
  allowed: boolean;
}

/** Row from the `agent_bash_permissions` table. */
export interface BashPermission {
  agent_id: string;
  pattern: string;
  permission: PermissionLevel;
}

/** Row from the `skills` table. */
export interface Skill {
  id: string;
  name: string;
  description: string | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

/** Payload for creating or updating a skill. */
export interface SkillInput {
  id: string;
  name: string;
  description?: string | null;
  content: string;
}

/** Row from the `agent_skills` table. */
export interface AgentSkill {
  agent_id: string;
  skill_id: string;
  binding: BindingType;
}

/** Row from the `cli_targets` table. */
export interface CliTarget {
  id: string;
  display_name: string;
  config_dir: string;
  agent_file_format: string;
  instructions_file: string | null;
}

/** Row from the `agent_target_config` table. JSON columns are parsed at read time. */
export interface AgentTargetConfig {
  agent_id: string;
  target_id: string;
  native_name: string | null;
  tools_override: string[] | null;
  disallowed_tools: string[] | null;
  model_override: string | null;
  extra_frontmatter: Record<string, unknown> | null;
}

/** Row from the `models` table. */
export interface Model {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
  description: string;
}

/** Row from the `installations` table. */
export interface Installation {
  target_id: string;
  scope: InstallScope;
  path: string;
  installed_at: string | null;
  version: string;
}

// ---- Operation result types -----------------------------------------------

/** Outcome of a sync operation against a single CLI target. */
export interface SyncResult {
  target: string;
  agentsWritten: string[];
  skillsWritten: string[];
  instructionsWritten: boolean;
  errors: string[];
}
