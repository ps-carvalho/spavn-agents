/**
 * Convert a title string to a URL/filename-safe slug.
 * Lowercases, removes special characters, replaces spaces with hyphens.
 */
export function slugify(text: string, maxLength = 50): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, maxLength);
}

/**
 * Get today's date as a YYYY-MM-DD string prefix.
 */
export function getDatePrefix(): string {
  return new Date().toISOString().split("T")[0];
}
