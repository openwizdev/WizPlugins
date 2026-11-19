// The `specsOpen` setting (WB4-1): specs-section.v1.md section 4.

/** The open spec keys a raw `specsOpen` value names; anything malformed opens nothing. */
export function readOpenKeys(_raw: unknown): string[] {
  return [];
}

/** The `specsOpen` value after opening or closing one spec. */
export function withOpen(raw: unknown, _spec: string, _open: boolean): string {
  return JSON.stringify(readOpenKeys(raw));
}
