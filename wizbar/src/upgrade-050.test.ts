// Reload the complete 0.5.0 store and verify the section alias reaches Yours.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "./server";
import manifest from "../package.json";
import lock from "../package-lock.json";
import { v6Store050 } from "./fixtures/v6";
import { readSpecsSort } from "./settings";
import { readCollapsedSections, readSectionsOrder } from "./sections";

const hosts: FakePluginHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});

describe("V: a 0.5.0 store reloads into 0.7.0", () => {
  it("is version 0.7.0 in the manifest and its lockfile", () => {
    expect(manifest.version).toBe("0.7.0");
    expect(lock.version).toBe("0.7.0");
    expect(lock.packages[""].version).toBe("0.7.0");
  });

  it("keeps all eight 0.5.0 values and reads the inbox collapse as Yours", async () => {
    // The 0.5.0 store, written out by hand: every key, none at its default.
    expect(Object.keys(v6Store050).sort()).toEqual([
      "childrenChipEnabled", "footerCountEnabled", "machineIconsEnabled", "parentChipEnabled",
      "sectionsCollapsed", "specsOpen", "wizdeckFactories", "wizdeckGithubToken",
    ]);
    let read: () => Promise<Record<string, unknown>> = async () => ({});
    const factory = (bb: BbPluginApi) => {
      const definition = vi.spyOn(bb.settings, "define");
      plugin(bb);
      const handles = definition.mock.results.map((result) => result.value as { get(): Promise<Record<string, unknown>> });
      read = async () => Object.assign({}, ...await Promise.all(handles.map((handle) => handle.get())));
    };
    let host = createFakePluginHost({ pluginId: "wizbar" });
    hosts.push(host);
    factory(host.bb);
    await host.harness.behavior.setSettings({ ...v6Store050 });
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);

    const values = await read();
    expect(values).toEqual({
      footerCountEnabled: false,
      machineIconsEnabled: false,
      childrenChipEnabled: true,
      parentChipEnabled: false,
      specsOpen: "[\"example/sample-sort#711\"]",
      sectionsCollapsed: "[\"inbox\",\"specs\"]",
      wizdeckFactories: "[]",
      wizdeckGithubToken: "synthetic-token-not-real",
      specsSort: "needs-you",
      sectionsOrder: "[\"pinned\",\"cloud\",\"specs\",\"yours\"]",
      threadsSort: "newest",
      threadsFilter: "{}",
      composerFooter: "show",
    });
    expect(readSpecsSort(values.specsSort)).toBe("needs-you");
    expect(readSectionsOrder(values.sectionsOrder)).toEqual(["pinned", "cloud", "specs", "yours"]);
    expect(readCollapsedSections(values.sectionsCollapsed)).toEqual(["yours", "specs"]);

    // Expanding Specs rewrites the old alias and keeps Yours collapsed.
    const expanded = await host.harness.behavior.runCli(["section", "specs", "--expand", "--json"]);
    expect(expanded.exitCode).toBe(0);
    expect(JSON.parse(expanded.stdout!)).toEqual({ section: "specs", collapsed: false });
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);
    expect((await read()).sectionsCollapsed).toBe("[\"yours\"]");
  });
});
