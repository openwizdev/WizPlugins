// `wizbar specs` and `wizbar spec` (WB4-1, openwizdev/OpenWiz#1435):
// specs-section.v1.md section 8. Same parser rules as the 0.3 commands: one
// `--json`, `--` before literal arguments, unknown flags are usage errors.
import type { PluginCliResult } from "@get-bb/plugin-sdk";
import type { SpecKeyV4, SpecOpenResultV4, SpecsFileReadV4, SpecsResultV4 } from "../fixtures/v4";
import { effectiveOpen, readOpenKeys, withOpen } from "./open-state";
import { readSpecsFile } from "./read";
import { readSpecsSort, specsSorts, type SpecsSort } from "../settings";
import { isHidden, isRunning, needsYouSpecs, sectionRule, specRows, type SpecsThreadRow } from "./rows";
import type { CardModelsResultV3 } from "../v3-types";

export interface SpecsCommands {
  /** Runs `specs` or `spec`; null means a usage error. */
  run(argv: readonly string[], json: boolean, signal?: AbortSignal): Promise<PluginCliResult | null>;
}

export interface SpecsSources {
  specsFile(): Promise<SpecsFileReadV4>;
  rows(signal?: AbortSignal): Promise<SpecsThreadRow[] | null>;
  /** WB4-3 (#1437): the shared model source, as `cardModels` serves it. */
  models?(threadIds: readonly string[]): Promise<CardModelsResultV3>;
  /** Reads `specsOpen`; a failed read rejects (the display falls back to collapsed, a mutation fails). */
  openSetting(): Promise<unknown>;
  /** S1 (#184): reads `specsSort`, the order `wizbar specs` uses without `--sort`; a failed or missing read is the default. */
  sortSetting?(): Promise<unknown>;
  /** Writes `specsOpen` and returns the value read back. */
  writeOpenSetting(value: string): Promise<unknown>;
}

type Failure = { code: string; message: string; reason?: string };
const fail = (json: boolean, error: Failure): PluginCliResult => ({
  exitCode: 1,
  ...(json ? { stdout: JSON.stringify({ error }) + "\n" }
    : error.code === "specs_unavailable" ? { stderr: `Specs unavailable (${error.reason})\n` }
      : { stdout: `ERROR ${error.code}: ${error.message}\n` }),
});
const unavailable = (reason: string): Failure => ({ code: "specs_unavailable", message: "Specs unavailable.", reason });

/** The text form: the rule, then one line per visible spec. */
export function formatSpecsText(result: SpecsResultV4): string {
  return [sectionRule(result), ...result.specs.map((row) => [
    `${row.spec} ${row.shortName}: ${row.done}/${row.total}`,
    ...(row.doneLastHour > 0 ? [`${row.doneLastHour} done in the last hour`] : []),
    ...(row.needsYou > 0 ? [`${row.needsYou} needs you`] : []),
    ...(row.yoursLater > 0 ? [`${row.yoursLater} later`] : []),
    ...(row.agents.length > 0 ? [`${row.agents.length} running`] : []),
  ].join(" · "))].join("\n");
}

/**
 * Splits arguments into positionals and flags; null on a repeated or unknown flag.
 * S1 (#184): `--sort` takes the next argument as its value, one of the four sorts.
 */
function parse(args: readonly string[], allowed: readonly string[]): { positional: string[]; flags: Set<string>; sort?: SpecsSort } | null {
  const positional: string[] = [];
  const flags = new Set<string>();
  let sort: SpecsSort | undefined;
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (literal) positional.push(arg);
    else if (arg === "--") literal = true;
    else if (arg === "--sort" && allowed.includes(arg)) {
      const value = args[i + 1];
      if (sort !== undefined || !(specsSorts as readonly unknown[]).includes(value)) return null;
      sort = value as SpecsSort;
      i++;
    } else if (arg.startsWith("--")) {
      if (!allowed.includes(arg) || flags.has(arg)) return null;
      flags.add(arg);
    } else positional.push(arg);
  }
  return { positional, flags, ...(sort ? { sort } : {}) };
}

const issueKey = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+#[1-9][0-9]*$/;

export function createSpecsCommands(sources: SpecsSources): SpecsCommands {
  // One `specsOpen` read-modify-write at a time, so overlapping commands keep each other's change.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  const specs = async (json: boolean, chosen: SpecsSort | undefined, signal?: AbortSignal): Promise<PluginCliResult> => {
    const now = Date.now();
    const read = readSpecsFile(await sources.specsFile(), now);
    if (read.status !== "ready") return fail(json, unavailable(read.reason));
    const rows = await sources.rows(signal);
    if (rows === null) return fail(json, { code: "state_unavailable", message: "Thread state is unavailable." });
    const running = rows.filter(isRunning).map((row) => row.id);
    const models = sources.models && running.length ? await sources.models(running) : null;
    // A failed settings read shows every spec collapsed (section 4: fail closed).
    const openKeys = readOpenKeys(await sources.openSetting().catch(() => undefined));
    // S1 (#184): `--sort`, else the stored sort; a failed read is the default.
    const sort = chosen ?? readSpecsSort(await sources.sortSetting?.().catch(() => undefined));
    const result = specRows(read.file, rows, openKeys, now, models, sort);
    // #161: `needsYouSpecs`, the visible specs with a ticket due now, beside `needsYou`.
    return { exitCode: 0, stdout: (json ? JSON.stringify({ ...result, needsYouSpecs: needsYouSpecs(result) }) : formatSpecsText(result)) + "\n" };
  };

  const spec = async (reference: string, open: boolean, json: boolean, signal?: AbortSignal): Promise<PluginCliResult> => {
    const now = Date.now();
    const read = readSpecsFile(await sources.specsFile(), now);
    if (read.status !== "ready") return fail(json, unavailable(read.reason));
    const visible = read.file.specs.filter((entry) => !isHidden(entry)).map((entry) => entry.spec);
    const matches = issueKey.test(reference) ? visible.filter((key) => key === reference)
      : /^[1-9][0-9]*$/.test(reference) ? visible.filter((key) => key.slice(key.lastIndexOf("#") + 1) === reference) : [];
    if (matches.length > 1) return fail(json, { code: "ambiguous_spec", message: "That number matches specs in several repositories." });
    if (matches.length === 0) return fail(json, { code: "unknown_spec", message: "Unknown spec." });
    const key: SpecKeyV4 = matches[0]!;
    // The agents decide what the sidebar shows, so they are read before anything is written.
    const rows = await sources.rows(signal);
    if (rows === null) return fail(json, { code: "state_unavailable", message: "Thread state is unavailable." });
    const written = await serial(async (): Promise<{ stored: unknown } | Failure> => {
      let raw: unknown;
      try {
        raw = await sources.openSetting();
      } catch {
        // Never write from a list that could not be read: that would erase every other saved spec.
        return { code: "settings_failed", message: "The settings read failed." };
      }
      try {
        return { stored: await sources.writeOpenSetting(withOpen(raw, key, open)) };
      } catch {
        return { code: "settings_failed", message: "The settings write failed." };
      }
    });
    if (!("stored" in written)) return fail(json, written);
    const row = specRows(read.file, rows, readOpenKeys(written.stored), now).specs.find((entry) => entry.spec === key);
    const result: SpecOpenResultV4 = { spec: key, open: row !== undefined && effectiveOpen(row) };
    return { exitCode: 0, stdout: (json ? JSON.stringify(result) : `${key}: ${result.open ? "open" : "closed"}`) + "\n" };
  };

  return {
    async run(argv, json, signal) {
      if (argv[0] === "specs") {
        const args = parse(argv.slice(1), ["--json", "--sort"]);
        return args && args.positional.length === 0 ? specs(json, args.sort, signal) : null;
      }
      const args = parse(argv.slice(1), ["--json", "--open", "--close"]);
      if (!args || args.positional.length !== 1 || args.flags.has("--open") === args.flags.has("--close")) return null;
      return spec(args.positional[0]!, args.flags.has("--open"), json, signal);
    },
  };
}
