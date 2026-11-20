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
import { effectiveOpen, readOpenKeys } from "./open-state";
import { rawRow } from "./testing";

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
    const cli = await setup();
    expect(await cli.json(["specs"])).toEqual({ exitCode: 0, body: v4SpecRows });
    expect(cli.read).toHaveBeenCalledWith(expect.objectContaining({
      hostId: "hst_v4_home", rootPath: "/synthetic/home", path: "/synthetic/home/.openwiz/specs.v1.json",
    }));
  });

  // catches: text that shows zero parts, or omits the running count of a spec with agents.
  it("prints the section as text", async () => {
    const cli = await setup();
    expect(await cli.run(["specs"])).toEqual({ exitCode: 0, stderr: "", stdout: [
      "Specs 2 · 2 need you",
      "example/sample-plans#501 Sample palette: 4/10 · 1 done in the last hour · 1 needs you · 4 running",
      "example/sample-tools#77 Sample cache: 0/3 · 1 needs you",
      "",
    ].join("\n") });
  });

  // catches (#162): a v2 file refused, or its later tickets missing from the JSON, folded into needs you, or left out of the text.
  it("prints later tickets apart from needs you, in JSON and text", async () => {
    const cli = await setup({ text: v4SpecsFileV2Text });
    expect(await cli.json(["specs"])).toEqual({ exitCode: 0, body: v4SpecRowsV2 });
    expect(await cli.run(["specs"])).toEqual({ exitCode: 0, stderr: "", stdout: [
      "Specs 2 · 2 need you",
      "example/sample-plans#501 Sample palette: 4/11 · 1 done in the last hour · 1 needs you · 1 later · 4 running",
      "example/sample-tools#77 Sample cache: 0/3 · 1 needs you",
      "",
    ].join("\n") });
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
  it("reads the file at most once a minute", async () => {
    const cli = await setup();
    await cli.run(["specs"]);
    vi.setSystemTime(v4Now + 59_999);
    await cli.run(["specs"]);
    expect(cli.read).toHaveBeenCalledTimes(1);
    vi.setSystemTime(v4Now + 60_000);
    await cli.run(["specs"]);
    expect(cli.read).toHaveBeenCalledTimes(2);
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
    expect(result.body.specs.map((s: { open: boolean }) => s.open)).toEqual([false, false]);
  });

  // catches: extra arguments or a repeated --json accepted silently.
  it.each([["specs", "extra"], ["specs", "--json", "--json"], ["specs", "--bogus"]])("treats %j as a usage error", async (...argv) => {
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
      ["example/sample-plans#501", true], ["example/sample-tools#77", true],
    ]);
    const closed = await reloaded.harness.behavior.runCli(["spec", "example/sample-plans#501", "--close"]);
    expect(closed).toMatchObject({ exitCode: 0, stdout: "example/sample-plans#501: closed\n" });
    const settings = await reloaded.harness.behavior.runCli(["specs", "--json"]);
    expect(JSON.parse(settings.stdout!).specs.map((s: { open: boolean }) => s.open)).toEqual([false, true]);
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
    expect(specs.body.specs.map((r: { open: boolean }) => r.open)).toEqual([false, false]);
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
