// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the specs file reader, the spec
// rows and the open-state setting, against the contract's hand-worked
// fixtures (src/fixtures/v4.ts; specs-section.v1.md sections 1 to 5).
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  v4FailedRunningAgent, v4FleetIdMatching, v4FleetIdStats, v4FleetIdThreads, v4Matching, v4Matrix, v4Now, v4OpenSetting,
  v4OpenSettingCases, v4PullRequests, v4SpecRows, v4SpecsFile, v4SpecsFileText, v4SpecsReadCases, v4Threads, v4TimeZone,
  v4TitleCases,
} from "../fixtures/v4";
import plugin from "../server";
import { computeStatsV4 } from "../stats";
import { strictRead } from "../testing/strict-files";
import { rawRow } from "./testing";
import { readOpenKeys, withOpen } from "./open-state";
import { readSpecsFile } from "./read";
import { isRunning, matchSpec, matrixState, parseTitle, sectionRule, specRows } from "./rows";

const running = v4Threads.filter((t) => Object.hasOwn(v4Matching, t.id));

describe("S1: reading the specs file (section 1)", () => {
  // catches: a stale, missing or malformed file read as zero specs, and the 30- and 5-minute edges off by one.
  it.each(v4SpecsReadCases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(readSpecsFile(c.read, c.now)).toEqual(c.expected);
  });
});

describe("S1: spec rows, dots, last hour and needs you (section 2)", () => {
  // catches: dots in file order, a ticket closed exactly an hour ago counted as recent, finished or empty specs shown, the wrong agents.
  it("gives the contract's rows for the fixture file, rows and open setting", () => {
    expect(specRows(v4SpecsFile, v4Threads, readOpenKeys(v4OpenSetting), v4Now)).toEqual(v4SpecRows);
  });

  // catches: hidden specs counted in the rule, or a need-you count that ignores visibility.
  it("writes the section rule from visible rows only", () => {
    expect(sectionRule(v4SpecRows)).toBe("Specs 2 · 2 need you");
    expect(sectionRule({ ...v4SpecRows, needsYou: 0, specs: [v4SpecRows.specs[0]!].map((s) => ({ ...s, needsYou: 0 })) })).toBe("Specs 1");
  });

  // catches (#162): a later ticket counted as needs you, in the rule, or with its dot outside its place after needs you.
  it("counts later tickets apart from needs you, with their dots right after needs you", () => {
    const result = specRows(v4SpecsFileV2, v4Threads, readOpenKeys(v4OpenSetting), v4Now);
    expect(result).toEqual(v4SpecRowsV2);
    expect(sectionRule(result)).toBe("Specs 2 · 2 need you");
  });

  // catches: a fresh file with only finished specs shown as unavailable or with rows.
  it("shows Specs 0 and no rows when every spec is hidden", () => {
    const hiddenOnly = { ...v4SpecsFile, specs: v4SpecsFile.specs.slice(2) };
    const result = specRows(hiddenOnly, v4Threads, [], v4Now);
    expect(result.specs).toEqual([]);
    expect(sectionRule(result)).toBe("Specs 0");
  });

  // catches: a close time a moment after now (clock skew) left out of the last hour.
  it("counts a close time just after now in the last hour", () => {
    const skewed = structuredClone(v4SpecsFile);
    skewed.specs[0]!.tickets.find((t) => t.code === "SP-0")!.closedAt = new Date(v4Now + 1000).toISOString();
    const row = specRows(skewed, [], [], v4Now).specs[0]!;
    expect(row.doneLastHour).toBe(2);
    expect(row.dots.filter((d) => d.state === "done-recent").map((d) => d.code)).toEqual(["SP-0", "SP-1"]);
  });
});

describe("S2: which running threads belong to a spec (section 3)", () => {
  // catches: a fleet parent losing to a ticket code, an ambiguous code picked anyway, a waiting row listed as running.
  it.each(running.map((t) => [t.id, t] as const))("%s", (id, row) => {
    expect(matchSpec(v4SpecsFile, row)).toBe(v4Matching[id]);
  });

  // catches: a loose title parse that takes a hyphen, a lower-case code or an empty role.
  it.each(v4TitleCases.map((c) => [c[0], c] as const))("parses %j", (_title, [title, role, code]) => {
    expect(parseTitle(title)).toEqual({ role, code });
  });

  // catches: an agent's matrix taken from a pull request the server never has, or reviewers shown as working.
  it.each(Object.entries(v4Matrix))("matrix for %s, in the app and on the server", (id, expected) => {
    const row = v4Threads.find((t) => t.id === id)!;
    expect({ app: matrixState(row, v4PullRequests[id] ?? null), server: matrixState(row, null) }).toEqual(expected);
  });
});

describe("S2: the open-state setting (section 4)", () => {
  // catches: a malformed value opening something instead of failing closed.
  it.each(v4OpenSettingCases.map((c) => [JSON.stringify(c[0]) ?? "undefined", c] as const))("reads %s", (_raw, [raw, keys]) => {
    expect(readOpenKeys(raw)).toEqual(keys);
  });

  // catches: opening twice adding a key twice, closing dropping other or gone specs' keys.
  it("opens and closes idempotently, keeping keys of specs no longer listed", () => {
    const opened = withOpen(v4OpenSetting, "example/sample-tools#77", true);
    expect(readOpenKeys(opened)).toEqual(["example/sample-plans#501", "example/gone#1", "example/sample-tools#77"]);
    expect(withOpen(opened, "example/sample-tools#77", true)).toBe(opened);
    const closed = withOpen(opened, "example/sample-plans#501", false);
    expect(readOpenKeys(closed)).toEqual(["example/gone#1", "example/sample-tools#77"]);
    expect(withOpen(closed, "example/sample-plans#501", false)).toBe(closed);
    expect(readOpenKeys(withOpen("not json", "example/sample-tools#77", true))).toEqual(["example/sample-tools#77"]);
  });
});

// WB4-6 (openwizdev/OpenWiz#1581): the same rows through the spec rows, the hover
// card's data and both CLI commands, so no consumer drifts from the contract.
describe("WB4-6: missing fleet ids and failed running rows (sections 3 and 5)", () => {
  const rows = [...v4Threads, ...v4FleetIdThreads];
  const palette = { ...v4SpecRows.specs[0]!, agents: [...v4SpecRows.specs[0]!.agents, v4FailedRunningAgent] };
  const expectedRows = { ...v4SpecRows, specs: [palette, v4SpecRows.specs[1]!] };
  const hosts: FakePluginHost[] = [];
  let read: ReturnType<typeof vi.fn>;
  afterEach(async () => {
    for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
    vi.useRealTimers(); vi.unstubAllEnvs();
  });
  async function cli(argv: string[], rootPath = "/synthetic/home") {
    vi.stubEnv("TZ", v4TimeZone);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    const sha = createHash("sha256").update(v4SpecsFileText).digest("hex");
    // The real host's rule (#153): a relative path is refused with 400 "Path must be absolute".
    read = vi.fn(strictRead(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha, sizeBytes: 1 })));
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read },
      threads: { list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => rows.map(rawRow).slice(offset, offset + 100)), get: vi.fn() },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({
      specsOpen: v4OpenSetting,
      wizdeckFactories: JSON.stringify([{
        projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
        home: { hostId: "hst_v4_home", rootPath }, orchestratorThreadId: "thr_v4_orchestrator",
        statusWriterLogin: "sample-manager",
      }]),
    });
    const result = await host.harness.behavior.runCli([...argv, "--json"]);
    return { exitCode: result.exitCode, body: JSON.parse(result.stdout ?? "") };
  }

  // catches: a fleet-parent rule comparing two missing ids, which puts a top-level thread in the one spec with no fleet thread.
  it.each(Object.entries(v4FleetIdMatching))("%s matches its spec, or none", (id, expected) => {
    const row = v4FleetIdThreads.find((t) => t.id === id)!;
    expect(isRunning(row)).toBe(true);
    expect(matchSpec(v4SpecsFile, row)).toBe(expected);
  });

  // catches: a running row with failed queued work shown as working (running rows limited to working and reviewing),
  // or dropped from the running count; and the top-level row placed in the spec with no fleet thread.
  it("spec rows and the hover card's data: no spec for the top-level row, counted and failed for the failed one", () => {
    expect(specRows(v4SpecsFile, rows, readOpenKeys(v4OpenSetting), v4Now)).toEqual(expectedRows);
    expect(computeStatsV4(rows, v4SpecsFile, null, v4Now, v4TimeZone)).toEqual(v4FleetIdStats);
  });

  // catches: the CLI readers dropping the null parent or the failed queued work, so the CLI and the app disagree.
  it("wizbar specs --json and wizbar stats --json give the same", async () => {
    expect(await cli(["specs"])).toEqual({ exitCode: 0, body: expectedRows });
    expect(await cli(["stats"])).toEqual({ exitCode: 0, body: v4FleetIdStats });
  });

  // catches (#153): the reader passing `.openwiz/specs.v1.json` relative to rootPath, which the real host refuses
  // with 400 "Path must be absolute", so a fresh file reads as unreadable; and a Windows root joined with `/`.
  it.each([
    ["/synthetic/home", "/synthetic/home/.openwiz/specs.v1.json"],
    ["C:\\synthetic\\home", "C:\\synthetic\\home\\.openwiz\\specs.v1.json"],
  ])("through the real host's absolute-path rule, root %s reads %s as ready", async (rootPath, absolute) => {
    expect(await cli(["specs"], rootPath)).toEqual({ exitCode: 0, body: expectedRows });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0]).toMatchObject({ hostId: "hst_v4_home", rootPath, path: absolute });
  });
});
