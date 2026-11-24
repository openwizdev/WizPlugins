// S1 (#169): the `sectionsCollapsed` setting (sidebar-v3.v1.md section 9). Every
// value is a known literal from the contract, never computed the way the code does.
import { describe, expect, it, vi } from "vitest";
import { v6CollapseWrites, v6CollapsedCases } from "./fixtures/v6";
import {
  readCollapsedKeys, readCollapsedSections, readSectionsOrder, sidebarSections, withSectionCollapsed, withSectionMoved,
} from "./sections";

describe("S1: sectionsCollapsed reads fail open and writes touch one key", () => {
  // catches: a malformed stored value collapsing sections the owner never closed, or crashing the sidebar.
  it.each([
    [undefined, []], ["", []], ["not json", []], ["{}", []], ["[1]", []], ["[\"inbox\", 2]", []],
    ["[]", []], ["[\"pinned\",\"specs\"]", ["pinned", "specs"]], ["[\"inbox\",\"later-section\"]", ["inbox", "later-section"]],
  ] as const)("reads %j as %j", (raw, expected) => {
    expect(readCollapsedKeys(raw)).toEqual(expected);
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
    const define = vi.spyOn(host.bb.settings, "define");
    plugin(host.bb);
    await host.harness.behavior.setSettings({ sectionsCollapsed: "[\"pinned\"]" });
    const handle = define.mock.results.find((_, i) => "sectionsCollapsed" in define.mock.calls[i]![0])!.value;
    const write = vi.spyOn(handle, "experimental_set");
    const result = await host.harness.behavior.runCli(argv);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout!).error.code).toBe("usage");
    expect(write).not.toHaveBeenCalled();
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

describe("Yours section preferences", () => {
  const toYours = (key: string) => key === "unread" ? "yours" as const : key;
  const storedYours = (stored: string) => stored.replaceAll('"unread"', '"yours"');

  it("names the sections in default order", () => {
    expect(sidebarSections).toEqual(["pinned", "cloud", "specs", "yours"]);
  });

  it.each(v6CollapsedCases.map((c) => [c.raw, c.keys] as const))("normalizes aliases in %j", (raw, keys) => {
    expect(readCollapsedSections(raw)).toEqual(keys.map(toYours));
  });

  it.each(v6CollapseWrites.map((c) => [c.raw, c.key, c.collapsed, c.stored] as const))(
    "writes canonical keys from %j when setting %s to %s", (raw, key, collapsed, stored) => {
      expect(withSectionCollapsed(raw, key === "unread" ? "yours" : key, collapsed)).toBe(storedYours(stored));
    });

  it.each([
    [undefined, ["pinned", "cloud", "specs", "yours"]],
    ["", ["pinned", "cloud", "specs", "yours"]],
    ["{}", ["pinned", "cloud", "specs", "yours"]],
    ['[1,"specs"]', ["pinned", "cloud", "specs", "yours"]],
    ["[]", ["pinned", "cloud", "specs", "yours"]],
    ['["unread","specs","pinned"]', ["yours", "specs", "pinned", "cloud"]],
    ['["specs"]', ["specs", "pinned", "cloud", "yours"]],
    ['["specs","specs","inbox","settled"]', ["specs", "yours", "pinned", "cloud"]],
  ] as const)("reads the order in %j", (raw, order) => {
    expect(readSectionsOrder(raw)).toEqual(order);
  });

  it.each([
    [undefined, "yours", 0, '["yours","pinned","cloud","specs"]'],
    ['["unread","pinned","specs"]', "yours", 1, '["pinned","yours","cloud","specs"]'],
    ['["pinned","specs","unread"]', "pinned", 2, '["cloud","specs","pinned","yours"]'],
    ['["pinned","specs","unread"]', "pinned", -1, '["pinned","cloud","specs","yours"]'],
    ['["pinned","specs","unread"]', "yours", 3, '["pinned","cloud","specs","yours"]'],
    ["garbage", "specs", 0, '["specs","pinned","cloud","yours"]'],
  ] as const)("moves %j section %s to %i", (raw, key, to, stored) => {
    expect(withSectionMoved(raw, key, to)).toBe(stored);
  });

  it("deduplicates both legacy keys and Yours", () => {
    const raw = '["unread","inbox","yours","specs"]';
    expect(readCollapsedSections(raw)).toEqual(["yours", "specs"]);
    expect(readSectionsOrder(raw)).toEqual(["yours", "specs", "pinned", "cloud"]);
    expect(withSectionCollapsed(raw, "yours", false)).toBe('["specs"]');
  });
});
