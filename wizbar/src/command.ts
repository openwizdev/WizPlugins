import type { PluginCliRegistration, PluginCliResult } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { resolveSnoozePresets, type ThreadShelf } from "./lifecycle";
import { formatStatsText } from "./stats";
import type { MovePositionV3, MoveResultV3, PinResultV3, StatsV3 } from "./v3-types";

export type LifecycleOperation = "settle" | "unsettle" | "snooze" | "unsnooze" | "mute" | "unmute" | "list";
export interface LifecycleSuccess {
  threadId: string;
  ok: true;
  shelf: ThreadShelf;
  snoozedUntil: number | null;
}
interface LifecycleFailure {
  threadId: string;
  ok: false;
  error: { code: string; message: string };
}
export class LifecycleError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

type Execute = (operation: LifecycleOperation, threadId: string, until?: number, signal?: AbortSignal) => Promise<LifecycleSuccess>;
const operations = ["settle", "unsettle", "snooze", "unsnooze", "mute", "unmute", "list"] as const;
const usage = "wizbar <settle|unsettle|snooze|unsnooze|mute|unmute|list|pin|unpin|move> <id>... [--until <absolute-time|hour|evening|tomorrow|next-week>] [--before <id>|--after <id>|--first|--last] [--json] | wizbar stats [--json]";

/** WZ21: the host's pins, through WizBar's server (sidebar-v3.v1.md section 7). */
export interface PinOperations {
  pin(operation: "pin" | "unpin", threadId: string, signal?: AbortSignal): Promise<{ threadId: string; ok: true; pinned: boolean }>;
  move(threadId: string, position: MovePositionV3, signal?: AbortSignal): Promise<{ threadId: string; ok: true; pinned: true; pinnedOrder: string[] }>;
}
const pinOperations = ["pin", "unpin", "move"] as const;
const failureOf = (threadId: string, error: unknown) => {
  const failure = error instanceof LifecycleError ? error : new LifecycleError("operation_failed", "Operation failed.");
  return { threadId, ok: false as const, error: { code: failure.code as never, message: failure.message } };
};

/** Parses and runs `pin`, `unpin` and `move`; null means a usage error. */
async function runPins(argv: readonly string[], json: boolean, pins: PinOperations, signal?: AbortSignal): Promise<PluginCliResult | null> {
  const operation = argv[0] as (typeof pinOperations)[number];
  const ids: string[] = [];
  let position: MovePositionV3 | undefined;
  let positional = false, jsonSeen = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (positional) ids.push(arg);
    else if (arg === "--") positional = true;
    else if (arg === "--json") {
      if (jsonSeen) return null;
      jsonSeen = true;
    } else if (operation === "move" && ["--before", "--after", "--first", "--last"].includes(arg)) {
      if (position) return null;
      if (arg === "--first") position = { first: true };
      else if (arg === "--last") position = { last: true };
      else {
        const anchor = argv[++i];
        if (anchor === undefined || anchor.startsWith("--")) return null;
        position = arg === "--before" ? { before: anchor } : { after: anchor };
      }
    } else if (arg.startsWith("--")) return null;
    else ids.push(arg);
  }
  if (!ids.length || (operation === "move" && (ids.length !== 1 || !position))) return null;
  const results: (PinResultV3 | MoveResultV3)[] = [];
  for (const id of ids) {
    try {
      results.push(operation === "move" ? await pins.move(id, position!, signal) : await pins.pin(operation, id, signal));
    } catch (error) {
      results.push(failureOf(id, error));
    }
  }
  const line = (r: PinResultV3 | MoveResultV3) => `${JSON.stringify(r.threadId)}: ${!r.ok
    ? `ERROR ${r.error.code}: ${r.error.message}`
    : "pinnedOrder" in r ? `moved (${r.pinnedOrder.indexOf(r.threadId) + 1} of ${r.pinnedOrder.length})`
      : r.pinned ? "pinned" : "unpinned"}`;
  return {
    exitCode: results.some((r) => !r.ok) ? 1 : 0,
    stdout: json ? JSON.stringify({ results }) + "\n" : results.map(line).join("\n") + "\n",
  };
}

function wakeTime(value: string, now: number): number {
  const preset = resolveSnoozePresets(new Date(now)).find((p) => p.id === value);
  const absolute = z.iso.datetime({ offset: true }).safeParse(value);
  const until = preset?.snoozedUntil ?? (absolute.success ? Date.parse(value) : NaN);
  if (!Number.isSafeInteger(until) || until <= now) {
    throw new LifecycleError("invalid_until", "Use an available sidebar preset or an absolute future time with a timezone.");
  }
  return until;
}

/** WZ20 (#41): reads every row and computes stats; an unavailable read gives `status: "unavailable"`. */
type ReadStats = (signal?: AbortSignal) => Promise<StatsV3>;

export function createLifecycleCommand(execute: Execute, readStats: ReadStats, pins?: PinOperations): PluginCliRegistration {
  return {
    name: "wizbar",
    summary: "List or change WizBar thread shelves.",
    commands: [
      ...operations.map((name) => ({ name, summary: `${name} one or many threads`, usage: `${name} <id>...${name === "snooze" ? " --until <time>" : ""} [--json]` })),
      { name: "stats", summary: "running, waiting and finished-today numbers", usage: "stats [--json]" },
      ...(pins ? [
        { name: "pin", summary: "pin one or many threads", usage: "pin <id>... [--json]" },
        { name: "unpin", summary: "unpin one or many threads", usage: "unpin <id>... [--json]" },
        { name: "move", summary: "move one pinned thread", usage: "move <id> (--before <id> | --after <id> | --first | --last) [--json]" },
      ] : []),
    ],
    async run(argv, ctx): Promise<PluginCliResult> {
      const endOfOptions = argv.indexOf("--");
      const json = argv.slice(1, endOfOptions < 0 ? undefined : endOfOptions).includes("--json");
      const failUsage = (): PluginCliResult => ({
        exitCode: 2,
        ...(json ? { stdout: JSON.stringify({ error: { code: "usage", message: usage } }) + "\n" } : { stderr: usage + "\n" }),
      });
      const operation = argv[0];
      if (operation === "stats") {
        const rest = argv.slice(1);
        if (rest.length > 1 || (rest.length === 1 && rest[0] !== "--json")) return failUsage();
        const stats = await readStats(ctx.signal);
        if (stats.status !== "ready") {
          const error = { code: "state_unavailable", message: "Thread state is unavailable." };
          return { exitCode: 1, stdout: (json ? JSON.stringify({ error }) : formatStatsText(stats)) + "\n" };
        }
        return { exitCode: 0, stdout: (json ? JSON.stringify(stats) : formatStatsText(stats)) + "\n" };
      }
      if (pins && pinOperations.includes(operation as never)) {
        return await runPins(argv, json, pins, ctx.signal) ?? failUsage();
      }
      if (!operations.includes(operation as LifecycleOperation)) return failUsage();
      const ids: string[] = [];
      let untilText: string | undefined;
      let positional = false;
      let jsonSeen = false;
      for (let i = 1; i < argv.length; i++) {
        const arg = argv[i]!;
        if (positional) ids.push(arg);
        else if (arg === "--") positional = true;
        else if (arg === "--json") {
          if (jsonSeen) return failUsage();
          jsonSeen = true;
        } else if (arg === "--until") {
          if (untilText !== undefined || operation !== "snooze") return failUsage();
          untilText = argv[++i];
          if (untilText === undefined || untilText.startsWith("--")) return failUsage();
        } else if (arg.startsWith("--")) return failUsage();
        else ids.push(arg);
      }
      if (!ids.length || (operation === "snooze" && untilText === undefined)) return failUsage();
      let until: number | undefined;
      let timeError: LifecycleError | undefined;
      if (untilText !== undefined) {
        try { until = wakeTime(untilText, Date.now()); }
        catch (error) { if (error instanceof LifecycleError) timeError = error; else throw error; }
      }
      const results: (LifecycleSuccess | LifecycleFailure)[] = [];
      for (const id of ids) {
        try {
          if (timeError) throw timeError;
          results.push(await execute(operation as LifecycleOperation, id, until, ctx.signal));
        } catch (error) {
          const failure = error instanceof LifecycleError ? error : new LifecycleError("operation_failed", "Operation failed.");
          results.push({ threadId: id, ok: false, error: { code: failure.code, message: failure.message } });
        }
      }
      return {
        exitCode: results.some((r) => !r.ok) ? 1 : 0,
        stdout: json ? JSON.stringify({ results }) + "\n" : results.map((r) =>
          `${JSON.stringify(r.threadId)}: ${r.ok ? r.shelf + (r.snoozedUntil === null ? "" : ` until ${new Date(r.snoozedUntil).toISOString()}`) : `ERROR ${r.error.code}: ${r.error.message}`}`,
        ).join("\n") + "\n",
      };
    },
  };
}
