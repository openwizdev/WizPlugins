// `wizbar specs` and `wizbar spec` (WB4-1, openwizdev/OpenWiz#1435):
// specs-section.v1.md section 8. Same parser rules as the 0.3 commands: one
// `--json`, `--` before literal arguments, unknown flags are usage errors.
import type { PluginCliResult } from "@get-bb/plugin-sdk";
import type { SpecKeyV4, SpecOpenResultV4, SpecsFileReadV4, SpecsResultV4 } from "../fixtures/v4";
import { readOpenKeys, withOpen } from "./open-state";
import { readSpecsFile } from "./read";
import { isHidden, isRunning, sectionRule, specRows, type SpecsThreadRow } from "./rows";
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
  openSetting(): Promise<unknown>;
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
    ...(row.agents.length > 0 ? [`${row.agents.length} running`] : []),
  ].join(" · "))].join("\n");
}

/** Splits arguments into positionals and flags; null on a repeated or unknown flag. */
function parse(args: readonly string[], allowed: readonly string[]): { positional: string[]; flags: Set<string> } | null {
  const positional: string[] = [];
  const flags = new Set<string>();
  let literal = false;
  for (const arg of args) {
    if (literal) positional.push(arg);
    else if (arg === "--") literal = true;
    else if (arg.startsWith("--")) {
      if (!allowed.includes(arg) || flags.has(arg)) return null;
      flags.add(arg);
    } else positional.push(arg);
  }
  return { positional, flags };
}

const issueKey = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+#[1-9][0-9]*$/;

export function createSpecsCommands(sources: SpecsSources): SpecsCommands {
  const specs = async (json: boolean, signal?: AbortSignal): Promise<PluginCliResult> => {
    const now = Date.now();
    const read = readSpecsFile(await sources.specsFile(), now);
    if (read.status !== "ready") return fail(json, unavailable(read.reason));
    const rows = await sources.rows(signal);
    if (rows === null) return fail(json, { code: "state_unavailable", message: "Thread state is unavailable." });
    const running = rows.filter(isRunning).map((row) => row.id);
    const models = sources.models && running.length ? await sources.models(running) : null;
    const result = specRows(read.file, rows, readOpenKeys(await sources.openSetting()), now, models);
    return { exitCode: 0, stdout: (json ? JSON.stringify(result) : formatSpecsText(result)) + "\n" };
  };

  const spec = async (reference: string, open: boolean, json: boolean): Promise<PluginCliResult> => {
    const read = readSpecsFile(await sources.specsFile(), Date.now());
    if (read.status !== "ready") return fail(json, unavailable(read.reason));
    const visible = read.file.specs.filter((entry) => !isHidden(entry)).map((entry) => entry.spec);
    const matches = issueKey.test(reference) ? visible.filter((key) => key === reference)
      : /^[1-9][0-9]*$/.test(reference) ? visible.filter((key) => key.slice(key.lastIndexOf("#") + 1) === reference) : [];
    if (matches.length > 1) return fail(json, { code: "ambiguous_spec", message: "That number matches specs in several repositories." });
    if (matches.length === 0) return fail(json, { code: "unknown_spec", message: "Unknown spec." });
    const key: SpecKeyV4 = matches[0]!;
    let stored: unknown;
    try {
      stored = await sources.writeOpenSetting(withOpen(await sources.openSetting(), key, open));
    } catch {
      return fail(json, { code: "settings_failed", message: "The settings write failed." });
    }
    const result: SpecOpenResultV4 = { spec: key, open: readOpenKeys(stored).includes(key) };
    return { exitCode: 0, stdout: (json ? JSON.stringify(result) : `${key}: ${result.open ? "open" : "closed"}`) + "\n" };
  };

  return {
    async run(argv, json, signal) {
      if (argv[0] === "specs") {
        const args = parse(argv.slice(1), ["--json"]);
        return args && args.positional.length === 0 ? specs(json, signal) : null;
      }
      const args = parse(argv.slice(1), ["--json", "--open", "--close"]);
      if (!args || args.positional.length !== 1 || args.flags.has("--open") === args.flags.has("--close")) return null;
      return spec(args.positional[0]!, args.flags.has("--open"), json);
    },
  };
}
