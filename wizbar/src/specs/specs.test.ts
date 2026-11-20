// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the specs file reader, the spec
// rows and the open-state setting, against the contract's hand-worked
// fixtures (src/fixtures/v4.ts; specs-section.v1.md sections 1 to 5).
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  v4FailedRunningAgent, v4FleetIdMatching, v4FleetIdStats, v4FleetIdThreads, v4Matching, v4Matrix, v4Now, v4OpenSetting,
  v4OpenSettingCases, v4PullRequests, v4SpecRows, v4SpecRowsV2, v4SpecsFile, v4SpecsFileV2, v4SpecsFileV2Text, v4SpecsFileText, v4SpecsReadCases, v4Threads, v4TimeZone,
  v4TitleCases,
} from "../fixtures/v4";
import { v6Now, v6SpecsFile, v6SpecsFileText } from "../fixtures/v6";
import plugin from "../server";
import { computeStatsV4 } from "../stats";
import { strictRead } from "../testing/strict-files";
import { rawRow } from "./testing";
import { readOpenKeys, withOpen } from "./open-state";
import { readSpecsFile } from "./read";
import { isRunning, matchSpec, matrixState, parseTitle, sectionRule, specRows } from "./rows";

// S2 (#185): 0.6 rows add `activityAt` and `quiet`, the body adds `sort`, and the finished spec, hidden in 0.5,
// is now one quiet row after the others (specs-section.v1.md section 12). Worked by hand at `v4Now`: every
// fixture thread was updated a minute before, so a spec with a running agent was active then; the cache spec
// has no agent and no close time, so no activity time.
const MINUTE = 60_000;
const reviewerC = v4Threads.find((t) => t.id === "thr_v4_reviewer_c")!;
const v4FinishedQuiet = {
  spec: "example/sample-plans#601", shortName: "Sample finished", url: "https://github.com/example/sample-plans/issues/601",
  // SF-1 closed 10 minutes ago, SF-2 two hours ago.
  done: 2, total: 2, doneLastHour: 1, needsYou: 0, yoursLater: 0, open: false,
  dots: [{ ticket: "example/sample-plans#603", code: "SF-2", state: "done" }, { ticket: "example/sample-plans#602", code: "SF-1", state: "done-recent" }],
  agents: [{ threadId: "thr_v4_reviewer_c", title: reviewerC.displayTitle, role: "Reviewer", code: "SF-2", ticket: "example/sample-plans#603",
    providerId: "harness-b", model: null, effort: null, matrix: "reviewing", createdAt: reviewerC.createdAt, updatedAt: reviewerC.updatedAt }],
  activityAt: v4Now - MINUTE, quiet: true,
};
const v4ActivityAt: Record<string, number | null> = { "example/sample-plans#501": v4Now - MINUTE, "example/sample-tools#77": null };
const asV6 = <T extends { specs: readonly { spec: string }[] }>(result: T, sort = "needs-you") => ({
  ...result, sort, specs: [...result.specs.map((row) => ({ ...row, activityAt: v4ActivityAt[row.spec], quiet: false })), v4FinishedQuiet],
});

const running = v4Threads.filter((t) => Object.hasOwn(v4Matching, t.id));

describe("S1: reading the specs file (section 1)", () => {
  // catches: a stale, missing or malformed file read as zero specs, and the 30- and 5-minute edges off by one.
  it.each(v4SpecsReadCases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(readSpecsFile(c.read, c.now)).toEqual(c.expected);
  });
});

describe("P1 (#183): a ticket's updatedAt (section 10)", () => {
  const content = (text: string) => ({ kind: "content" as const, text });
  const withTicket = (schema: string, extra: Record<string, unknown>) => JSON.stringify({
    ...JSON.parse(v6SpecsFileText) as object, schema,
    specs: [{ ...v6SpecsFile.specs[0]!, tickets: [{ ...v6SpecsFile.specs[0]!.tickets[0]!, ...extra }] }],
  });

  // catches: a v2 file with update times read as malformed, or the times dropped before the spec rows get them.
  it("reads a v2 file with update times as ready, each ticket keeping its own, absent ones absent", () => {
    const read = readSpecsFile(content(v6SpecsFileText), v6Now);
    expect(read).toEqual({ status: "ready", file: v6SpecsFile });
    if (read.status !== "ready") return;
    const foxtrot = read.file.specs.find((spec) => spec.shortName === "Sample foxtrot")!;
    expect(foxtrot.tickets.map((ticket) => Object.hasOwn(ticket, "updatedAt"))).toEqual([false, false]);
    expect(read.file.specs[0]!.tickets[0]!.updatedAt).toBe("2026-11-15T12:00:00.000Z");
  });

  // catches: v1 quietly widened (an old WizBar would call it malformed), or a time that is not UTC read as one.
  it.each([
    ["v1 with updatedAt", withTicket("openwiz.specs.v1", { updatedAt: "2026-11-20T11:00:00Z" })],
    ["a local offset", withTicket("openwiz.specs.v2", { updatedAt: "2026-11-20T11:00:00+01:00" })],
    ["not a time", withTicket("openwiz.specs.v2", { updatedAt: "yesterday" })],
    ["null", withTicket("openwiz.specs.v2", { updatedAt: null })],
  ])("%s is malformed", (_name, text) => {
    expect(readSpecsFile(content(text), v6Now)).toEqual({ status: "unavailable", reason: "malformed" });
  });
});

describe("S1: spec rows, dots, last hour and needs you (section 2)", () => {
  // catches: dots in file order, a ticket closed exactly an hour ago counted as recent, finished or empty specs shown, the wrong agents.
  it("gives the contract's rows for the fixture file, rows and open setting", () => {
    expect(specRows(v4SpecsFile, v4Threads, readOpenKeys(v4OpenSetting), v4Now)).toEqual(asV6(v4SpecRows, "newest"));
  });

  // catches: hidden specs counted in the rule, or a need-you count that ignores visibility.
  it("writes the section rule from visible rows only", () => {
    expect(sectionRule(v4SpecRows)).toBe("Specs 2 · 2 tickets need you (2 specs)");
    expect(sectionRule({ ...v4SpecRows, needsYou: 0, specs: [v4SpecRows.specs[0]!].map((s) => ({ ...s, needsYou: 0 })) })).toBe("Specs 1");
  });

  // catches (#162): a later ticket counted as needs you, in the rule, or with its dot outside its place after needs you.
  it("counts later tickets apart from needs you, with their dots right after needs you", () => {
    const result = specRows(v4SpecsFileV2, v4Threads, readOpenKeys(v4OpenSetting), v4Now);
    expect(result).toEqual(asV6(v4SpecRowsV2, "newest"));
    expect(sectionRule(result)).toBe("Specs 2 · 2 tickets need you (2 specs)");
  });

  // catches: a fresh file with only finished and empty specs shown as unavailable, counted in the rule, or the empty one shown.
  // S2 (#185): the finished spec is a quiet row, never counted in the rule; the empty one stays hidden.
  it("shows Specs 0, the finished spec only as quiet, when no spec is in the main list", () => {
    const hiddenOnly = { ...v4SpecsFile, specs: v4SpecsFile.specs.slice(2) };
    const result = specRows(hiddenOnly, v4Threads, [], v4Now);
    expect(result.specs.map((row) => [row.spec, row.quiet])).toEqual([["example/sample-plans#601", true]]);
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
    // A producer from before #162: no `.openwiz/specs.v2.json` (#164 R1).
    read = vi.fn(strictRead(async ({ path }: { path: string }) => {
      if (/specs\.v2\.json$/.test(path)) throw Object.assign(new Error("gone"), { status: 404 });
      return { content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha, sizeBytes: 1 };
    }));
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
    expect(specRows(v4SpecsFile, rows, readOpenKeys(v4OpenSetting), v4Now)).toEqual(asV6(expectedRows, "newest"));
    expect(computeStatsV4(rows, v4SpecsFile, null, v4Now, v4TimeZone)).toEqual(v4FleetIdStats);
  });

  // catches: the CLI readers dropping the null parent or the failed queued work, so the CLI and the app disagree.
  it("wizbar specs --json and wizbar stats --json give the same", async () => {
    expect(await cli(["specs"])).toEqual({ exitCode: 0, body: { ...asV6(expectedRows), needsYouSpecs: 2 } });
    expect(await cli(["stats"])).toEqual({ exitCode: 0, body: v4FleetIdStats });
  });

  // catches (#153): the reader passing `.openwiz/specs.v1.json` relative to rootPath, which the real host refuses
  // with 400 "Path must be absolute", so a fresh file reads as unreadable; and a Windows root joined with `/`.
  it.each([
    ["/synthetic/home", "/synthetic/home/.openwiz/specs.v1.json"],
    ["C:\\synthetic\\home", "C:\\synthetic\\home\\.openwiz\\specs.v1.json"],
  ])("through the real host's absolute-path rule, root %s reads %s as ready", async (rootPath, absolute) => {
    expect(await cli(["specs"], rootPath)).toEqual({ exitCode: 0, body: { ...asV6(expectedRows), needsYouSpecs: 2 } });
    // specs.v2.json first (missing here), then specs.v1.json (#164 R1).
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![0]).toMatchObject({ hostId: "hst_v4_home", rootPath, path: absolute.replace("specs.v1.json", "specs.v2.json") });
    expect(read.mock.calls[1]![0]).toMatchObject({ hostId: "hst_v4_home", rootPath, path: absolute });
  });
});

// #164 R1: the producer writes specs.v1.json (v1, later as needs you) and specs.v2.json; WizBar takes
// specs.v2.json when it is usable, else specs.v1.json, and is unavailable only when neither is.
describe("#164 R1: either upgrade order", () => {
  const hosts: FakePluginHost[] = [];
  afterEach(async () => {
    for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
    vi.useRealTimers(); vi.unstubAllEnvs();
  });
  const at = (text: string, minutesOld: number) => text.replace(/"generatedAt": "[^"]+"/, `"generatedAt": "${new Date(v4Now - minutesOld * 60_000).toISOString().replace(".000Z", "Z")}"`);
  const v1 = v4SpecsFileText;
  const v2 = v4SpecsFileV2Text;
  async function specs(files: { v1?: string; v2?: string }) {
    vi.stubEnv("TZ", v4TimeZone);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    const read = vi.fn(strictRead(async ({ path }: { path: string }) => {
      const text = path.endsWith("/.openwiz/specs.v2.json") ? files.v2 : path.endsWith("/.openwiz/specs.v1.json") ? files.v1 : undefined;
      if (text === undefined) throw Object.assign(new Error("gone"), { status: 404 });
      return { content: text, contentEncoding: "utf8", path, sha256: createHash("sha256").update(text).digest("hex"), sizeBytes: text.length };
    }));
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read },
      threads: { list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => v4Threads.map(rawRow).slice(offset, offset + 100)), get: vi.fn() },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({
      specsOpen: v4OpenSetting,
      wizdeckFactories: JSON.stringify([{
        projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
        home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator",
        statusWriterLogin: "sample-manager",
      }]),
    });
    const result = await host.harness.behavior.runCli(["specs", "--json"]);
    return { exitCode: result.exitCode, body: JSON.parse(result.stdout ?? "") };
  }
  const unavailable = (reason: string) => ({ exitCode: 1, body: { error: { code: "specs_unavailable", message: "Specs unavailable.", reason } } });

  // catches: a new WizBar that needs specs.v2.json, so an old producer's file shows Specs unavailable.
  it("an old producer (specs.v1.json only): the v1 rows", async () => {
    expect(await specs({ v1 })).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRows), needsYouSpecs: 2 } });
  });
  // catches: a new WizBar that still reads only specs.v1.json, so later never shows.
  it("a new producer (both files): the v2 rows, later apart", async () => {
    expect(await specs({ v1, v2 })).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRowsV2), needsYouSpecs: 2 } });
  });
  // catches (#164 R3): after a producer rollback, an older specs.v2.json winning over a newer specs.v1.json until it goes stale.
  it("an older specs.v2.json loses to a newer specs.v1.json: a ticket now done shows done", async () => {
    const newer = JSON.parse(at(v1, 2));
    const ticket = newer.specs[0].tickets.find((t: { code: string }) => t.code === "SP-4");
    Object.assign(ticket, { state: "done", closedAt: "2026-11-19T11:58:00Z" });
    const result = await specs({ v1: JSON.stringify(newer, null, 2), v2: at(v2, 10) });
    expect(result.exitCode).toBe(0);
    expect(result.body.generatedAt).toBe(v4Now - 2 * 60_000);
    const palette = result.body.specs.find((s: { spec: string }) => s.spec === "example/sample-plans#501");
    expect({ needsYou: palette.needsYou, yoursLater: palette.yoursLater, done: palette.done, total: palette.total }).toEqual({ needsYou: 0, yoursLater: 0, done: 5, total: 10 });
    expect(palette.dots.find((d: { code: string }) => d.code === "SP-4").state).toBe("done-recent");
  });
  // catches (#164 R3): equal or newer v2 times losing to v1, so later never shows from a current producer.
  it.each([["equal", 5, 5], ["newer", 2, 5]] as const)("a specs.v2.json %s to specs.v1.json wins", async (_name, v2Age, v1Age) => {
    const result = await specs({ v1: at(v1, v1Age), v2: at(v2, v2Age) });
    expect(result).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRowsV2), generatedAt: v4Now - v2Age * 60_000, needsYouSpecs: 2 } });
  });

  // catches: a stale or broken specs.v2.json hiding a fresh specs.v1.json.
  it.each([
    ["stale", at(v2, 31)],
    ["malformed", "{\"schema\":"],
    ["of an unknown schema", v2.replace("openwiz.specs.v2", "openwiz.specs.v3")],
  ])("a specs.v2.json that is %s falls back to a fresh specs.v1.json", async (_name, text) => {
    expect(await specs({ v1, v2: text })).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRows), needsYouSpecs: 2 } });
  });
  // catches: unavailable files read as zero, or a reason from the wrong file.
  it.each([
    ["neither file: missing", {}, "missing"],
    ["v2 missing, v1 stale: v1's reason", { v1: at(v1, 31) }, "stale"],
    ["v2 stale, v1 missing: v2's reason", { v2: at(v2, 31) }, "stale"],
    ["v2 malformed, v1 stale: v2's reason", { v1: at(v1, 31), v2: "{" }, "malformed"],
  ] as const)("%s", async (_name, files, reason) => {
    expect(await specs(files)).toEqual(unavailable(reason));
  });
});
