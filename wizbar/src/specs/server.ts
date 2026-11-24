// The specs reader on WizBar's server (WB4-1, openwizdev/OpenWiz#1435):
// specs-section.v1.md section 1. It reads `.openwiz/specs.v2.json`, else `.openwiz/specs.v1.json` (#164 R1),
// under the home of the one factory bound in `wizdeckFactories`, at most once
// per 60-second shared refresh, and serves the raw read to the app (through
// `specsRpcContract`) and to `wizbar specs`. Both judge it with
// `readSpecsFile` at their own `now`.
import { createHash } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { agentsRelativePath } from "../agents/format";
import { runtimeStatusesV3 } from "../children";
import type { SpecsFileReadV4 } from "../fixtures/v4";
import type { CardModelsResultV3 } from "../v3-types";
import { createSpecsCommands, type SpecsCommands } from "./cli";
import { isReportedPath, pathInRoot } from "../deck/data/binding";
import { boundHome, pickSpecsRead, specsRelativePath, specsRelativePathV2 } from "./read";
import type { SpecsThreadRow } from "./rows";

const REFRESH_MS = 60_000;

const readOutput = z.union([
  z.object({ kind: z.enum(["no-binding", "missing", "unreadable"]) }).strict(),
  z.object({ kind: z.literal("content"), text: z.string() }).strict(),
]);
/** Bound factory file reads, before parsing. */
export const specsRpcContract = defineRpcContract({
  specsFile: { input: z.object({}).strict(), output: readOutput },
  agentsFile: { input: z.object({}).strict(), output: readOutput },
});

interface Handles {
  settings: {
    get(): Promise<{ specsOpen?: unknown; specsSort?: unknown }>;
    experimental_set(values: { specsOpen?: string | null }): Promise<{ specsOpen?: unknown }>;
  };
  factories: { get(): Promise<{ wizdeckFactories?: unknown }> };
  /** The shared model source (`cardModelsFrom`), gated by `modelSourceV4.adopted`. */
  models(threadIds: readonly string[]): Promise<CardModelsResultV3>;
}

const statusOf = (error: unknown): unknown =>
  typeof error === "object" && error !== null ? (error as { status?: unknown }).status ?? (error as { code?: unknown }).code : undefined;

/** One read of the specs file through the host's file API, every failure named. */
async function readOnce(read: BbPluginApi["sdk"]["files"]["read"], hostId: string, rootPath: string, specsRelativePath: string, signal?: AbortSignal): Promise<SpecsFileReadV4> {
  let result: Awaited<ReturnType<typeof read>>;
  try {
    // The host refuses a relative path with 400 "Path must be absolute" (#153).
    result = await read({ hostId, rootPath, path: pathInRoot(rootPath, specsRelativePath), signal });
  } catch (error) {
    const status = statusOf(error);
    return { kind: status === 404 || status === "ENOENT" || status === "not_found" ? "missing" : "unreadable" };
  }
  if (!result || typeof result !== "object" || typeof result.content !== "string" || typeof result.sha256 !== "string") return { kind: "unreadable" };
  if (!isReportedPath(rootPath, specsRelativePath, result.path)) return { kind: "unreadable" };
  let bytes: Uint8Array;
  if (result.contentEncoding === "utf8") bytes = new TextEncoder().encode(result.content);
  else if (result.contentEncoding === "base64") bytes = Uint8Array.from(Buffer.from(result.content, "base64"));
  else return { kind: "unreadable" };
  if (createHash("sha256").update(bytes).digest("hex") !== result.sha256.toLowerCase()) return { kind: "unreadable" };
  try {
    return { kind: "content", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    // Not UTF-8, so not the JSON the contract names: an empty text reads as malformed.
    return { kind: "content", text: "" };
  }
}

// ---- The CLI reader: sidebar-v3's raw-to-row table, plus `providerId` (section 6) ----
const rowSchema = z.object({
  id: z.string().min(1),
  parentThreadId: z.string().nullable(),
  title: z.string().nullable().optional(),
  titleFallback: z.string().nullable().optional(),
  providerId: z.string(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  hasPendingInteraction: z.boolean(),
  status: z.string(),
  queuedWork: z.enum(["none", "waiting", "failed"]),
  runtime: z.object({ displayStatus: z.enum(runtimeStatusesV3) }),
  activity: z.object({
    activeWorkflowCount: z.number().int().nonnegative(),
    activeBackgroundAgentCount: z.number().int().nonnegative(),
    activeBackgroundCommandCount: z.number().int().nonnegative(),
    activePlanModeCount: z.number().int().nonnegative(),
    activeGoalCount: z.number().int().nonnegative(),
  }).strict(),
}).transform((raw): SpecsThreadRow => ({
  id: raw.id, parentThreadId: raw.parentThreadId, displayTitle: raw.title || raw.titleFallback || raw.id,
  providerId: raw.providerId, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  hasPendingInteraction: raw.hasPendingInteraction, status: raw.status as SpecsThreadRow["status"],
  queuedWork: raw.queuedWork, runtimeStatus: raw.runtime.displayStatus,
  activity: {
    workflows: raw.activity.activeWorkflowCount, backgroundAgents: raw.activity.activeBackgroundAgentCount,
    backgroundCommands: raw.activity.activeBackgroundCommandCount, planMode: raw.activity.activePlanModeCount,
    goals: raw.activity.activeGoalCount,
  },
}));

/** Every non-archived page, hidden rows included; null when any read or row fails. */
async function readRows(bb: BbPluginApi, signal?: AbortSignal): Promise<SpecsThreadRow[] | null> {
  try {
    const rows: SpecsThreadRow[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await bb.sdk.threads.list({ archived: false, includeHidden: true, limit: 100, offset, signal });
      if (!Array.isArray(page)) return null;
      for (const raw of page) {
        const row = rowSchema.safeParse(raw);
        if (!row.success || seen.has(row.data.id)) return null;
        seen.add(row.data.id);
        rows.push(row.data);
      }
      if (page.length < 100) return rows;
    }
  } catch {
    return null;
  }
}

export function registerSpecs(bb: BbPluginApi, handles: Handles): SpecsCommands & {
  specsFile(): Promise<SpecsFileReadV4>;
  agentsFile(): Promise<SpecsFileReadV4>;
} {
  type Cached = { key: string; at: number; read: Promise<SpecsFileReadV4> };
  let cached: Cached | null = null;
  let cachedAgents: Cached | null = null;

  /** The bound factory's specs file, shared by every reader for 60 seconds. */
  const specsFile = async (): Promise<SpecsFileReadV4> => {
    let factories: unknown;
    try {
      factories = (await handles.factories.get()).wizdeckFactories;
    } catch {
      return { kind: "unreadable" };
    }
    const home = boundHome(factories);
    if (home === null) return { kind: "no-binding" };
    const { hostId, rootPath } = home;
    const key = `${hostId}|${rootPath}`;
    const now = Date.now();
    if (!cached || cached.key !== key || now - cached.at >= REFRESH_MS || now < cached.at) {
      const read = (path: string) => readOnce(bb.sdk.files.read, hostId, rootPath, path);
      cached = { key, at: now, read: Promise.all([read(specsRelativePathV2), read(specsRelativePath)]).then(([v2, v1]) => pickSpecsRead(v2, v1, now)) };
    }
    return cached.read;
  };

  const agentsFile = async (): Promise<SpecsFileReadV4> => {
    let factories: unknown;
    try {
      factories = (await handles.factories.get()).wizdeckFactories;
    } catch {
      return { kind: "unreadable" };
    }
    const home = boundHome(factories);
    if (home === null) return { kind: "no-binding" };
    const { hostId, rootPath } = home;
    const key = JSON.stringify([hostId, rootPath]);
    const now = Date.now();
    if (!cachedAgents || cachedAgents.key !== key || now - cachedAgents.at >= REFRESH_MS || now < cachedAgents.at) {
      cachedAgents = { key, at: now, read: readOnce(bb.sdk.files.read, hostId, rootPath, agentsRelativePath) };
    }
    return cachedAgents.read;
  };

  bb.rpc.register(specsRpcContract, { specsFile, agentsFile });

  const commands = createSpecsCommands({
    specsFile,
    models: handles.models,
    rows: (signal) => readRows(bb, signal),
    // A failed read rejects: the display shows every spec collapsed, a mutation fails before writing.
    openSetting: async () => (await handles.settings.get()).specsOpen,
    // S1 (#184): `wizbar specs` without `--sort` uses the saved sort.
    sortSetting: async () => (await handles.settings.get()).specsSort,
    writeOpenSetting: async (value) => (await handles.settings.experimental_set({ specsOpen: value })).specsOpen,
  });
  // WB4-3 (#1437): `wizbar stats` reads the same cached file.
  return { ...commands, specsFile, agentsFile };
}
