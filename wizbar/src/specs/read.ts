// The specs file reader (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md
// section 1. Pure: the server does the file read and hands the result here,
// so the app and the CLI judge the same read at their own `now`.
import { z } from "zod";
import type { SpecsFileReadV4, SpecsFileV4, SpecsReadV4 } from "../fixtures/v4";

/** Where the specs file lives, relative to the bound factory's home root. */
export const specsRelativePath = ".openwiz/specs.v1.json";
export const specsSchemaId = "openwiz.specs.v1";

const MINUTE = 60_000;
const issueKey = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)#([1-9][0-9]*)$/;
const utc = z.iso.datetime();
const key = z.string().refine((value) => {
  const match = issueKey.exec(value);
  return match !== null && Number.isSafeInteger(Number(match[3]));
});

const ticketSchema = z.object({
  ticket: key,
  code: z.string().regex(/^[A-Z][A-Z0-9]*-[0-9]+$/).nullable(),
  title: z.string().refine((title) => title.trim().length > 0),
  state: z.enum(["done", "building", "review", "needs-you", "held", "not-started"]),
  closedAt: utc.nullable(),
}).strict().refine((ticket) => ticket.state === "done" || ticket.closedAt === null);

const specSchema = z.object({
  spec: key,
  shortName: z.string().refine((name) => { const length = [...name.trim()].length; return length >= 1 && length <= 40; }),
  url: z.string(),
  fleetThreadId: z.string().min(1).nullable(),
  tickets: z.array(ticketSchema),
}).strict().refine((spec) => {
  const [, owner, name, number] = issueKey.exec(spec.spec)!;
  if (spec.url !== `https://github.com/${owner}/${name}/issues/${number}`) return false;
  const codes = spec.tickets.flatMap((ticket) => (ticket.code === null ? [] : [ticket.code]));
  return distinct(spec.tickets.map((ticket) => ticket.ticket)) && distinct(codes);
});

const fileSchema = z.object({
  schema: z.literal(specsSchemaId),
  generatedAt: utc,
  specs: z.array(specSchema),
}).strict().refine((file) => distinct(file.specs.map((spec) => spec.spec)));

function distinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * True when some JSON object in `content` repeats a key: `JSON.parse` keeps the
 * last one silently. Call only on text `JSON.parse` accepts. (The same scan as
 * the Needs-you reader's in src/factory-contract/queue.ts, which does not export it.)
 */
function hasRepeatedKey(content: string): boolean {
  const stack: (Set<string> | null)[] = [];
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "\"") {
      let end = i + 1;
      while (content[end] !== "\"") end += content[end] === "\\" ? 2 : 1;
      const token = content.slice(i, end + 1);
      i = end + 1;
      while (/\s/.test(content[i] ?? "")) i += 1;
      const keys = stack[stack.length - 1];
      if (content[i] === ":" && keys) {
        const name = JSON.parse(token) as string;
        if (keys.has(name)) return true;
        keys.add(name);
      }
      continue;
    }
    if (ch === "{") stack.push(new Set());
    else if (ch === "[") stack.push(null);
    else if (ch === "}" || ch === "]") stack.pop();
    i += 1;
  }
  return false;
}

/** Section 1's reading table, first match wins. Every failure is unavailable, never zero. */
export function readSpecsFile(read: SpecsFileReadV4, now: number): SpecsReadV4 {
  if (read.kind !== "content") return { status: "unavailable", reason: read.kind };
  const malformed: SpecsReadV4 = { status: "unavailable", reason: "malformed" };
  let raw: unknown;
  try {
    raw = JSON.parse(read.text);
  } catch {
    return malformed;
  }
  if (hasRepeatedKey(read.text)) return malformed;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return malformed;
  const schema = (raw as { schema?: unknown }).schema;
  if (typeof schema !== "string") return malformed;
  if (schema !== specsSchemaId) return { status: "unavailable", reason: "unknown-schema" };
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return malformed;
  const generatedAt = Date.parse(parsed.data.generatedAt);
  if (generatedAt - now > 5 * MINUTE) return malformed;
  if (now - generatedAt > 30 * MINUTE) return { status: "unavailable", reason: "stale" };
  return { status: "ready", file: parsed.data as SpecsFileV4 };
}
