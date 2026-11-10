import type { PluginCliRegistration, PluginCliResult } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { resolveSnoozePresets, type ThreadShelf } from "./lifecycle";

export type LifecycleOperation = "settle" | "unsettle" | "snooze" | "unsnooze" | "list";
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
const operations = ["settle", "unsettle", "snooze", "unsnooze", "list"] as const;
const usage = "wizbar <settle|unsettle|snooze|unsnooze|list> <id>... [--until <absolute-time|hour|evening|tomorrow|next-week>] [--json]";

function wakeTime(value: string, now: number): number {
  const preset = resolveSnoozePresets(new Date(now)).find((p) => p.id === value);
  const absolute = z.iso.datetime({ offset: true }).safeParse(value);
  const until = preset?.snoozedUntil ?? (absolute.success ? Date.parse(value) : NaN);
  if (!Number.isSafeInteger(until) || until <= now) {
    throw new LifecycleError("invalid_until", "Use an available sidebar preset or an absolute future time with a timezone.");
  }
  return until;
}

export function createLifecycleCommand(execute: Execute): PluginCliRegistration {
  return {
    name: "wizbar",
    summary: "List or change WizBar thread shelves.",
    commands: operations.map((name) => ({ name, summary: `${name} one or many threads`, usage: `${name} <id>...${name === "snooze" ? " --until <time>" : ""} [--json]` })),
    async run(argv, ctx): Promise<PluginCliResult> {
      const endOfOptions = argv.indexOf("--");
      const json = argv.slice(1, endOfOptions < 0 ? undefined : endOfOptions).includes("--json");
      const failUsage = (): PluginCliResult => ({
        exitCode: 2,
        ...(json ? { stdout: JSON.stringify({ error: { code: "usage", message: usage } }) + "\n" } : { stderr: usage + "\n" }),
      });
      const operation = argv[0];
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
