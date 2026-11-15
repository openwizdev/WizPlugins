// The spec status comment (factory-view.v1.md, section 3).
import type { SpecStatusV1 } from "./types";

export const specStatusMarker = "<!-- openwiz:spec-status:v1 -->";

const notEstimated = "Not estimated";
const unavailable = (reason: "missing" | "malformed" | "ambiguous"): SpecStatusV1 =>
  ({ status: "unavailable", reason, when: notEstimated });
const firstLine = (body: string) => body.split(/\r?\n/).find((line) => line.trim() !== "")?.trim();
// An estimate must say its time zone: UTC/GMT, Z, a numeric offset or an IANA name.
const hasZone = /\b(UTC|GMT)\b|\dZ\b|[+-]\d{2}:?\d{2}\b|\b[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+\b/;
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Parse one marker comment's body. Anything malformed shows `Not estimated`. */
export function parseSpecStatus(body: string): SpecStatusV1 {
  if (firstLine(body) !== specStatusMarker) return unavailable("missing");
  const fields = new Map<string, string>();
  for (const line of body.split(/\r?\n/)) {
    const match = /^(Now|Next|When|Updated):(.*)$/.exec(line.trim());
    if (!match) continue;
    if (fields.has(match[1])) return unavailable("malformed");
    fields.set(match[1], match[2].trim());
  }
  const [now, next, when, updated] = ["Now", "Next", "When", "Updated"].map((key) => fields.get(key) ?? "");
  if (!now || !next || !when || !isoUtc.test(updated) || Number.isNaN(Date.parse(updated))) return unavailable("malformed");
  if (when !== notEstimated && !hasZone.test(when)) return unavailable("malformed");
  return { status: "ready", now, next, when, updated };
}

/** Select the one marker comment by the configured writer. None or several is unavailable. */
export function readSpecStatus(comments: readonly { authorLogin: string; body: string }[], writerLogin: string): SpecStatusV1 {
  const marked = comments.filter((comment) =>
    comment.authorLogin === writerLogin && firstLine(comment.body) === specStatusMarker);
  if (marked.length === 0) return unavailable("missing");
  if (marked.length > 1) return unavailable("ambiguous");
  return parseSpecStatus(marked[0].body);
}
