// The `specsOpen` setting (WB4-1): specs-section.v1.md section 4. A JSON array
// of open spec keys; every spec starts collapsed, and anything malformed
// opens nothing (fail closed).

/** The open spec keys a raw `specsOpen` value names; anything malformed opens nothing. */
export function readOpenKeys(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(value) && value.every((key) => typeof key === "string") ? value : [];
}

/**
 * The `specsOpen` value after opening or closing one spec. Opening adds the key
 * once, closing removes it, and keys of specs no longer listed are kept.
 */
export function withOpen(raw: unknown, spec: string, open: boolean): string {
  const keys = readOpenKeys(raw);
  if (open) return JSON.stringify(keys.includes(spec) ? keys : [...keys, spec]);
  return JSON.stringify(keys.filter((key) => key !== spec));
}

/**
 * Whether a spec row shows open (section 4): its key is saved open and it has
 * running agents. A visible spec with no agents has no chevron, so it shows
 * closed whatever is saved; its saved key is kept for when agents return. The
 * sidebar and `wizbar spec` both report this.
 */
export function effectiveOpen(row: { open: boolean; agents: readonly unknown[] }): boolean {
  return row.open && row.agents.length > 0;
}
