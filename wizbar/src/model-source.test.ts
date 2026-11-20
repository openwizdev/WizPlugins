// WB4-2 (openwizdev/OpenWiz#1436), S3: the model and effort source behind
// `cardModels` and `wizbar children` (specs-section.v1.md section 6).
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelSourceV4, v4Now, v4SpecsFileText, v4Threads } from "./fixtures/v4";
import plugin, { cardModelsFrom, readChildren } from "./server";
import { rawRow } from "./specs/testing";

const resolved = (source: string, model = "Sample model 2", reasoningLevel = "xhigh") =>
  ({ model, reasoningLevel, source, permissionMode: "auto", providerId: "harness-a", serviceTier: "default" });
const options: Record<string, unknown> = {
  thr_v4_builder_a: resolved("client/turn/start"),
  thr_v4_reviewer_a: resolved("client/thread/start"),
  thr_v4_parent_wins: resolved("client/turn/requested"),
  thr_v4_code_a: null,
};
const read = vi.fn(async ({ threadId }: { threadId: string }) => {
  if (threadId === "thr_v4_ambiguous") throw new Error("synthetic host failure");
  return options[threadId] ?? null;
});

describe("S3: model and effort behind the adoption gate (section 6)", () => {
  // catches: a host read, or a guessed value, before WB4-4 adopts the source.
  it("serves source none and every value null while the gate is closed, with no host read", async () => {
    read.mockClear();
    expect(await cardModelsFrom(read, ["thr_v4_builder_a"], false)).toEqual(
      { source: "none", items: [{ threadId: "thr_v4_builder_a", model: null, effort: null }] });
    expect(read).not.toHaveBeenCalled();
  });

  // catches: options from a thread start or a requested turn dropped (#156: every fleet thread starts with an explicit model).
  it("uses the resolved options whatever their source; null, failed or malformed answers are omitted", async () => {
    const ids = ["thr_v4_builder_a", "thr_v4_reviewer_a", "thr_v4_parent_wins", "thr_v4_code_a", "thr_v4_ambiguous"];
    expect(await cardModelsFrom(read, ids, true)).toEqual({ source: "host", items: [
      ...ids.slice(0, 3).map((threadId) => ({ threadId, model: "Sample model 2", effort: "xhigh" })),
      ...ids.slice(3).map((threadId) => ({ threadId, model: null, effort: null })),
    ] });
  });

  // catches: a host read that throws before returning a promise failing every card, `stats` and `children` (#111: the gate is open).
  it("nulls only the thread whose read throws synchronously", async () => {
    const throwing = (({ threadId }: { threadId: string }) => {
      if (threadId === "thr_v4_ambiguous") throw new Error("synthetic host failure");
      return Promise.resolve(options[threadId] ?? null);
    }) as (args: { threadId: string }) => Promise<unknown>;
    expect(await cardModelsFrom(throwing, ["thr_v4_ambiguous", "thr_v4_builder_a"], true)).toEqual({ source: "host", items: [
      { threadId: "thr_v4_ambiguous", model: null, effort: null },
      { threadId: "thr_v4_builder_a", model: "Sample model 2", effort: "xhigh" },
    ] });
  });

  // catches: `wizbar children --json` dropping a served model, or reading every listed thread's options.
  it("carries model and effort in wizbar children when present", async () => {
    const rows = v4Threads.map(rawRow);
    read.mockClear();
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: { threads: {
      get: vi.fn(async ({ threadId }: { threadId: string }) => rows.find((r) => r.id === threadId)),
      list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => rows.slice(offset, offset + 100)),
      defaultExecutionOptions: read,
    } } });
    const result = await readChildren(host.bb, "thr_v4_fleet_a", undefined, true);
    const children = result.children.map(({ id, model, effort }) => ({ id, model, effort }));
    expect(children).toContainEqual({ id: "thr_v4_builder_a", model: "Sample model 2", effort: "xhigh" });
    expect(children.filter((c) => c.model !== null).map((c) => c.id).sort()).toEqual(
      ["thr_v4_builder_a", "thr_v4_parent_wins", "thr_v4_reviewer_a"].filter((id) => children.some((c) => c.id === id)));
    expect(read.mock.calls.map(([args]) => args.threadId).sort()).toEqual(children.map((c) => c.id).sort());
  });
});

// WizBar 0.5.0 B (#111): the gate is open; the owner's look at the 0.5.0
// candidate is the live check (section 6). Host ids stay raw in every RPC and
// JSON body; JSON adds the friendly `modelLabel` only when the model is known.
describe("#111: the open gate and friendly labels in wizbar JSON", () => {
  const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
    home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);
  const hosts: FakePluginHost[] = [];
  afterEach(async () => { vi.useRealTimers(); for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose(); });

  async function setup() {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    const rows = v4Threads.map(rawRow);
    const sha = createHash("sha256").update(v4SpecsFileText).digest("hex");
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha, sizeBytes: 1 })) },
      threads: {
        get: vi.fn(async ({ threadId }: { threadId: string }) => rows.find((r) => r.id === threadId)),
        list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => rows.slice(offset, offset + 100)),
        defaultExecutionOptions: vi.fn(async ({ threadId }: { threadId: string }) =>
          threadId === "thr_v4_builder_a" ? resolved("client/turn/start", "claude-opus-5-5", "high") : null),
      },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: binding });
    const json = async (argv: string[]) => {
      const result = await host.harness.behavior.runCli([...argv, "--json"]);
      expect(result.exitCode).toBe(0);
      return JSON.parse(result.stdout!);
    };
    return { host, json };
  }

  // catches: the gate left closed, so every card, row and hover card stays empty of model and effort.
  it("is open, and cardModels serves the host's resolved options, null where the host has none", async () => {
    expect(modelSourceV4.adopted).toBe(true);
    const { host } = await setup();
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a", "thr_v4_code_a"] })).toEqual({
      source: "host", items: [
        { threadId: "thr_v4_builder_a", model: "claude-opus-5-5", effort: "high" },
        { threadId: "thr_v4_code_a", model: null, effort: null },
      ] });
  });

  // catches: JSON losing the raw ids, showing them unfriendly, or inventing a label for an unknown model.
  it("keeps the raw ids and adds modelLabel in children, stats and specs JSON", async () => {
    const { json } = await setup();
    const named = { model: "claude-opus-5-5", effort: "high", modelLabel: "Opus 5.5 · High" };
    const pick = (item: Record<string, unknown>) =>
      ({ model: item.model, effort: item.effort, ...("modelLabel" in item ? { modelLabel: item.modelLabel } : {}) });
    const children = (await json(["children", "thr_v4_fleet_a"])).children as { id: string }[];
    const stats = (await json(["stats"])).threads as { id: string }[];
    const agents = ((await json(["specs"])).specs as { agents: { threadId: string }[] }[]).flatMap((spec) => spec.agents);
    for (const [where, items] of [["children", children.map((c) => [c.id, c])], ["stats", stats.map((t) => [t.id, t])],
      ["specs", agents.map((a) => [a.threadId, a])]] as const) {
      const byId = new Map(items as [string, Record<string, unknown>][]);
      expect(pick(byId.get("thr_v4_builder_a")!), where).toEqual(named);
      for (const [id, item] of byId) if (id !== "thr_v4_builder_a") expect(pick(item), `${where} ${id}`).toEqual({ model: null, effort: null });
    }
  });
});

// #156: on the owner's real host the per-thread read answers with exactly
// `{ model, reasoningLevel }` (no `source`), and the list rows carry no model.
// The values below are the live answer's shape with public model ids.
describe("#156: a host answering like the real host", () => {
  const live: Record<string, unknown> = {
    thr_v4_builder_a: { model: "gpt-6.2-sol", reasoningLevel: "medium" },
    thr_v4_reviewer_a: { model: "claude-opus-5-5", reasoningLevel: "high" },
  };
  const hosts: FakePluginHost[] = [];
  afterEach(async () => { vi.useRealTimers(); for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose(); });
  const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
    home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);

  async function setup(options: (threadId: string) => unknown, context: (threadId: string) => unknown = () => ({ usage: null })) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(v4Now);
    const rows = v4Threads.map(rawRow);
    for (const row of rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["model"]));
    const sha = createHash("sha256").update(v4SpecsFileText).digest("hex");
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha, sizeBytes: 1 })) },
      threads: {
        get: vi.fn(async ({ threadId }: { threadId: string }) => rows.find((r) => r.id === threadId)),
        list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => rows.slice(offset, offset + 100)),
        defaultExecutionOptions: vi.fn(async ({ threadId }: { threadId: string }) => options(threadId)),
        context: vi.fn(async ({ threadId }: { threadId: string }) => context(threadId)),
      },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: binding });
    const cli = (argv: string[]) => host.harness.behavior.runCli(argv);
    const json = async (argv: string[]) => {
      const result = await cli([...argv, "--json"]);
      expect(result.exitCode, result.stdout ?? result.stderr).toBe(0);
      return JSON.parse(result.stdout!);
    };
    return { host, cli, json };
  }
  /** Each labelled thread in the cards' RPC, the agent rows (specs), the running card (stats) and children. */
  async function labels(json: (argv: string[]) => Promise<any>) {
    const label = (items: { model?: unknown; modelLabel?: unknown }[], id: (i: any) => string) =>
      Object.fromEntries(items.filter((i) => i.modelLabel !== undefined).map((i) => [id(i), i.modelLabel]));
    return {
      agents: label((await json(["specs"])).specs.flatMap((s: { agents: unknown[] }) => s.agents), (a) => a.threadId),
      running: label((await json(["stats"])).threads, (t) => t.id),
      children: label((await json(["children", "thr_v4_fleet_a"])).children, (c) => c.id),
    };
  }
  const expected = { thr_v4_builder_a: "Sol 6.2 · Medium", thr_v4_reviewer_a: "Opus 5.5 · High" };

  // catches: the live answer (no source) dropped, so every card, agent row and the running card stay blank.
  it("labels cards, agent rows, the running card and children from a source-less answer", async () => {
    const { host, json } = await setup((id) => live[id] ?? null);
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a", "thr_v4_reviewer_a", "thr_v4_code_a"] })).toEqual({
      source: "host", items: [
        { threadId: "thr_v4_builder_a", model: "gpt-6.2-sol", effort: "medium" },
        { threadId: "thr_v4_reviewer_a", model: "claude-opus-5-5", effort: "high" },
        { threadId: "thr_v4_code_a", model: null, effort: null },
      ] });
    const got = await labels(json);
    expect(got.agents).toEqual(expected);
    expect(got.running).toEqual(expect.objectContaining({ thr_v4_builder_a: expected.thr_v4_builder_a }));
    expect(got.children).toEqual(expected);
  });

  // catches: the real host's full answer (#160: `source: "client/turn/requested"` and extra fields) dropped or mislabelled.
  it("labels the live-shaped answer, with its source and extra fields, Sol 6.2 · Medium", async () => {
    const answer = { model: "gpt-6.2-sol", permissionMode: "full", reasoningLevel: "medium", serviceTier: "default", source: "client/turn/requested" };
    const { host, json } = await setup((id) => id === "thr_v4_builder_a" ? answer : null);
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a"] })).toEqual({
      source: "host", items: [{ threadId: "thr_v4_builder_a", model: "gpt-6.2-sol", effort: "medium" }] });
    const got = await labels(json);
    expect(got.agents).toEqual({ thr_v4_builder_a: "Sol 6.2 · Medium" });
    expect(got.children).toEqual({ thr_v4_builder_a: "Sol 6.2 · Medium" });
  });

  // catches: a guessed label from an empty model, an unknown level, a wrong type or a failed read.
  it.each([
    ["an empty model", { model: "", reasoningLevel: "high" }],
    ["an unknown level", { model: "claude-opus-5-5", reasoningLevel: "turbo" }],
    ["a missing level", { model: "claude-opus-5-5" }],
    ["a model that is not a string", { model: 5, reasoningLevel: "high" }],
    ["a string answer", "claude-opus-5-5"],
  ])("shows no label for %s", async (_name, answer) => {
    const { host } = await setup((id) => id === "thr_v4_builder_a" ? answer : null,
      () => ({ usage: { snapshot: { model: "should-not-be-read" } } }));
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a"] })).toEqual({
      source: "host", items: [{ threadId: "thr_v4_builder_a", model: null, effort: null }] });
  });

  // catches: a null answer left blank although the host's context knows the model, or an effort guessed for it.
  it("falls back to the context's snapshot model, effort omitted, only when the answer is null", async () => {
    const { host, json } = await setup((id) => id === "thr_v4_reviewer_a" ? live[id] : null, (id) => {
      if (id === "thr_v4_builder_a") return { usage: { estimated: false, modelContextWindow: 1, usedTokens: 1, snapshot: { model: "gpt-6.2-sol" } } };
      if (id === "thr_v4_code_a") throw new Error("synthetic host failure");
      return { usage: null };
    });
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a", "thr_v4_reviewer_a", "thr_v4_code_a", "thr_v4_ambiguous"] })).toEqual({
      source: "host", items: [
        { threadId: "thr_v4_builder_a", model: "gpt-6.2-sol", effort: null },
        { threadId: "thr_v4_reviewer_a", model: "claude-opus-5-5", effort: "high" },
        { threadId: "thr_v4_code_a", model: null, effort: null },
        { threadId: "thr_v4_ambiguous", model: null, effort: null },
      ] });
    expect((await labels(json)).agents).toEqual({ thr_v4_builder_a: "Sol 6.2", thr_v4_reviewer_a: "Opus 5.5 · High" });
  });

  // catches: an undefined answer (malformed, not the SDK's null) treated as null, so the context fallback guesses a model (#160).
  it("shows no label and reads no context when the answer is undefined", async () => {
    const context = vi.fn(async () => ({ usage: { snapshot: { model: "gpt-6.2-sol" } } }));
    const { host } = await setup(() => undefined, context);
    expect(await host.harness.behavior.callRpc("cardModels", { threadIds: ["thr_v4_builder_a"] })).toEqual({
      source: "host", items: [{ threadId: "thr_v4_builder_a", model: null, effort: null }] });
    expect(context).not.toHaveBeenCalled();
  });

  // catches: the owner's next live check needing more than one command, or the diagnostic hiding what the host said.
  it("wizbar models --raw prints each raw answer, or its error, beside what WizBar makes of it", async () => {
    const { json, cli } = await setup((id) => {
      if (id === "thr_v4_code_a") throw Object.assign(new Error("synthetic"), { status: 503 });
      return live[id] ?? null;
    }, () => ({ usage: null }));
    expect(await json(["models", "thr_v4_builder_a", "thr_v4_code_a", "thr_v4_ambiguous", "--raw"])).toEqual({ models: [
      { threadId: "thr_v4_builder_a", model: "gpt-6.2-sol", effort: "medium", modelLabel: "Sol 6.2 · Medium",
        raw: { defaultExecutionOptions: { model: "gpt-6.2-sol", reasoningLevel: "medium" }, contextModel: null } },
      { threadId: "thr_v4_code_a", model: null, effort: null,
        raw: { defaultExecutionOptions: { error: { status: 503 } }, contextModel: null } },
      { threadId: "thr_v4_ambiguous", model: null, effort: null,
        raw: { defaultExecutionOptions: null, contextModel: null } },
    ] });
    expect(await json(["models", "thr_v4_reviewer_a"])).toEqual({ models: [
      { threadId: "thr_v4_reviewer_a", model: "claude-opus-5-5", effort: "high", modelLabel: "Opus 5.5 · High" }] });
    const text = await cli(["models", "thr_v4_reviewer_a", "thr_v4_ambiguous"]);
    expect(text).toMatchObject({ exitCode: 0, stdout: '"thr_v4_reviewer_a": Opus 5.5 · High\n"thr_v4_ambiguous": none\n' });
    expect((await cli(["models", "--json"])).exitCode).toBe(2);
  });
});
