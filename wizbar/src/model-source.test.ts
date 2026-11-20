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

  // catches: options from a thread start or a requested turn taken as what runs, or one failed read hiding the rest.
  it("uses only the latest turn start once adopted; anything else is omitted", async () => {
    const ids = ["thr_v4_builder_a", "thr_v4_reviewer_a", "thr_v4_parent_wins", "thr_v4_code_a", "thr_v4_ambiguous"];
    expect(await cardModelsFrom(read, ids, true)).toEqual({ source: "host", items: [
      { threadId: "thr_v4_builder_a", model: "Sample model 2", effort: "xhigh" },
      ...ids.slice(1).map((threadId) => ({ threadId, model: null, effort: null })),
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
    expect(children.filter((c) => c.model !== null)).toHaveLength(1);
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
