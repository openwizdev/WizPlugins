// WB4-2 (openwizdev/OpenWiz#1436), S3: the model and effort source behind
// `cardModels` and `wizbar children` (specs-section.v1.md section 6).
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { v4Threads } from "./fixtures/v4";
import { cardModelsFrom, readChildren } from "./server";
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
    expect(await cardModelsFrom(read, ["thr_v4_builder_a"])).toEqual(
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
