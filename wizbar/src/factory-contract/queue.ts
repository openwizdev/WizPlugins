// The Needs-you queue v1 boundary (factory-view.v1.md, section 2): the one
// validator every consumer reads through, the dispatch check that cancels a
// stale answer, and the disabled consumer stub D1/D2 replace.
import { z } from "zod";
import type {
  DispatchRefusalV1, FactoryBindingV1, SteerRequestV1, UnavailableReasonV1,
} from "./types";

export const needsYouSchemaId = "openwiz.needs-you.v1";
/** Relative to the configured home checkout's root; never a fixed user or project path. */
export const needsYouRelativePath = ".openwiz/needs-you.v1.json";

const utc = z.iso.datetime();
const stableId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const text = z.string().trim().min(1).regex(/\S/);
const httpsAuthority = /^https:\/\/(?:[^\s/?#@]*@)?(?:\[[0-9A-Fa-f:.]+\]|[^\s/?#@:\[\]]+)(?::(?:[0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?(?:[/?#]\S*)?$/;
const httpsUrl = z.string().check(z.regex(httpsAuthority), z.url({ protocol: /^https$/ }));

export const needsYouItemSchema = z.object({
  id: stableId,
  code: text.max(32),
  question: text,
  options: z.array(z.object({ id: stableId, label: text }).strict()).min(1),
  recommendedOptionId: stableId.nullable(),
  sourceUrl: httpsUrl,
  spec: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+#[1-9][0-9]*$/).nullable(),
  risk: z.enum(["ordinary", "live", "release", "publish", "unknown"]),
  fingerprint: text,
  requestId: text.optional(),
  requestFingerprint: text.optional(),
  createdAt: utc,
  updatedAt: utc,
}).strict();

export const needsYouQueueSchema = z.object({
  schema: z.literal(needsYouSchemaId),
  project: stableId,
  revision: z.int().min(0),
  updatedAt: utc,
  expiresAt: utc,
  complete: z.boolean(),
  gaps: z.array(text),
  items: z.array(needsYouItemSchema),
}).strict();

export type NeedsYouItemV1 = z.infer<typeof needsYouItemSchema>;
export type NeedsYouQueueV1 = z.infer<typeof needsYouQueueSchema>;

export type QueueReadV1 =
  | { ok: true; queue: NeedsYouQueueV1 }
  | { ok: false; reason: UnavailableReasonV1 };

export interface QueueReadContextV1 {
  projectKey: string;
  /** Epoch ms. */
  now: number;
  /** The last revision this reader accepted; a lower one is stale. */
  previousRevision?: number;
}

/**
 * True when some JSON object in `content` repeats a key. `JSON.parse` keeps
 * the last one silently, so the reader refuses the file instead. Call only on
 * text `JSON.parse` accepts.
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
        const key = JSON.parse(token) as string;
        if (keys.has(key)) return true;
        keys.add(key);
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

/** Validate one queue file's UTF-8 text. Every failure is unavailable, never an empty queue. */
export function readNeedsYouQueue(content: string, context: QueueReadContextV1): QueueReadV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (hasRepeatedKey(content)) return { ok: false, reason: "malformed" };
  return validateNeedsYouQueue(raw, context);
}

export function validateNeedsYouQueue(raw: unknown, context: QueueReadContextV1): QueueReadV1 {
  const fail = (reason: UnavailableReasonV1): QueueReadV1 => ({ ok: false, reason });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("malformed");
  if ((raw as { schema?: unknown }).schema !== needsYouSchemaId) return fail("unknown-schema");
  const parsed = needsYouQueueSchema.safeParse(raw);
  if (!parsed.success) return fail("malformed");
  const queue = parsed.data;
  if (queue.project !== context.projectKey) return fail("wrong-project");
  if (new Set(queue.items.map((item) => item.id)).size !== queue.items.length) return fail("duplicate-item");
  for (const item of queue.items) {
    const optionIds = item.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) return fail("malformed");
    if (item.recommendedOptionId !== null && !optionIds.includes(item.recommendedOptionId)) return fail("malformed");
    if ((item.requestId === undefined) !== (item.requestFingerprint === undefined)) return fail("malformed");
    if (Date.parse(item.createdAt) > Date.parse(item.updatedAt)) return fail("malformed");
  }
  if (Date.parse(queue.updatedAt) > Date.parse(queue.expiresAt)) return fail("malformed");
  if (!queue.complete && queue.gaps.length === 0) return fail("malformed");
  if (context.previousRevision !== undefined && queue.revision < context.previousRevision) return fail("stale-revision");
  if (Date.parse(queue.expiresAt) <= context.now) return fail("expired");
  return { ok: true, queue };
}

/**
 * Re-check a steer against a fresh queue read immediately before the SDK call.
 * Any refusal cancels the send; nothing is retried or substituted.
 */
export function checkSteerDispatch(
  request: SteerRequestV1,
  binding: FactoryBindingV1,
  current: QueueReadV1,
): { ok: true } | { ok: false; reason: DispatchRefusalV1 } {
  const refuse = (reason: DispatchRefusalV1) => ({ ok: false as const, reason });
  if (request.projectKey !== binding.projectKey) return refuse("wrong-project");
  if (request.orchestratorThreadId !== binding.orchestratorThreadId) return refuse("wrong-target");
  // Tell, spec actions and feedback carry no decision: project and target are their whole check.
  if (request.kind !== "answer") return { ok: true };
  if (!current.ok) return refuse("queue-unavailable");
  if (current.queue.project !== binding.projectKey) return refuse("wrong-project");
  const answer = request.answer;
  if (!answer) return refuse("item-gone");
  if (answer.queueRevision !== current.queue.revision) return refuse("revision-changed");
  const item = current.queue.items.find((candidate) => candidate.id === answer.itemId);
  if (!item) return refuse("item-gone");
  if (item.fingerprint !== answer.fingerprint) return refuse("proposal-changed");
  if (!item.options.some((option) => option.id === answer.optionId)) return refuse("unknown-option");
  if (item.risk !== "ordinary") return refuse("gated-risk");
  return { ok: true };
}

export interface NeedsYouViewItemV1 {
  id: string;
  code: string;
  question: string;
  options: { id: string; label: string }[];
  recommendedOptionId: string | null;
  risk: NeedsYouItemV1["risk"];
  /** C1 stub: answering stays off until D2 wires the steer path. */
  answer: { enabled: false; reason: "contract-stub" };
}

export type NeedsYouViewV1 =
  | { state: "unavailable"; reason: UnavailableReasonV1; count: null; items: [] }
  | { state: "ready"; complete: boolean; count: number | null; items: NeedsYouViewItemV1[]; gaps: string[] };

/** Disabled consumer stub: what Home will list, with no effect enabled. */
export function needsYouViewStub(read: QueueReadV1): NeedsYouViewV1 {
  if (!read.ok) return { state: "unavailable", reason: read.reason, count: null, items: [] };
  const { queue } = read;
  return {
    state: "ready",
    complete: queue.complete,
    count: queue.complete ? queue.items.length : null,
    gaps: [...queue.gaps],
    items: queue.items.map((item) => ({
      id: item.id, code: item.code, question: item.question,
      options: item.options.map((option) => ({ ...option })),
      recommendedOptionId: item.recommendedOptionId, risk: item.risk,
      answer: { enabled: false, reason: "contract-stub" },
    })),
  };
}
