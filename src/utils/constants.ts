/** The .spavn directory name — root of all spavn configuration and state */
export const SPAVN_DIR = ".spavn";

/** Subdirectory names within .spavn */
export const PLANS_DIR = "plans";
export const SESSIONS_DIR = "sessions";

/** Documentation directory name (at project root, not within .spavn) */
export const DOCS_DIR = "docs";

/** Branches that should never be directly committed to */
export const PROTECTED_BRANCHES = ["main", "master", "develop", "production", "staging"] as const;
