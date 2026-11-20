// S1 (#169): the `sectionsCollapsed` setting (sidebar-v3.v1.md section 9). Every
// value is a known literal from the contract, never computed the way the code does.
import { describe, expect, it } from "vitest";
import { v6CollapseWrites, v6CollapsedCases, v6OrderCases, v6OrderMoves } from "./fixtures/v6";
import {
  readCollapsedKeys, readCollapsedSections, readSectionsOrder, sidebarSections, withCollapsed, withSectionCollapsed, withSectionMoved,
} from "./sections";

describe("S1: sectionsCollapsed reads fail open and writes touch one key", () => {
  // catches: a malformed stored value collapsing sections the owner never closed, or crashing the sidebar.
  it.each([
    [undefined, []], ["", []], ["not json", []], ["{}", []], ["[1]", []], ["[\"inbox\", 2]", []],
    ["[]", []], ["[\"pinned\",\"specs\"]", ["pinned", "specs"]], ["[\"inbox\",\"later-section\"]", ["inbox", "later-section"]],
  ] as const)("reads %j as %j", (raw, expected) => {
    expect(readCollapsedKeys(raw)).toEqual(expected);
  });

  // catches: a collapse that drops another section's saved state, adds a key twice, or a stale key that blocks an expand.
  it.each([
    ["[]", "pinned", true, "[\"pinned\"]"],
    ["[\"pinned\"]", "pinned", true, "[\"pinned\"]"],
    ["[\"pinned\",\"specs\"]", "inbox", true, "[\"pinned\",\"specs\",\"inbox\"]"],
    ["[\"pinned\",\"specs\"]", "pinned", false, "[\"specs\"]"],
    ["[\"later-section\",\"inbox\"]", "inbox", false, "[\"later-section\"]"],
    ["garbage", "specs", true, "[\"specs\"]"],
    [undefined, "inbox", false, "[]"],
  ] as const)("from %j, sets %s collapsed=%s to %j", (raw, key, collapsed, expected) => {
    expect(withCollapsed(raw, key, collapsed)).toBe(expected);
  });
});

describe("S1: wizbar section errors", () => {
  // catches: a malformed command that writes anyway, or an error the agent cannot read as JSON.
  it.each([
    [["section", "--collapse", "--json"]], [["section", "inbox", "--json"]], [["section", "inbox", "--collapse", "--expand", "--json"]],
    [["section", "settled", "--collapse", "--json"]], [["section", "inbox", "pinned", "--collapse", "--json"]],
    [["section", "inbox", "--collapse", "--collapse", "--json"]], [["section", "inbox", "--fold", "--json"]],
  ])("refuses %j as a usage error without writing", async (argv) => {
    const { createFakePluginHost } = await import("@get-bb/plugin-sdk/testing");
    const { default: plugin } = await import("./server");
    const host = createFakePluginHost({ pluginId: "wizbar" });
    plugin(host.bb);
    await host.harness.behavior.setSettings({ sectionsCollapsed: "[\"pinned\"]" });
    const result = await host.harness.behavior.runCli(argv);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout!).error.code).toBe("usage");
    expect(JSON.parse((await host.harness.behavior.runCli(["section", "pinned", "--collapse", "--json"])).stdout!))
      .toEqual({ section: "pinned", collapsed: true });
    await host.harness.lifecycle.dispose();
  });

  // catches: a failed settings read followed by a write that erases the other saved sections.
  it("fails with settings_failed and writes nothing when the read fails", async () => {
    const { withSectionCommand } = await import("./sections");
    const writes: string[] = [];
    const cli = withSectionCommand({ name: "wizbar", summary: "synthetic", commands: [], run: async () => ({ exitCode: 9 }) }, {
      get: async () => { throw new Error("offline"); },
      experimental_set: async (values) => { writes.push(values.sectionsCollapsed ?? ""); return values; },
    });
    const result = await cli.run(["section", "inbox", "--collapse", "--json"], {} as never);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout!)).toEqual({ error: { code: "settings_failed", message: "The settings read failed." } });
    expect(writes).toEqual([]);
    expect((await cli.run(["other"], {} as never)).exitCode).toBe(9);
  });
});

// C0 (#182): the 0.6 section keys (sidebar-v3.v1.md section 10). Every value is a
// hand-worked fixture from src/fixtures/v6.ts, never computed the way the code does.
describe("C0: 0.6 section keys, a stored inbox reads as unread", () => {
  it("names the three 0.6 sections in their default order", () => {
    expect(sidebarSections).toEqual(["pinned", "specs", "unread"]);
  });

  // catches: an owner's 0.5 Inbox collapse lost on upgrade (Unread opens again), or listed twice.
  it.each(v6CollapsedCases.map((c) => [c.raw, c.keys] as const))("reads collapsed %j as %j", (raw, keys) => {
    expect(readCollapsedSections(raw)).toEqual(keys);
  });

  // catches: a write that keeps the old `inbox` beside `unread`, so expanding Unread leaves it collapsed after a reload.
  it.each(v6CollapseWrites.map((c) => [c.raw, c.key, c.collapsed, c.stored] as const))(
    "from %j, sets %s collapsed=%s to %j", (raw, key, collapsed, stored) => {
      expect(withSectionCollapsed(raw, key, collapsed)).toBe(stored);
    });

  // catches: a malformed or partial `sectionsOrder` that drops a section from the sidebar.
  it.each(v6OrderCases.map((c) => [c.raw, c.order] as const))("reads order %j as %j", (raw, order) => {
    expect(readSectionsOrder(raw)).toEqual(order);
  });

  // catches: a move that loses or duplicates a section, or an Alt+Up at the top that wraps round.
  it.each(v6OrderMoves.map((c) => [c.raw, c.key, c.to, c.stored] as const))("from %j, moves %s to %i: %j", (raw, key, to, stored) => {
    expect(withSectionMoved(raw, key, to)).toBe(stored);
  });
});
