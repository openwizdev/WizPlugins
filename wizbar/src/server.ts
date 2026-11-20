// bb-plugin-t3sidebar backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
import { defineRpcContract, type BbPluginApi, type PluginCliRegistration } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { sectionsSettingDescriptors, specsSettingDescriptors, wizbarSettingDescriptors } from "./settings";
import { withSectionCommand } from "./sections";
import { canMute, canPark, hasRuntimeWork, resolveShelf, type ThreadActivitySignals } from "./lifecycle";
import { cardModelsNone } from "./card-meta";
import { withModelLabel } from "./model-names";
import { createLifecycleCommand, LifecycleError, type LifecycleOperation, type LifecycleSuccess, type PinOperations } from "./command";
import { placePinned } from "./drag";
import type { CardModelsResultV3, MovePositionV3 } from "./v3-types";
import { sortPinned } from "./inbox";
import { computeStatsV4, isRunning, runtimeDisplayStatuses, type StatsRow, type StatsV4Row } from "./stats";
import { readSpecsFile } from "./specs/read";
import { childrenList, runtimeStatusesV3, type ChildrenRow } from "./children";
import { registerDeckReaders } from "./deck/data/server";
import { registerDeckActions } from "./deck/actions/server";
import { registerSpecs } from "./specs/server";
import type { SpecsCommands } from "./specs/cli";
import { modelSourceV4 } from "./fixtures/v4";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS thread_mute (
     thread_id TEXT PRIMARY KEY,
     muted_at INTEGER NOT NULL,
     attention_at INTEGER NOT NULL
   )`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
  mutedAt?: number;
  muteAttentionAt?: number;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });

// cardModels (sidebar-v3 contract, section 2): 1..100 distinct trimmed IDs.
const cardModelsInputSchema = z.object({
  threadIds: z.array(z.string().trim().min(1)).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Thread IDs must be distinct."),
});
const effortSchema = z.enum(["none", "low", "medium", "high", "xhigh", "max", "ultra", "ultracode"]);
const cardModelsOutputSchema = z.object({
  source: z.enum(["none", "host"]),
  items: z.array(z.object({ threadId: z.string(), model: z.string().nullable(), effort: effortSchema.nullable() })),
});

export const t3sidebarRpcContract = defineRpcContract({
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
          mutedAt: z.number().optional(),
          muteAttentionAt: z.number().optional(),
        }),
      ),
    }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  mute: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unmute: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  cardModels: { input: cardModelsInputSchema, output: cardModelsOutputSchema },
  pin: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unpin: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  move: {
    input: z.object({ threadId: z.string().trim().min(1), position: z.union([
      z.object({ before: z.string() }).strict(), z.object({ after: z.string() }).strict(),
      z.object({ first: z.literal(true) }).strict(), z.object({ last: z.literal(true) }).strict(),
    ]) }),
    output: z.object({ ok: z.boolean() }),
  },
  pinnedOrder: { input: z.object({}), output: z.object({ order: z.array(z.string()) }) },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";

const threadRouteSchema = z.object({
  id: z.string(), projectId: z.string().min(1),
  archivedAt: z.number().nullable(), deletedAt: z.number().nullable(),
});
const liveThreadSchema = threadRouteSchema.extend({
  hasPendingInteraction: z.boolean(),
  latestAttentionAt: z.number().finite(),
  lastReadAt: z.number().finite().nullable(),
  runtime: z.object({ displayStatus: z.enum([
    "idle", "error", "active", "starting", "stopping", "provisioning",
    "host-reconnecting", "waiting-for-host",
  ]) }),
  activity: z.object({
    activeWorkflowCount: z.number().int().nonnegative(),
    activeBackgroundAgentCount: z.number().int().nonnegative(),
    activeBackgroundCommandCount: z.number().int().nonnegative(),
    activePlanModeCount: z.number().int().nonnegative(),
    activeGoalCount: z.number().int().nonnegative(),
  }).strict(),
});
const muteThreadSchema = liveThreadSchema.extend({
  pinnedAt: z.number().finite().nullable(),
  status: z.enum(["idle", "error", "active", "pending", "starting", "stopping"]),
  queuedWork: z.enum(["none", "waiting", "failed"]),
});
const unavailable = () => new LifecycleError("state_unavailable", "Working or waiting state is unavailable.");

// Read current server data, never a client-supplied eligibility assertion.
// `get` locates the thread; only `list` carries ALL work and waiting inputs.
async function readRoute(bb: BbPluginApi, threadId: string, signal?: AbortSignal) {
  try {
    const route = threadRouteSchema.safeParse(await bb.sdk.threads.get({ threadId, signal }));
    if (!route.success || route.data.id !== threadId) throw unavailable();
    if (route.data.deletedAt !== null) throw new LifecycleError("unknown_id", "Unknown thread ID.");
    return route.data;
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw unavailable();
  }
}

async function readSignals(bb: BbPluginApi, threadId: string, signal?: AbortSignal, muteAuthority = false): Promise<ThreadActivitySignals> {
  const route = await readRoute(bb, threadId, signal);
  try {
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({
        projectId: route.projectId, archived: route.archivedAt !== null,
        includeHidden: true, limit: 100, offset, signal,
      });
      if (!Array.isArray(page)) throw unavailable();
      const matches = page.filter((row) => row?.id === threadId);
      if (matches.length > 1) throw unavailable();
      if (matches.length === 1) {
        const parsed = liveThreadSchema.safeParse(matches[0]);
        if (!parsed.success) throw unavailable();
        const row = parsed.data;
        const mute = muteThreadSchema.safeParse(matches[0]);
        if (muteAuthority && !mute.success) throw unavailable();
        if (row.projectId !== route.projectId || row.deletedAt !== null) throw unavailable();
        // A disconnected host cannot provide a verified idle state.
        if (row.runtime.displayStatus === "waiting-for-host" || row.runtime.displayStatus === "host-reconnecting") throw unavailable();
        return {
          hasPendingInteraction: row.hasPendingInteraction,
          isWorking: hasRuntimeWork(row.runtime.displayStatus, Object.values(row.activity)),
          isUnread: (row.lastReadAt ?? 0) < row.latestAttentionAt,
          latestAttentionAt: row.latestAttentionAt,
          isPinned: mute.success ? mute.data.pinnedAt !== null : undefined,
          hasFailed: mute.success ? mute.data.status === "error" ||
            row.runtime.displayStatus === "error" || mute.data.queuedWork === "failed" : undefined,
        };
      }
      if (page.length < 100) throw unavailable();
      for (const row of page) {
        if (!row || typeof row.id !== "string" || seen.has(row.id)) throw unavailable();
        seen.add(row.id);
      }
    }
  } catch (error) {
    if (error instanceof LifecycleError) throw error;
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw unavailable();
  }
}

// WZ20 (#41): the CLI reader of contracts/sidebar-v3.v1.md section 1, for stats.
// Every non-archived page, hidden rows included, no project filter. A failed
// read, a malformed row or an ID repeated across pages gives null.
const statsRowSchema = z.object({
  id: z.string().trim().min(1),
  parentThreadId: z.string().nullable(),
  // WB4-3 (#1437): what the hover card's threads read (specs-section.v1.md sections 3 and 8).
  title: z.string().nullable().optional(),
  titleFallback: z.string().nullable().optional(),
  providerId: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  status: z.string(),
  queuedWork: z.enum(["none", "waiting", "failed"]),
  hasPendingInteraction: z.boolean(),
  runtime: z.object({ displayStatus: z.enum(runtimeDisplayStatuses) }),
  activity: liveThreadSchema.shape.activity,
  environmentId: z.string().nullable(),
  environmentBranchName: z.string().nullable(),
  environmentProviderId: z.string().nullable(),
  environmentHostId: z.string().nullable(),
}).transform((raw): StatsV4Row => ({
  id: raw.id, parentThreadId: raw.parentThreadId, hasPendingInteraction: raw.hasPendingInteraction,
  displayTitle: raw.title || raw.titleFallback || raw.id, providerId: raw.providerId,
  createdAt: raw.createdAt, updatedAt: raw.updatedAt, status: raw.status as StatsV4Row["status"], queuedWork: raw.queuedWork,
  runtimeStatus: raw.runtime.displayStatus,
  activity: {
    workflows: raw.activity.activeWorkflowCount, backgroundAgents: raw.activity.activeBackgroundAgentCount,
    backgroundCommands: raw.activity.activeBackgroundCommandCount, planMode: raw.activity.activePlanModeCount,
    goals: raw.activity.activeGoalCount,
  },
  // Only the fields `classifyMachine` reads; the rest of the shapes stay the host's.
  environment: raw.environmentId === null ? null : {
    id: raw.environmentId, branchName: raw.environmentBranchName, providerId: raw.environmentProviderId,
  } as StatsRow["environment"],
  host: raw.environmentHostId === null ? null : { id: raw.environmentHostId } as StatsRow["host"],
}));

async function readStatsRows(bb: BbPluginApi, signal?: AbortSignal): Promise<StatsV4Row[] | null> {
  try {
    const rows: StatsV4Row[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({ archived: false, includeHidden: true, limit: 100, offset, signal });
      if (!Array.isArray(page)) return null;
      for (const raw of page) {
        const parsed = statsRowSchema.safeParse(raw);
        if (!parsed.success || seen.has(parsed.data.id)) return null;
        seen.add(parsed.data.id);
        rows.push(parsed.data);
      }
      if (page.length < 100) return rows;
    }
  } catch {
    return null;
  }
}

// ---- WZ21: pins (sidebar-v3.v1.md sections 5 and 7) ------------------------
// The host owns pins and their order. WizBar only validates, turns a position
// into reorderPinned's neighbours, and reports what the host calls did.
const stateUnavailable = () => new LifecycleError("state_unavailable", "Thread state is unavailable.");
const hostFailure = (error: unknown) => new LifecycleError("operation_failed",
  error instanceof Error && error.message.trim() ? error.message : "Operation failed.");
const pinRouteSchema = threadRouteSchema.extend({ pinnedAt: z.number().finite().nullable() });
const pinListRowSchema = z.object({
  id: z.string().min(1), createdAt: z.number().finite(),
  pinnedAt: z.number().finite().nullable(), pinSortKey: z.string().nullable(),
});

async function readPinRoute(bb: BbPluginApi, threadId: string, signal?: AbortSignal) {
  let raw: unknown;
  try { raw = await bb.sdk.threads.get({ threadId, signal }); } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw stateUnavailable();
  }
  const route = pinRouteSchema.safeParse(raw);
  if (!route.success || route.data.id !== threadId) throw stateUnavailable();
  if (route.data.deletedAt !== null) throw new LifecycleError("unknown_id", "Unknown thread ID.");
  return route.data;
}

/** The host's pinned order over every active thread, every page, no project filter. */
async function readPinnedOrder(bb: BbPluginApi, signal?: AbortSignal): Promise<string[]> {
  const rows: z.infer<typeof pinListRowSchema>[] = [];
  const seen = new Set<string>();
  try {
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({ archived: false, includeHidden: true, limit: 100, offset, signal });
      if (!Array.isArray(page)) throw stateUnavailable();
      for (const raw of page) {
        const row = pinListRowSchema.safeParse(raw);
        if (!row.success || seen.has(row.data.id)) throw stateUnavailable();
        seen.add(row.data.id);
        rows.push(row.data);
      }
      if (page.length < 100) break;
    }
  } catch {
    throw stateUnavailable();
  }
  return sortPinned(rows.filter((row) => row.pinnedAt !== null)).map((row) => row.id);
}

function validId(rawId: string): string {
  const parsed = threadIdSchema.safeParse({ threadId: rawId });
  if (!parsed.success) throw new LifecycleError("invalid_id", "Thread ID must be nonempty.");
  return parsed.data.threadId;
}

export function createPinOperations(bb: BbPluginApi): PinOperations & {
  place(rawId: string, position: MovePositionV3, signal?: AbortSignal): Promise<void>;
  pinnedOrder(signal?: AbortSignal): Promise<string[]>;
} {
  // Validates and makes the one host call. The read after it is separate, so
  // a failed read never reports a completed reorder as a failed one.
  const place = async (rawId: string, position: MovePositionV3, signal?: AbortSignal): Promise<string> => {
    const threadId = validId(rawId);
    await readPinRoute(bb, threadId, signal);
    const anchor = "before" in position ? position.before : "after" in position ? position.after : null;
    if (anchor !== null && !anchor.trim()) throw new LifecycleError("invalid_anchor", "The anchor must be another pinned thread.");
    const placed = placePinned(await readPinnedOrder(bb, signal), threadId, position);
    if (!placed.ok) {
      throw placed.code === "not_pinned"
        ? new LifecycleError("not_pinned", "Thread is not pinned.")
        : new LifecycleError("invalid_anchor", "The anchor must be another pinned thread.");
    }
    if (placed.changed) {
      try { await bb.sdk.threads.reorderPinned({ threadId, ...placed.neighbours }); } catch (error) { throw hostFailure(error); }
    }
    return threadId;
  };
  return {
    async place(rawId, position, signal) { await place(rawId, position, signal); },
    pinnedOrder: (signal) => readPinnedOrder(bb, signal),
    async pin(operation, rawId, signal) {
      const threadId = validId(rawId);
      const route = await readPinRoute(bb, threadId, signal);
      const pinned = operation === "pin";
      // Pinning a pinned thread, or unpinning an unpinned one, changes nothing.
      if ((route.pinnedAt !== null) !== pinned) {
        try { await bb.sdk.threads[operation]({ threadId, signal }); } catch (error) { throw hostFailure(error); }
      }
      return { threadId, ok: true, pinned };
    },
    async move(rawId, position, signal) {
      const threadId = await place(rawId, position, signal);
      return { threadId, ok: true, pinned: true, pinnedOrder: await readPinnedOrder(bb, signal) };
    },
  };
}

// ---- WZ19: children (sidebar-v3.v1.md sections 1, 3 and 7) ----------------
// The CLI reader: every non-archived page, hidden rows included, no project
// filter, mapped to the row fields the shared children computation reads.
const childrenRowSchema = z.object({
  id: z.string().min(1),
  parentThreadId: z.string().nullable(),
  title: z.string().nullable().optional(),
  titleFallback: z.string().nullable().optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  latestAttentionAt: z.number().finite(),
  lastReadAt: z.number().finite().nullable(),
  hasPendingInteraction: z.boolean(),
  status: z.string(),
  queuedWork: z.enum(["none", "waiting", "failed"]),
  runtime: z.object({ displayStatus: z.enum(runtimeStatusesV3) }),
  activity: liveThreadSchema.shape.activity,
}).transform((raw): ChildrenRow => ({
  id: raw.id, parentThreadId: raw.parentThreadId,
  displayTitle: raw.title || raw.titleFallback || raw.id,
  createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  status: raw.status as ChildrenRow["status"], runtimeStatus: raw.runtime.displayStatus,
  queuedWork: raw.queuedWork, hasPendingInteraction: raw.hasPendingInteraction,
  isUnread: (raw.lastReadAt ?? 0) < raw.latestAttentionAt,
  activity: {
    workflows: raw.activity.activeWorkflowCount, backgroundAgents: raw.activity.activeBackgroundAgentCount,
    backgroundCommands: raw.activity.activeBackgroundCommandCount, planMode: raw.activity.activePlanModeCount,
    goals: raw.activity.activeGoalCount,
  },
}));

/**
 * Model and effort for `cardModels` and `wizbar children` (WB4-2,
 * specs-section.v1.md section 6): the host's resolved execution options,
 * whatever their `source` (#156: the real host answers `{ model,
 * reasoningLevel }` with none), when the model is a non-empty string and the
 * level a known one. Only when the answer is an explicit null, the model of
 * the context's latest usage snapshot, effort omitted; undefined is malformed
 * (#160), so it gets nulls with no fallback. Behind the adoption gate: closed, it
 * reads nothing and serves source none. A thread whose read fails or answers
 * malformed gets nulls; the rest stand.
 */
export async function cardModelsFrom(
  read: ModelRead,
  threadIds: readonly string[],
  adopted: boolean = modelSourceV4.adopted,
  readContext?: ModelRead,
): Promise<CardModelsResultV3> {
  if (!adopted) return cardModelsNone(threadIds);
  const items = await Promise.all(threadIds.map(async (threadId) => {
    const { model, effort } = await readModel(read, readContext, threadId);
    return { threadId, model, effort };
  }));
  return { source: "host", items };
}
type ModelRead = (args: { threadId: string }) => Promise<unknown>;
const resolvedOptionsSchema = z.object({ model: z.string().regex(/\S/), reasoningLevel: effortSchema });
const contextModelSchema = z.object({ usage: z.object({ snapshot: z.object({ model: z.string().regex(/\S/) }) }) });

/** One thread's model and effort, and the host's raw answers behind them (`wizbar models --raw`). */
async function readModel(read: ModelRead, readContext: ModelRead | undefined, threadId: string) {
  // A read that throws, synchronously or not, nulls only its own thread.
  const attempt = (reader: ModelRead) => Promise.resolve().then(() => reader({ threadId }))
    .then((answer: unknown) => ({ answer }), (error: unknown) => ({ error: { status: errorStatus(error) } }));
  const options = await attempt(read);
  const parsed = "answer" in options ? resolvedOptionsSchema.safeParse(options.answer) : null;
  let contextModel: string | null = null;
  if (!parsed?.success && "answer" in options && options.answer === null && readContext) {
    const context = await attempt(readContext);
    const found = "answer" in context ? contextModelSchema.safeParse(context.answer) : null;
    contextModel = found?.success ? found.data.usage.snapshot.model : null;
  }
  return {
    model: parsed?.success ? parsed.data.model : contextModel,
    effort: parsed?.success ? parsed.data.reasoningLevel : null,
    raw: { defaultExecutionOptions: "answer" in options ? options.answer : { error: options.error }, contextModel },
  };
}
const errorStatus = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;

const modelsUsage = "wizbar models <id>... [--raw] [--json]";
/**
 * #156: `wizbar models <id>... [--raw] [--json]`, a read-only diagnostic: each
 * thread's model and effort as the cards get them, and with `--raw` the host's
 * raw `defaultExecutionOptions` answer (or its error status) and any context
 * fallback model.
 */
function withModelsCommand(cli: PluginCliRegistration, readOptions: ModelRead, readContext: ModelRead): PluginCliRegistration {
  return {
    ...cli,
    commands: [...(cli.commands ?? []), { name: "models", summary: "each thread's model and effort, as WizBar reads them", usage: "models <id>... [--raw] [--json]" }],
    async run(argv, ctx) {
      if (argv[0] !== "models") return cli.run(argv, ctx);
      const flags = argv.slice(1).filter((arg) => arg.startsWith("--"));
      const ids = argv.slice(1).filter((arg) => !arg.startsWith("--"));
      const json = flags.includes("--json");
      const raw = flags.includes("--raw");
      if (!ids.length || flags.some((flag) => flag !== "--json" && flag !== "--raw") || new Set(flags).size !== flags.length) {
        return { exitCode: 2, ...(json ? { stdout: JSON.stringify({ error: { code: "usage", message: modelsUsage } }) + "\n" } : { stderr: modelsUsage + "\n" }) };
      }
      const models = await Promise.all(ids.map(async (threadId) => {
        const read = await readModel(readOptions, readContext, threadId);
        const known = modelSourceV4.adopted ? { model: read.model, effort: read.effort } : { model: null, effort: null };
        return { threadId, ...withModelLabel(known), ...(raw ? { raw: read.raw } : {}) };
      }));
      if (json) return { exitCode: 0, stdout: JSON.stringify({ models }) + "\n" };
      return { exitCode: 0, stdout: models.map((m) => `${JSON.stringify(m.threadId)}: ${m.modelLabel ?? "none"}${raw ? ` ${JSON.stringify(m.raw)}` : ""}`).join("\n") + "\n" };
    },
  };
}

const hostOptions = (bb: BbPluginApi): ModelRead => (args) => bb.sdk.threads.defaultExecutionOptions(args);
const hostContext = (bb: BbPluginApi): ModelRead => (args) => bb.sdk.threads.context(args);

export async function readChildren(bb: BbPluginApi, rawId: string, signal?: AbortSignal, adopted: boolean = modelSourceV4.adopted) {
  const threadId = validId(rawId);
  let route: unknown;
  try { route = await bb.sdk.threads.get({ threadId, signal }); } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      throw new LifecycleError("unknown_id", "Unknown thread ID.");
    }
    throw stateUnavailable();
  }
  const parsed = threadRouteSchema.safeParse(route);
  if (!parsed.success || parsed.data.id !== threadId) throw stateUnavailable();
  if (parsed.data.deletedAt !== null) throw new LifecycleError("unknown_id", "Unknown thread ID.");
  const rows: ChildrenRow[] = [];
  try {
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({ archived: false, includeHidden: true, limit: 100, offset, signal });
      if (!Array.isArray(page)) throw stateUnavailable();
      for (const raw of page) {
        const row = childrenRowSchema.safeParse(raw);
        if (!row.success) throw stateUnavailable();
        rows.push(row.data);
      }
      if (page.length < 100) break;
    }
  } catch {
    throw stateUnavailable();
  }
  // Model and effort: the same source the cardModels RPC serves, read for the children only.
  const childIds = rows.filter((row) => row.parentThreadId === threadId).map((row) => row.id);
  const result = childrenList(rows, threadId, await cardModelsFrom(hostOptions(bb), childIds, adopted, hostContext(bb)));
  if (!result) throw stateUnavailable();
  return { ...result, children: result.children.map(withModelLabel) };
}

/**
 * #111: `wizbar specs --json` keeps each agent's raw model and effort and adds
 * `modelLabel` (section 6). The specs command builds its body elsewhere, so the
 * label is added to its JSON output here; text output and errors pass through.
 */
function withSpecsModelLabels(specs: SpecsCommands): SpecsCommands {
  return {
    ...specs,
    async run(argv, json, signal) {
      const result = await specs.run(argv, json, signal);
      if (!json || result?.exitCode !== 0 || !result.stdout) return result;
      const body = JSON.parse(result.stdout) as { specs?: { agents?: Parameters<typeof withModelLabel>[0][] }[] };
      if (!Array.isArray(body.specs)) return result;
      const specsList = body.specs.map((spec) => Array.isArray(spec.agents) ? { ...spec, agents: spec.agents.map(withModelLabel) } : spec);
      return { ...result, stdout: JSON.stringify({ ...body, specs: specsList }) + "\n" };
    },
  };
}

export default function plugin(bb: BbPluginApi) {
  bb.settings.define(wizbarSettingDescriptors);
  // WizDeck 0.1 (#73): its read-only readers and shared cache, in this same runtime.
  const deckReaders = registerDeckReaders(bb);
  // WizDeck 0.1 (#74): the one steer path to the bound orchestrator.
  registerDeckActions(bb, { settings: deckReaders.settings });
  // WB4-1 (#1435): the specs reader, its RPC and `wizbar specs` / `wizbar spec`.
  const models = (threadIds: readonly string[]) => cardModelsFrom(hostOptions(bb), threadIds, modelSourceV4.adopted, hostContext(bb));
  const specs = registerSpecs(bb, { settings: bb.settings.define(specsSettingDescriptors), factories: deckReaders.settings, models });
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);

  // Keep each revision (including deletion) until all reads that captured it
  // have drained. Then discard it; later requests must obtain fresh host data.
  type Revision = { revision: number; pending: number; deleted: boolean };
  const pendingParks = new Map<string, Revision>();
  const invalidateParks = (threadId: string, deleted = false): void => {
    const state = pendingParks.get(threadId);
    if (state) {
      state.revision++;
      state.deleted ||= deleted;
    }
  };

  const readMutes = (): StoredLifecycleRow[] =>
    (db.prepare("SELECT thread_id, muted_at, attention_at FROM thread_mute").all() as {
      thread_id: string; muted_at: number; attention_at: number;
    }[]).map((row) => ({ threadId: row.thread_id, settledAt: null,
      snoozedUntil: null, snoozedAt: null, mutedAt: row.muted_at,
      muteAttentionAt: row.attention_at }));

  const readAll = (): StoredLifecycleRow[] => [
    ...(db.prepare(`SELECT thread_id, settled_at, snoozed_until, snoozed_at
        FROM thread_lifecycle`).all() as LifecycleDbRow[]).map((row) => ({
      threadId: row.thread_id, settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until, snoozedAt: row.snoozed_at,
    })),
    ...readMutes(),
  ];
  const publish = (threadId: string) => bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  const write = (row: StoredLifecycleRow): void => {
    db.transaction(() => {
      if (row.mutedAt !== undefined) {
        db.prepare("DELETE FROM thread_lifecycle WHERE thread_id = ?").run(row.threadId);
        db.prepare(`INSERT INTO thread_mute (thread_id, muted_at, attention_at) VALUES (?, ?, ?)
          ON CONFLICT(thread_id) DO NOTHING`).run(row.threadId, row.mutedAt, row.muteAttentionAt!);
      } else {
        db.prepare("DELETE FROM thread_mute WHERE thread_id = ?").run(row.threadId);
        db.prepare(`INSERT INTO thread_lifecycle
          (thread_id, settled_at, snoozed_until, snoozed_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(thread_id) DO UPDATE SET settled_at = excluded.settled_at,
          snoozed_until = excluded.snoozed_until, snoozed_at = excluded.snoozed_at`
        ).run(row.threadId, row.settledAt, row.snoozedUntil, row.snoozedAt);
      }
    })();
    invalidateParks(row.threadId);
    publish(row.threadId);
  };

  const clear = (threadId: string, deleted = false): void => {
    if (deleted) invalidateParks(threadId, true);
    db.transaction(() => {
      db.prepare("DELETE FROM thread_lifecycle WHERE thread_id = ?").run(threadId);
      db.prepare("DELETE FROM thread_mute WHERE thread_id = ?").run(threadId);
    })();
    if (!deleted) invalidateParks(threadId);
    publish(threadId);
  };
  // Explicit attention events invalidate older validations even if no mute
  // has reached storage yet. Ordinary parking retains its original row.
  const breakMute = (threadId: string): void => {
    invalidateParks(threadId);
    const result = db.prepare("DELETE FROM thread_mute WHERE thread_id = ?").run(threadId);
    if (result.changes) publish(threadId);
  };

  // An authoritative observation can retire only the selection captured before
  // its read. The revision also catches undo/re-mute with identical timestamps.
  const retireMute = (
    row: StoredLifecycleRow | undefined, signals: ThreadActivitySignals,
    state: Revision, revision: number,
  ): void => {
    if (row?.mutedAt === undefined || state.deleted || state.revision !== revision ||
        resolveShelf(row, signals, Date.now()) !== "active") return;
    const result = db.prepare(`DELETE FROM thread_mute
      WHERE thread_id = ? AND muted_at = ? AND attention_at = ?`
    ).run(row.threadId, row.mutedAt, row.muteAttentionAt!);
    if (result.changes) {
      invalidateParks(row.threadId);
      publish(row.threadId);
    }
  };

  const observeMute = async (threadId: string, signal?: AbortSignal): Promise<void> => {
    const row = readMutes().find((row) => row.threadId === threadId);
    if (!row || signal?.aborted) return;
    const state = pendingParks.get(threadId) ?? { revision: 0, pending: 0, deleted: false };
    const revision = state.revision;
    state.pending++;
    pendingParks.set(threadId, state);
    try {
      const signals = await readSignals(bb, threadId, signal, true);
      if (!signal?.aborted) retireMute(row, signals, state, revision);
    } catch (error) {
      // Unknown authority retains the selection, without a false publication.
      if (!(error instanceof LifecycleError)) throw error;
    } finally {
      if (--state.pending === 0) pendingParks.delete(threadId);
    }
  };

  // Reconcile missed events once per plugin load. This finite task is tracked,
  // cancelled and drained before disposal closes the plugin database.
  const startupAbort = new AbortController();
  const startupReconciliation = (async () => {
    for (const row of readMutes()) {
      if (startupAbort.signal.aborted) break;
      await observeMute(row.threadId, startupAbort.signal);
    }
  })().catch(() => {
    if (!startupAbort.signal.aborted) bb.log.warn("Could not reconcile stored mutes.");
  });
  bb.onDispose(async () => {
    startupAbort.abort();
    await startupReconciliation;
  });

  const perform = async (
    operation: LifecycleOperation, rawId: string, snoozedUntil?: number, signal?: AbortSignal,
  ): Promise<LifecycleSuccess> => {
    const parsed = threadIdSchema.safeParse({ threadId: rawId });
    if (!parsed.success) throw new LifecycleError("invalid_id", "Thread ID must be nonempty.");
    const threadId = parsed.data.threadId;
    if (operation === "unsettle" || operation === "unsnooze" || operation === "unmute") {
      await readRoute(bb, threadId, signal);
      if (signal?.aborted) throw unavailable();
      clear(threadId);
      return { threadId, ok: true, shelf: "active", snoozedUntil: null };
    }

    // Initial CLI reads observe the settled startup reconciliation rather
    // than racing it and rejecting an otherwise valid first observation.
    if (operation === "list") await startupReconciliation;

    // CLI observations can retire a mute too: capture their selection and
    // revision before the first asynchronous host read, just as mutations do.
    const stored = readAll().find((row) => row.threadId === threadId);
    const state = pendingParks.get(threadId) ?? {
      revision: 0, pending: 0, deleted: false,
    };
    if (state.deleted) throw new LifecycleError("unknown_id", "Unknown thread ID.");
    const revision = state.revision;
    state.pending++;
    pendingParks.set(threadId, state);
    try {
      const signals = await readSignals(bb, threadId, signal,
        operation === "mute" || stored?.mutedAt !== undefined);
      if (signal?.aborted) throw unavailable();
      const now = Date.now();
      if (state.deleted || state.revision !== revision) {
        throw new LifecycleError("stale_operation", "Thread lifecycle changed during validation.");
      }
      if (operation === "list") {
        retireMute(stored, signals, state, revision);
      } else {
        if (operation === "mute" && !canMute(signals)) {
          if (signals.isPinned) throw new LifecycleError("pinned", "Thread is pinned.");
          if (signals.hasPendingInteraction) throw new LifecycleError("waiting", "Thread is waiting for input.");
          if (signals.hasFailed) throw new LifecycleError("attention", "Thread requires attention.");
          throw new LifecycleError("not_working", "Only running threads may be muted.");
        }
        if (operation !== "mute" && !canPark(signals)) throw new LifecycleError(signals.hasPendingInteraction ? "waiting" : "working",
          signals.hasPendingInteraction ? "Thread is waiting for input." : "Thread is working.");
        if (operation === "snooze" && (!Number.isSafeInteger(snoozedUntil) || !Number.isFinite(new Date(snoozedUntil!).getTime()) || snoozedUntil! <= now)) {
          throw new LifecycleError("invalid_until", "Snooze time must be a valid future date.");
        }
        // No asynchronous boundary between revision/eligibility checks and
        // the plugin-only write/publication.
        write({ threadId, settledAt: operation === "settle" ? now : null,
          snoozedUntil: operation === "snooze" ? snoozedUntil! : null,
          snoozedAt: operation === "snooze" ? now : null,
          ...(operation === "mute" ? { mutedAt: now, muteAttentionAt: signals.latestAttentionAt } : {}) });
      }
      const row = readAll().find((row) => row.threadId === threadId);
      const shelf = resolveShelf(row, signals, now);
      return { threadId, ok: true, shelf, snoozedUntil: shelf === "snoozed" ? row!.snoozedUntil : null };
    } finally {
      if (--state.pending === 0) pendingParks.delete(threadId);
    }
  };

  const pins = createPinOperations(bb);
  bb.rpc.register(t3sidebarRpcContract, {
    async listLifecycle() {
      await startupReconciliation;
      return { rows: readAll() };
    },
    async settle({ threadId }) { await perform("settle", threadId); return { ok: true }; },
    async unsettle({ threadId }) { await perform("unsettle", threadId); return { ok: true }; },
    async snooze({ threadId, snoozedUntil }) { await perform("snooze", threadId, snoozedUntil); return { ok: true }; },
    async unsnooze({ threadId }) { await perform("unsnooze", threadId); return { ok: true }; },
    async mute({ threadId }) { await perform("mute", threadId); return { ok: true }; },
    async unmute({ threadId }) { await perform("unmute", threadId); return { ok: true }; },
    // WB4-2: the gated source. Before adoption every item is null with no host
    // read; after it, one failed read nulls only its own card's chip.
    async cardModels({ threadIds }) { return models(threadIds); },
    async pin({ threadId }) { await pins.pin("pin", threadId); return { ok: true }; },
    async unpin({ threadId }) { await pins.pin("unpin", threadId); return { ok: true }; },
    async move({ threadId, position }) { await pins.place(threadId, position); return { ok: true }; },
    async pinnedOrder() { return { order: await pins.pinnedOrder() }; },
  });
  // WB4-3 (#1437): the hover card's computation over the same rows, the specs
  // file (a spec only when it is ready) and the gated model source.
  // S1 (#169): `wizbar section`, beside the commands it wraps.
  const sections = bb.settings.define(sectionsSettingDescriptors);
  bb.cli.register(withSectionCommand(withModelsCommand(createLifecycleCommand(perform, async (signal) => {
    const rows = await readStatsRows(bb, signal);
    const now = Date.now();
    const read = readSpecsFile(await specs.specsFile(), now);
    const running = rows?.filter(isRunning).map((row) => row.id) ?? [];
    const stats = computeStatsV4(rows, read.status === "ready" ? read.file : null, running.length ? await models(running) : null,
      now, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return stats.threads ? { ...stats, threads: stats.threads.map(withModelLabel) } : stats;
  }, pins,
    (threadId, signal) => readChildren(bb, threadId, signal), withSpecsModelLabels(specs)), hostOptions(bb), hostContext(bb)), sections));

  bb.events.on("interaction.pending", ({ thread }) => breakMute(thread.id));
  bb.events.on("thread.failed", ({ thread }) => breakMute(thread.id));
  bb.events.on("thread.idle", ({ thread }) => {
    // A completion can arrive before the validating mute has written a row.
    invalidateParks(thread.id);
    return observeMute(thread.id);
  });
  bb.events.on("experimental_thread.events", ({ thread }) => {
    // Background-only completion need not cause a thread.idle transition.
    // Invalidate pending validations even before there is a stored mute row.
    invalidateParks(thread.id);
    return observeMute(thread.id);
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id, true);
  });
}
