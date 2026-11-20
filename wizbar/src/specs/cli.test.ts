// WB4-1 (openwizdev/OpenWiz#1435): `wizbar specs` and `wizbar spec` through the
// real server registration (specs-section.v1.md sections 1, 4 and 8). Host
// reads are synthetic: the fixture rows, the fixture specs file and one
// made-up factory binding.
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import plugin from "../server";
import { v4Now, v4OpenSetting, v4SpecOpenCases, v4SpecRows, v4SpecRowsV2, v4SpecsFile, v4SpecsFileText, v4SpecsFileV2Text, v4Threads } from "../fixtures/v4";
import { quietAfterMsV6, specsSortsV6, v6Activity, v6Agents, v6Now, v6QuietSplit, v6SortOrders, v6SpecsFile, v6SpecsFileText } from "../fixtures/v6";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { effectiveOpen, readOpenKeys } from "./open-state";
import { activityAt, sectionRule, sortSpecs, specRows } from "./rows";
import { rawRow } from "./testing";

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

const factory = {
  projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
  home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator",
  statusWriterLogin: "sample-manager",
};
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

type Read = (args: { path: string; hostId?: string; rootPath?: string }) => Promise<unknown>;
const contentRead = (text: string): Read => async ({ path }) =>
  ({ content: text, contentEncoding: "utf8", path, sha256: sha(text), sizeBytes: text.length });

const hosts: FakePluginHost[] = [];
async function setup(options: { text?: string; read?: Read; list?: () => Promise<unknown>; settings?: Record<string, string> } = {}) {
  const read = vi.fn(options.read ?? contentRead(options.text ?? v4SpecsFileText));
  const list = vi.fn(options.list ?? (async ({ offset = 0 }: { offset?: number } = {}) => v4Threads.map(rawRow).slice(offset, offset + 100)));
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: { files: { read }, threads: { list, get: vi.fn() } } as never });
  hosts.push(host);
  // The `specsOpen` handle: its stored value read directly, and a hook run before each plugin read.
  const open: { get?: () => Promise<{ specsOpen?: unknown }>; beforeGet: () => Promise<void> } = { beforeGet: async () => {} };
  const define = host.bb.settings.define.bind(host.bb.settings);
  vi.spyOn(host.bb.settings, "define").mockImplementation(((descriptors: Record<string, unknown>) => {
    const handle = define(descriptors as never);
    if (!("specsOpen" in descriptors)) return handle;
    const get = handle.get.bind(handle);
    open.get = get as typeof open.get;
    handle.get = async () => { await open.beforeGet(); return get(); };
    return handle;
  }) as BbPluginApi["settings"]["define"]);
  plugin(host.bb);
  await host.harness.behavior.setSettings({ wizdeckFactories: JSON.stringify([factory]), specsOpen: v4OpenSetting, ...options.settings });
  const run = async (argv: string[]) => {
    const result = await host.harness.behavior.runCli(argv);
    return { exitCode: result.exitCode, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  const json = async (argv: string[]) => {
    const result = await run([...argv, "--json"]);
    return { exitCode: result.exitCode, body: JSON.parse(result.stdout) };
  };
  const stored = async () => (await open.get!()).specsOpen;
  return { host, read, list, run, json, open, stored };
}

beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(v4Now);
});
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.useRealTimers(); vi.unstubAllEnvs();
});

describe("wizbar specs (section 8)", () => {
  // catches: a CLI reader that drops the provider, the parent or hidden rows, or reads another path or host.
  it("prints the contract's rows as JSON, read from the bound factory's specs file", async () => {
    // A producer from before #162 wrote only specs.v1.json: WizBar tries specs.v2.json, then reads it (#164 R1).
    const v1Only: Read = async (args) => {
      if (args.path.endsWith("specs.v2.json")) throw Object.assign(new Error("gone"), { status: 404 });
      return contentRead(v4SpecsFileText)(args);
    };
    const cli = await setup({ read: v1Only });
    expect(await cli.json(["specs"])).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRows), needsYouSpecs: 2 } });
    expect(cli.read.mock.calls.map(([args]) => args)).toEqual([
      expect.objectContaining({ hostId: "hst_v4_home", rootPath: "/synthetic/home", path: "/synthetic/home/.openwiz/specs.v2.json" }),
      expect.objectContaining({ hostId: "hst_v4_home", rootPath: "/synthetic/home", path: "/synthetic/home/.openwiz/specs.v1.json" }),
    ]);
  });

  // catches: text that shows zero parts, or omits the running count of a spec with agents.
  it("prints the section as text", async () => {
    const cli = await setup();
    expect(await cli.run(["specs"])).toEqual({ exitCode: 0, stderr: "", stdout: [
      "Specs 2 · 2 tickets need you (2 specs)",
      "example/sample-plans#501 Sample palette: 4/10 · 1 done in the last hour · 1 needs you · 4 running",
      "example/sample-tools#77 Sample cache: 0/3 · 1 needs you",
      "example/sample-plans#601 Sample finished: 2/2 · 1 done in the last hour · 1 running · quiet",
      "",
    ].join("\n") });
  });

  // catches (#162): a v2 file refused, or its later tickets missing from the JSON, folded into needs you, or left out of the text.
  it("prints later tickets apart from needs you, in JSON and text", async () => {
    const cli = await setup({ text: v4SpecsFileV2Text });
    expect(await cli.json(["specs"])).toEqual({ exitCode: 0, body: { ...asV6(v4SpecRowsV2), needsYouSpecs: 2 } });
    expect(await cli.run(["specs"])).toEqual({ exitCode: 0, stderr: "", stdout: [
      "Specs 2 · 2 tickets need you (2 specs)",
      "example/sample-plans#501 Sample palette: 4/11 · 1 done in the last hour · 1 needs you · 1 later · 4 running",
      "example/sample-tools#77 Sample cache: 0/3 · 1 needs you",
      "example/sample-plans#601 Sample finished: 2/2 · 1 done in the last hour · 1 running · quiet",
      "",
    ].join("\n") });
  });

  // catches (#161): a rule read as a count of specs, a wrong singular, or the JSON missing how many specs need you.
  it.each([
    ["one ticket in one spec", ["not-started"], "Specs 2 · 1 ticket needs you (1 spec)", 1, 1],
    ["two tickets in one spec", ["needs-you"], "Specs 2 · 2 tickets need you (1 spec)", 2, 1],
  ] as const)("words the rule for %s, and counts its specs in the JSON", async (_name, [palette79], rule, needsYou, needsYouSpecs) => {
    const file = structuredClone(v4SpecsFile);
    // The cache spec's needs-you ticket moves; the palette keeps its one (SP-4), and gains another for the second case.
    file.specs[1]!.tickets.find((t) => t.code === "SH-1")!.state = "not-started";
    file.specs[0]!.tickets.find((t) => t.code === "SP-5")!.state = palette79;
    const cli = await setup({ text: JSON.stringify(file) });
    expect((await cli.run(["specs"])).stdout.split("\n")[0]).toBe(rule);
    const body = (await cli.json(["specs"])).body;
    expect({ needsYou: body.needsYou, needsYouSpecs: body.needsYouSpecs }).toEqual({ needsYou, needsYouSpecs });
  });

  // catches (#161): a rule that says something after the count when nothing is due now, or a missing zero in the JSON.
  it("says only Specs N when nothing is due now, with needsYouSpecs 0", async () => {
    const file = structuredClone(v4SpecsFile);
    for (const spec of file.specs) for (const ticket of spec.tickets) if (ticket.state === "needs-you") ticket.state = "not-started";
    const cli = await setup({ text: JSON.stringify(file) });
    expect((await cli.run(["specs"])).stdout.split("\n")[0]).toBe("Specs 2");
    expect((await cli.json(["specs"])).body).toMatchObject({ needsYou: 0, needsYouSpecs: 0 });
  });

  // catches: an unavailable file shown as "Specs 0", in JSON or text.
  it.each([
    ["stale", { text: v4SpecsFileText }, 26 * 60_000],
    ["missing", { read: async () => { throw Object.assign(new Error("gone"), { status: 404 }); } }, 0],
    ["unreadable", { read: async () => { throw new Error("offline"); } }, 0],
    ["unreadable", { read: async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: "0".repeat(64), sizeBytes: 1 }) }, 0],
    ["malformed", { text: "{\"schema\":" }, 0],
    ["no-binding", { settings: { wizdeckFactories: JSON.stringify([factory, { ...factory, projectKey: "other-factory" }]) } }, 0],
    ["no-binding", { settings: { wizdeckFactories: "" } }, 0],
  ] as const)("reports %s as unavailable, never zero", async (reason, options, later) => {
    const cli = await setup(options as Parameters<typeof setup>[0]);
    vi.setSystemTime(v4Now + later);
    expect(await cli.json(["specs"])).toEqual({
      exitCode: 1, body: { error: { code: "specs_unavailable", message: "Specs unavailable.", reason } },
    });
    expect(await cli.run(["specs"])).toEqual({ exitCode: 1, stdout: "", stderr: `Specs unavailable (${reason})\n` });
  });

  // catches: specs printed from a ready file when the thread rows could not be read.
  it("needs the thread rows too", async () => {
    const cli = await setup({ list: async () => { throw new Error("offline"); } });
    expect(await cli.json(["specs"])).toEqual({
      exitCode: 1, body: { error: { code: "state_unavailable", message: "Thread state is unavailable." } },
    });
  });

  // catches: a file read on every call instead of at most once per 60-second shared refresh.
  // #164 R3: each refresh reads both files once, so the newer one can win.
  it("reads the files at most once a minute", async () => {
    const cli = await setup();
    const paths = () => cli.read.mock.calls.map(([args]) => (args as { path: string }).path.replace("/synthetic/home/.openwiz/", ""));
    await cli.run(["specs"]);
    vi.setSystemTime(v4Now + 59_999);
    await cli.run(["specs"]);
    expect(paths().sort()).toEqual(["specs.v1.json", "specs.v2.json"]);
    vi.setSystemTime(v4Now + 60_000);
    await cli.run(["specs"]);
    expect(paths().sort()).toEqual(["specs.v1.json", "specs.v1.json", "specs.v2.json", "specs.v2.json"]);
  });

  // catches: a failed settings read crashing the command instead of failing closed.
  it("reads a failed binding read as unreadable, and a failed open-state read as all collapsed", async () => {
    const read = vi.fn(contentRead(v4SpecsFileText));
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: { files: { read }, threads: { list: vi.fn(async () => v4Threads.map(rawRow)), get: vi.fn() } } as never });
    hosts.push(host);
    const define = host.bb.settings.define.bind(host.bb.settings);
    let failing: "wizdeckFactories" | "specsOpen" = "wizdeckFactories";
    vi.spyOn(host.bb.settings, "define").mockImplementation(((descriptors: Record<string, unknown>) => {
      const handle = define(descriptors as never);
      const get = handle.get.bind(handle);
      handle.get = async () => { if (failing in descriptors) throw new Error("settings offline"); return get(); };
      return handle;
    }) as BbPluginApi["settings"]["define"]);
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: JSON.stringify([factory]), specsOpen: v4OpenSetting });
    const specs = async () => {
      const result = await host.harness.behavior.runCli(["specs", "--json"]);
      return { exitCode: result.exitCode, body: JSON.parse(result.stdout!) };
    };
    expect(await specs()).toEqual({ exitCode: 1, body: { error: { code: "specs_unavailable", message: "Specs unavailable.", reason: "unreadable" } } });
    failing = "specsOpen";
    vi.setSystemTime(v4Now + 60_000);
    const result = await specs();
    expect(result.exitCode).toBe(0);
    expect(result.body.specs.map((s: { open: boolean }) => s.open)).toEqual([false, false, false]);
  });

  // catches: extra arguments or a repeated --json accepted silently.
  it.each([["specs", "extra"], ["specs", "--json", "--json"], ["specs", "--bogus"], ["specs", "--sort"], ["specs", "--sort", "name"],
    ["specs", "--sort", "Recent"], ["specs", "--sort", "recent", "--sort", "recent"]])("treats %j as a usage error", async (...argv) => {
    const cli = await setup();
    expect((await cli.run(argv)).exitCode).toBe(2);
  });
});

describe("wizbar spec <n> --open|--close (sections 4 and 8)", () => {
  // catches: an open state that is not written to plugin settings, so a reload forgets it.
  it("opens and closes a spec, and the state survives a reload", async () => {
    const cli = await setup();
    expect(await cli.json(["spec", "77", "--open"])).toEqual({ exitCode: 0, body: { spec: "example/sample-tools#77", open: false } });
    const reloaded = await cli.host.harness.lifecycle.reload(plugin);
    hosts.push(reloaded);
    const after = await reloaded.harness.behavior.runCli(["specs", "--json"]);
    expect(JSON.parse(after.stdout!).specs.map((s: { spec: string; open: boolean }) => [s.spec, s.open])).toEqual([
      ["example/sample-plans#501", true], ["example/sample-tools#77", true], ["example/sample-plans#601", false],
    ]);
    const closed = await reloaded.harness.behavior.runCli(["spec", "example/sample-plans#501", "--close"]);
    expect(closed).toMatchObject({ exitCode: 0, stdout: "example/sample-plans#501: closed\n" });
    const settings = await reloaded.harness.behavior.runCli(["specs", "--json"]);
    expect(JSON.parse(settings.stdout!).specs.map((s: { open: boolean }) => s.open)).toEqual([false, true, false]);
  });

  // catches: a hidden, unknown or ambiguous reference opened anyway.
  it.each([
    [["spec", "9", "--open"], "unknown_spec"],
    [["spec", "example/sample-plans#601", "--open"], "unknown_spec"],
    [["spec", "example/sample-plans#77", "--close"], "unknown_spec"],
    [["spec", "palette", "--open"], "unknown_spec"],
  ])("%j fails with %s", async (argv, code) => {
    const cli = await setup();
    const result = await cli.json(argv);
    expect(result.exitCode).toBe(1);
    expect(result.body.error.code).toBe(code);
  });

  // catches: a bare number that matches specs in two repositories picked by file order.
  it("refuses a bare number that matches visible specs in two repositories", async () => {
    const file = structuredClone(v4SpecsFile);
    file.specs[1] = { ...file.specs[1]!, spec: "example/sample-tools#501", url: "https://github.com/example/sample-tools/issues/501" };
    const cli = await setup({ text: JSON.stringify(file) });
    expect((await cli.json(["spec", "501", "--open"])).body.error.code).toBe("ambiguous_spec");
    // The copied cache spec has no agents, so it reports closed (section 4: effective open state).
    expect(await cli.json(["spec", "example/sample-tools#501", "--open"])).toEqual({ exitCode: 0, body: { spec: "example/sample-tools#501", open: false } });
  });

  // catches: a spec opened from an unavailable file.
  it("needs a ready specs file", async () => {
    const cli = await setup();
    vi.setSystemTime(v4Now + 26 * 60_000);
    expect(await cli.json(["spec", "501", "--close"])).toEqual({
      exitCode: 1, body: { error: { code: "specs_unavailable", message: "Specs unavailable.", reason: "stale" } },
    });
  });

  // catches: a refused settings write reported as success.
  it("reports a refused settings write as settings_failed", async () => {
    const read = vi.fn(contentRead(v4SpecsFileText));
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: { files: { read }, threads: { list: vi.fn(async () => v4Threads.map(rawRow)), get: vi.fn() } } as never });
    hosts.push(host);
    const define = host.bb.settings.define.bind(host.bb.settings);
    vi.spyOn(host.bb.settings, "define").mockImplementation(((descriptors: never) => {
      const handle = define(descriptors);
      handle.experimental_set = async () => { throw new Error("refused"); };
      return handle;
    }) as BbPluginApi["settings"]["define"]);
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: JSON.stringify([factory]) });
    const result = await host.harness.behavior.runCli(["spec", "501", "--open", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout!).error.code).toBe("settings_failed");
  });

  // catches: both or neither of --open and --close, or several references, accepted.
  it.each([
    ["spec"], ["spec", "501"], ["spec", "--open"], ["spec", "501", "--open", "--close"], ["spec", "501", "77", "--open"],
    ["spec", "501", "--open", "--open"], ["spec", "501", "--open", "--json", "--json"], ["spec", "501", "--wide"],
  ])("treats %j as a usage error", async (...argv) => {
    const cli = await setup();
    expect((await cli.run(argv)).exitCode).toBe(2);
  });

  // catches: `wizbar spec 77 --open` reporting open for a spec with no agents, which the sidebar shows closed (#1539).
  it.each(v4SpecOpenCases)("$argv exits $exitCode with the effective open state", async ({ argv, exitCode, result, text, stored }) => {
    const cli = await setup();
    expect(await cli.json([...argv])).toEqual({ exitCode, body: result });
    expect(readOpenKeys(await cli.stored())).toEqual(stored);
    const row = (await cli.json(["specs"])).body.specs.find((r: { spec: string }) => r.spec === result.spec);
    expect(result.open).toBe(effectiveOpen(row));
    expect(await (await setup()).run([...argv])).toEqual({ exitCode, stdout: text, stderr: "" });
  });

  // catches: a failed settings read taken as an empty list, so the write erases every other saved spec (#1560).
  it("fails with settings_failed and writes nothing when the settings read fails", async () => {
    const cli = await setup();
    cli.open.beforeGet = async () => { throw new Error("settings offline"); };
    expect(await cli.json(["spec", "77", "--open"])).toEqual({
      exitCode: 1, body: { error: { code: "settings_failed", message: "The settings read failed." } },
    });
    expect(await cli.stored()).toBe(v4OpenSetting);
    // Display still fails closed: every spec collapsed.
    const specs = await cli.json(["specs"]);
    expect(specs.exitCode).toBe(0);
    expect(specs.body.specs.map((r: { open: boolean }) => r.open)).toEqual([false, false, false]);
  });

  // catches: a spec written and reported when its agents, and so what the sidebar shows, could not be read.
  it("needs the thread rows and writes nothing without them", async () => {
    const cli = await setup({ list: async () => { throw new Error("offline"); } });
    expect(await cli.json(["spec", "77", "--open"])).toEqual({
      exitCode: 1, body: { error: { code: "state_unavailable", message: "Thread state is unavailable." } },
    });
    expect(await cli.stored()).toBe(v4OpenSetting);
  });

  // catches: two overlapping commands reading the same snapshot, so the later write drops the earlier change (#1561).
  it("keeps both changes when two commands overlap", async () => {
    const cli = await setup({ settings: { specsOpen: "[]" } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let reads = 0;
    cli.open.beforeGet = () => { reads += 1; return gate; };
    const both = Promise.all([cli.json(["spec", "501", "--open"]), cli.json(["spec", "77", "--open"])]);
    // One command holds a settings read; after one task turn the other's read has started unless it waits its turn.
    await vi.waitFor(() => expect(reads).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    const results = await both;
    expect(readOpenKeys(await cli.stored()).sort()).toEqual(["example/sample-plans#501", "example/sample-tools#77"]);
    expect(results).toEqual([
      { exitCode: 0, body: { spec: "example/sample-plans#501", open: true } },
      { exitCode: 0, body: { spec: "example/sample-tools#77", open: false } },
    ]);
  });
});

// S1 (#184): the Specs section's order (specs-section.v1.md sections 10 and 11), on the 0.6 fixture.
/** The fixture's running agents as sidebar rows: running, top level, titled with their ticket's code. */
const v6Threads: PluginSidebarThread[] = Object.values(v6Agents).flat().map((agent) => {
  const role = agent.matrix === "reviewing" ? "Reviewer" : "Builder";
  const title = `${role} · SS${agent.ticket!.slice(agent.ticket!.lastIndexOf("#") + 1)}: Sample work`;
  return { ...v4Threads[2]!, id: agent.threadId, title, displayTitle: title, parentThreadId: null, createdAt: agent.updatedAt - 60_000, updatedAt: agent.updatedAt };
});
// S2 (#185): quiet specs, the finished one included, are listed after the others, each part in the sort's order.
const quietKeys = new Set(v6Activity.filter((c) => c.quiet).map((c) => c.spec));
const listed = (sort: (typeof specsSortsV6)[number]) =>
  [...v6SortOrders[sort].filter((key) => !quietKeys.has(key)), ...v6SortOrders[sort].filter((key) => quietKeys.has(key))];

describe("S1: the four sorts (section 11)", () => {
  // catches: an activity time that skips a ticket's update, a close or a running agent, or invents one when none is known.
  it("gives each spec its activity time: the newest ticket update, close or running agent, else null", () => {
    for (const expected of v6Activity) {
      const entry = v6SpecsFile.specs.find((spec) => spec.spec === expected.spec)!;
      expect([expected.spec, activityAt(entry, v6Agents[expected.spec] ?? [])]).toEqual([expected.spec, expected.activityAt]);
    }
  });

  // catches: a sort that compares shares as floats, puts a null time first, breaks ties by anything but file order, or leaves finished specs in place.
  it.each(specsSortsV6)("orders the fixture's specs by %s", (sort) => {
    // The fixture's activity cases are in file order, as the rows are.
    expect(sortSpecs(v6Activity, sort).map((row) => row.spec)).toEqual(v6SortOrders[sort]);
  });

  // catches: the CLI ignoring --sort, or giving another order than the section for the same input.
  it.each(specsSortsV6)("wizbar specs --sort %s --json gives the same order, in JSON and text", async (sort) => {
    vi.setSystemTime(v6Now);
    const cli = await setup({ text: v6SpecsFileText, list: async () => v6Threads.map(rawRow), settings: { specsOpen: "[]" } });
    const { exitCode, body } = await cli.json(["specs", "--sort", sort]);
    expect(exitCode).toBe(0);
    expect(body.specs.map((row: { spec: string }) => row.spec)).toEqual(listed(sort));
    const text = (await cli.run(["specs", "--sort", sort])).stdout.split("\n").slice(1, -1).map((line) => line.split(" ")[0]);
    expect(text).toEqual(body.specs.map((row: { spec: string }) => row.spec));
  });

  // catches: the CLI ignoring the saved sort, or --sort not overriding it.
  it("uses the saved specsSort without --sort, and --sort over it", async () => {
    vi.setSystemTime(v6Now);
    const cli = await setup({ text: v6SpecsFileText, list: async () => v6Threads.map(rawRow), settings: { specsOpen: "[]", specsSort: "closest" } });
    const keys = async (argv: string[]) => (await cli.json(argv)).body.specs.map((row: { spec: string }) => row.spec);
    expect(await keys(["specs"])).toEqual(listed("closest"));
    expect(await keys(["specs", "--sort", "recent"])).toEqual(listed("recent"));
  });

  // catches: the CLI's default order still the file's order.
  it("uses needs-you without --sort", async () => {
    vi.setSystemTime(v6Now);
    const cli = await setup({ text: v6SpecsFileText, list: async () => v6Threads.map(rawRow), settings: { specsOpen: "[]" } });
    const { body } = await cli.json(["specs"]);
    expect(body.specs.map((row: { spec: string }) => row.spec)).toEqual(listed("needs-you"));
  });
});

// S2 (#185): the Quiet group (specs-section.v1.md section 12), on the 0.6 fixture.
describe("S2: finished and idle specs fold into Quiet", () => {
  const quiet = new Set(v6Activity.filter((c) => c.quiet).map((c) => c.spec));
  const rows = (file = v6SpecsFile, sort: (typeof specsSortsV6)[number] = "needs-you") =>
    specRows(file, v6Threads, [], v6Now, null, sort);

  // catches: a quiet rule off at an edge (exactly 3 days, no time, an agent rescuing idle tickets), finished specs still hidden,
  // or a needs-you spec folded away.
  it("marks each visible spec quiet, with its activity time, exactly as the fixture says", () => {
    const result = rows();
    const marks = result.specs.map((row) => ({ spec: row.spec, activityAt: row.activityAt, quiet: row.quiet }));
    expect(marks.sort((a, b) => (a.spec < b.spec ? -1 : 1))).toEqual(
      v6Activity.map((c) => ({ spec: c.spec, activityAt: c.activityAt, quiet: c.quiet })).sort((a, b) => (a.spec < b.spec ? -1 : 1)));
  });

  // catches: the split re-sorting either list, quiet rows mixed into the main list, or the rule counting quiet specs.
  it("lists the main rows, then the quiet ones, each in the sort's order, and counts only the main list in the rule", () => {
    const result = rows();
    expect(result.specs.map((row) => row.spec)).toEqual([...v6QuietSplit.main, ...v6QuietSplit.quiet]);
    expect(sectionRule(result)).toBe(v6QuietSplit.rule);
    for (const sort of specsSortsV6) {
      const keys = rows(v6SpecsFile, sort).specs.map((row) => row.spec);
      expect(keys).toEqual([...v6SortOrders[sort].filter((key) => !quiet.has(key)), ...v6SortOrders[sort].filter((key) => quiet.has(key))]);
    }
  });

  // catches: needs you folded into Quiet when the spec is finished-looking or long idle (the acceptance's "never quiet").
  it("never folds a spec with a ticket due now, however long idle", () => {
    const file = structuredClone(v6SpecsFile);
    // charlie, idle 4 days, gets a ticket due now; alpha is already idle 5 days with one.
    file.specs.find((spec) => spec.spec === "example/sample-sort#721")!.tickets[1]!.state = "needs-you";
    const result = rows(file);
    expect(result.specs.filter((row) => row.needsYou > 0).map((row) => [row.spec, row.quiet])).toEqual([
      // Newest activity first: echo 30 minutes, charlie 4 days, alpha 5 days.
      ["example/sample-sort#741", false], ["example/sample-sort#721", false], ["example/sample-sort#701", false],
    ]);
    expect(result.specs.filter((row) => row.quiet).map((row) => row.spec)).toEqual(["example/sample-sort#731"]);
  });

  // catches: a spec just past 3 days left in the main list, or one at exactly 3 days folded.
  it("folds just past 3 days idle, not at exactly 3 days", () => {
    const golf = (at: number) => {
      const file = structuredClone(v6SpecsFile);
      for (const ticket of file.specs.find((spec) => spec.spec === "example/sample-sort#761")!.tickets) {
        ticket.updatedAt = new Date(at).toISOString();
        if (ticket.closedAt !== null) ticket.closedAt = new Date(at).toISOString();
      }
      return rows(file).specs.find((row) => row.spec === "example/sample-sort#761")!.quiet;
    };
    expect(golf(v6Now - quietAfterMsV6)).toBe(false);
    expect(golf(v6Now - quietAfterMsV6 - 1)).toBe(true);
  });

  // catches: the JSON missing the sort, the quiet mark or the activity time, or the text not marking a quiet row.
  it("wizbar specs marks quiet rows last, in JSON and text, and names the sort", async () => {
    vi.setSystemTime(v6Now);
    const cli = await setup({ text: v6SpecsFileText, list: async () => v6Threads.map(rawRow), settings: { specsOpen: "[]" } });
    const { exitCode, body } = await cli.json(["specs"]);
    expect(exitCode).toBe(0);
    expect(body.sort).toBe("needs-you");
    expect(body.specs.map((row: { spec: string; quiet: boolean }) => [row.spec, row.quiet])).toEqual([
      ...v6QuietSplit.main.map((key) => [key, false]), ...v6QuietSplit.quiet.map((key) => [key, true]),
    ]);
    expect(body.specs.find((row: { spec: string }) => row.spec === "example/sample-sort#751").activityAt).toBeNull();
    expect((await cli.json(["specs", "--sort", "recent"])).body.sort).toBe("recent");
    const text = (await cli.run(["specs"])).stdout.split("\n");
    expect(text[0]).toBe(v6QuietSplit.rule);
    expect(text.slice(1, -1).filter((line) => line.endsWith(" · quiet")).map((line) => line.split(" ")[0])).toEqual([...v6QuietSplit.quiet]);
    expect(text).toContain("example/sample-sort#731 Sample delta: 2/2 · quiet");
  });
});
