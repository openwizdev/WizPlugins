// The specs file reader (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md
// section 1. Pure: the server does the file read and hands the result here,
// so the app and the CLI judge the same read at their own `now`.
import { z } from "zod";
import { homeRootProblem, readDeckFactories } from "../deck/data/binding";
import type { SpecsFileReadV4, SpecsReadV4 } from "../fixtures/v4";
import type { SpecsFileV6 } from "../fixtures/v6";

/** `readSpecsFile`'s result: a ready file keeps each v2 ticket's `updatedAt` (#183) for the spec rows. */
export type SpecsReadV6 = Exclude<SpecsReadV4, { status: "ready" }> | { status: "ready"; file: SpecsFileV6 };

/** Where the specs files live, relative to the bound factory's home root: v2 first, then v1 (#164 R1). */
export const specsRelativePath = ".openwiz/specs.v1.json";
export const specsRelativePathV2 = ".openwiz/specs.v2.json";
export const specsSchemaId = "openwiz.specs.v1";
/** v2 (#162) is v1 plus the `yours-later` ticket state; WizBar reads both, whichever the producer writes. */
export const specsSchemaIdV2 = "openwiz.specs.v2";

const MINUTE = 60_000;

/**
 * The home of the one factory bound in `wizdeckFactories`, or null (no-binding):
 * none, several, or a forbidden root. The server reads the file under it; the
 * app uses it only to skip the read when there is nothing to read.
 */
export function boundHome(wizdeckFactories: unknown): { hostId: string; rootPath: string } | null {
  const binding = readDeckFactories(wizdeckFactories);
  if (!binding.ok || binding.factories.length !== 1) return null;
  const { hostId, rootPath } = binding.factories[0]!.binding.home;
  return homeRootProblem(rootPath) === null ? { hostId, rootPath } : null;
}
const issueKey = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)#([1-9][0-9]*)$/;
const utc = z.iso.datetime();
const key = z.string().refine((value) => {
  const match = issueKey.exec(value);
  return match !== null && Number.isSafeInteger(Number(match[3]));
});

const ticketSchema = z.object({
  ticket: key,
  // 0.5.0 A: real codes may have no hyphen (`KN3`, `AP11`); the old `WB4-1` form still reads.
  code: z.string().regex(/^[A-Z][A-Z0-9]*-?[0-9]+$/).nullable(),
  title: z.string().refine((title) => title.trim().length > 0),
  state: z.enum(["done", "building", "review", "needs-you", "yours-later", "held", "not-started"]),
  closedAt: utc.nullable(),
  // Additive (#183, section 10): the issue's last activity, v2 only (the file rule below).
  updatedAt: utc.optional(),
  // Additive (0.5.0 A): the ticket's open pull request numbers, for `Review #P at <sha>` titles.
  pulls: z.array(z.number().int().positive().refine(Number.isSafeInteger)).optional(),
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
  schema: z.enum([specsSchemaId, specsSchemaIdV2]),
  generatedAt: utc,
  specs: z.array(specSchema),
}).strict().refine((file) => distinct(file.specs.map((spec) => spec.spec)))
  // v1 has no later state.
  .refine((file) => file.schema === specsSchemaIdV2 || file.specs.every((spec) => spec.tickets.every((ticket) => ticket.state !== "yours-later")))
  // v1 stays exactly as it was (#183): `updatedAt` there is an unknown field.
  .refine((file) => file.schema === specsSchemaIdV2 || file.specs.every((spec) => spec.tickets.every((ticket) => !Object.hasOwn(ticket, "updatedAt"))));

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

/**
 * Which of the two reads WizBar shows (#164 R1, R3). When both read ready at `now`, `specs.v2.json` unless
 * its `generatedAt` is older than v1's (a producer rolled back to one that writes only v1); when one does,
 * that one; otherwise v2's read, or v1's when v2 is missing, so the reason names the file that is there.
 */
export function pickSpecsRead(v2: SpecsFileReadV4, v1: SpecsFileReadV4, now: number): SpecsFileReadV4 {
  const read2 = readSpecsFile(v2, now);
  const read1 = readSpecsFile(v1, now);
  if (read2.status === "ready" && read1.status === "ready") {
    return Date.parse(read2.file.generatedAt) >= Date.parse(read1.file.generatedAt) ? v2 : v1;
  }
  if (read2.status === "ready") return v2;
  if (read1.status === "ready" || v2.kind === "missing") return v1;
  return v2;
}

/** Section 1's reading table, first match wins. Every failure is unavailable, never zero. */
export function readSpecsFile(read: SpecsFileReadV4, now: number): SpecsReadV6 {
  if (read.kind !== "content") return { status: "unavailable", reason: read.kind };
  const malformed: SpecsReadV6 = { status: "unavailable", reason: "malformed" };
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
  if (schema !== specsSchemaId && schema !== specsSchemaIdV2) return { status: "unavailable", reason: "unknown-schema" };
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return malformed;
  const generatedAt = Date.parse(parsed.data.generatedAt);
  if (generatedAt - now > 5 * MINUTE) return malformed;
  if (now - generatedAt > 30 * MINUTE) return { status: "unavailable", reason: "stale" };
  return { status: "ready", file: parsed.data as SpecsFileV6 };
}
