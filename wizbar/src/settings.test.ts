import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { v6SpecsSortCases, v6Store050 } from "./fixtures/v6";

// N1: the real backend must declare writable keys in the host's persistent store.
// App SDK fakes alone would incorrectly pass if server declaration were omitted.
const hosts: FakePluginHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});
function setup() {
  const host = createFakePluginHost({ pluginId: "wizbar" });
  hosts.push(host);
  let readSettings: () => Promise<Record<string, string | number | boolean | undefined>>;
  const factory = (bb: BbPluginApi) => {
    // Observe the real handle returned to the factory; never declare keys in a test.
    const definition = vi.spyOn(bb.settings, "define");
    plugin(bb);
    readSettings = () => definition.mock.results[0]!.value.get();
  };
  factory(host.bb);
  return { host, factory, readSettings: () => readSettings() };
}

describe("N1: actual WizBar settings declarations and persistent reload", () => {
  // C0 (#182): 0.6 adds `specsSort` and `sectionsOrder`; every 0.5.0 key stays as it was.
  it("declares the four switches, the 0.5.0 keys and the two 0.6 keys with their defaults", () => {
    const { host } = setup();
    const descriptors = host.harness.inspection.registrations.settingsDescriptors;
    expect(Object.keys(descriptors).sort()).toEqual([
      "childrenChipEnabled", "composerFooter", "footerCountEnabled", "machineIconsEnabled", "parentChipEnabled", "sectionsCollapsed",
      "sectionsOrder", "specsOpen", "specsSort", "threadsFilter", "threadsSort", "wizdeckFactories", "wizdeckGithubToken",
    ]);
    expect(descriptors.composerFooter).toMatchObject({ type: "string", default: "show" });
    expect(descriptors.specsSort).toMatchObject({ type: "string", default: "needs-you" });
    expect(descriptors.sectionsOrder).toMatchObject({ type: "string", default: "[\"pinned\",\"cloud\",\"specs\",\"yours\"]" });
    expect(descriptors.threadsSort).toMatchObject({ type: "string", default: "newest" });
    expect(descriptors.threadsFilter).toMatchObject({ type: "string", default: "{}" });
    expect(descriptors.specsOpen).toMatchObject({ type: "string", default: "[]" });
    expect(descriptors.footerCountEnabled).toMatchObject({ type: "boolean", label: "Footer count", default: true });
    expect(descriptors.machineIconsEnabled).toMatchObject({ type: "boolean", label: "Cloud/Local row icons", default: true });
    expect(descriptors.childrenChipEnabled).toMatchObject({ type: "boolean", label: "Children chip in thread header", default: false });
    expect(descriptors.parentChipEnabled).toMatchObject({ type: "boolean", label: "Parent chip in thread header", default: true });
    expect(descriptors.sectionsCollapsed).toMatchObject({ type: "string", default: "[]" });
    expect(descriptors.wizdeckGithubToken).toMatchObject({ type: "string", secret: true });
    expect(descriptors.wizdeckFactories).toMatchObject({ type: "string", experimental_multiline: true });
  });

  // WZ17: a missing header-chip key must read its declared default from the
  // host store: children chip off, parent chip on (sidebar-v3 contract).
  it("reads the header-chip defaults when nothing is stored, and each key independently", async () => {
    const fixture = setup();
    expect(await fixture.readSettings()).toMatchObject({ childrenChipEnabled: false, parentChipEnabled: true });
    await fixture.host.harness.behavior.setSettings({ childrenChipEnabled: true });
    expect(await fixture.readSettings()).toMatchObject({ childrenChipEnabled: true, parentChipEnabled: true });
    await fixture.host.harness.behavior.setSettings({ parentChipEnabled: false });
    expect(await fixture.readSettings()).toMatchObject({ childrenChipEnabled: true, parentChipEnabled: false });
    await expect(fixture.host.harness.behavior.setSettings({ parentChipEnabled: "false" })).rejects.toThrow();
    expect(await fixture.readSettings()).toMatchObject({ childrenChipEnabled: true, parentChipEnabled: false });
  });

  it("keeps both values across actual server reload and independent partial writes", async () => {
    const fixture = setup();
    let host = fixture.host;
    await host.harness.behavior.setSettings({ footerCountEnabled: false });
    await host.harness.behavior.setSettings({ machineIconsEnabled: false });
    host = await host.harness.lifecycle.reload(fixture.factory);
    hosts.push(host);
    expect(await fixture.readSettings()).toEqual({
      footerCountEnabled: false, machineIconsEnabled: false, childrenChipEnabled: false, parentChipEnabled: true,
    });
    await host.harness.behavior.setSettings({ footerCountEnabled: true });
    expect(await fixture.readSettings()).toEqual({
      footerCountEnabled: true, machineIconsEnabled: false, childrenChipEnabled: false, parentChipEnabled: true,
    });
  });

  // S1 (#169): a collapsed section must come back after a reload, and the CLI's write must change no other key.
  it("keeps sectionsCollapsed across a server reload, and section writes change no other key", async () => {
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
    await host.harness.behavior.setSettings({ footerCountEnabled: false, specsOpen: "[\"example/sample#1\"]" });
    const before = await read();
    expect(before.sectionsCollapsed).toBe("[]");
    expect((await host.harness.behavior.runCli(["section", "inbox", "--collapse", "--json"])).exitCode).toBe(0);
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);
    expect(await read()).toEqual({ ...before, sectionsCollapsed: "[\"yours\"]" });
    expect(JSON.parse((await host.harness.behavior.runCli(["section", "specs", "--collapse", "--json"])).stdout!))
      .toEqual({ section: "specs", collapsed: true });
    expect(await read()).toEqual({ ...before, sectionsCollapsed: "[\"yours\",\"specs\"]" });
  });

  // C0 (#182), Q5: a 0.5.0 store must come back whole in 0.6, with the new keys at their defaults.
  // catches: a renamed, retyped or re-defaulted 0.5.0 key, or a new key that is not declared (its write would be refused).
  it("reloads a 0.5.0 store with every value kept and the 0.6 keys at their defaults", async () => {
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
    expect(await read()).toEqual({ ...v6Store050, composerFooter: "show", specsSort: "needs-you", sectionsOrder: '["pinned","cloud","specs","yours"]', threadsSort: "newest", threadsFilter: "{}" });
    await host.harness.behavior.setSettings({ specsSort: "closest", sectionsOrder: "[\"unread\",\"pinned\",\"specs\"]" });
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);
    expect(await read()).toEqual({ ...v6Store050, composerFooter: "show", threadsSort: "newest", threadsFilter: "{}", specsSort: "closest", sectionsOrder: "[\"unread\",\"pinned\",\"specs\"]" });
  });

  it("rejects wrong types and unknown keys without changing saved settings", async () => {
    const fixture = setup();
    const host = fixture.host;
    await host.harness.behavior.setSettings({ footerCountEnabled: false });
    await expect(host.harness.behavior.setSettings({ footerCountEnabled: "true" })).rejects.toThrow();
    await expect(host.harness.behavior.setSettings({ machineIconsEnabled: 1 })).rejects.toThrow();
    await expect(host.harness.behavior.setSettings({ syntheticUnknown: true })).rejects.toThrow();
    expect(await fixture.readSettings()).toEqual({
      footerCountEnabled: false, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: true,
    });
  });
});

// N1: a string truthiness bug could silently turn a disabled feature on;
// a source-status cache could retain "live" after its source unmounts.
// These pure boundary cases complement the rendered controls, not storage.
describe("N1: boolean settings and source status boundary", () => {
  it.each([
    [undefined, { footerCountEnabled: true, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: true }],
    [{}, { footerCountEnabled: true, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: true }],
    [{ footerCountEnabled: false }, { footerCountEnabled: false, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: true }],
    [{ footerCountEnabled: "true", machineIconsEnabled: 1 }, { footerCountEnabled: false, machineIconsEnabled: false, childrenChipEnabled: false, parentChipEnabled: true }],
    [{ childrenChipEnabled: true, parentChipEnabled: false }, { footerCountEnabled: true, machineIconsEnabled: true, childrenChipEnabled: true, parentChipEnabled: false }],
    [{ childrenChipEnabled: "true", parentChipEnabled: 1 }, { footerCountEnabled: true, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: false }],
  ] as const)("reads exact booleans from %j", async (values, expected) => {
    const { readWizBarSettings } = await import("./settings");
    expect(readWizBarSettings(values)).toEqual(expected);
  });

  it("publishes explicit status, aggregates conservatively, cleans up and isolates plugins", async () => {
    const { getSourceStatuses, reportFeatureSourceStatus } = await import("./settings");
    const id = "synthetic-source-status";
    expect(getSourceStatuses(id)).toEqual({ footer: "unavailable", icons: "unverified" });
    const live = reportFeatureSourceStatus(id, "footer", "live");
    expect(getSourceStatuses(id)).toEqual({ footer: "live", icons: "unverified" });
    expect(getSourceStatuses("synthetic-other-plugin")).toEqual({ footer: "unavailable", icons: "unverified" });
    const unknown = reportFeatureSourceStatus(id, "footer", "unverified");
    expect(getSourceStatuses(id).footer).toBe("unverified");
    const failed = reportFeatureSourceStatus(id, "footer", "unavailable");
    expect(getSourceStatuses(id).footer).toBe("unavailable");
    failed();
    expect(getSourceStatuses(id).footer).toBe("unverified");
    unknown();
    expect(getSourceStatuses(id).footer).toBe("live");
    unknown(); // stale/repeated disposal must not clear another report.
    expect(getSourceStatuses(id).footer).toBe("live");
    live();
    expect(getSourceStatuses(id)).toEqual({ footer: "unavailable", icons: "unverified" });
  });
});

// C0 (#182): `specsSort` (specs-section.v1.md section 11). An unknown value must
// fall back to the default sort, never to the file's order or a crash.
describe("C0: specsSort reads one of four sorts", () => {
  it.each(v6SpecsSortCases.map((c) => [c.raw, c.sort] as const))("reads %j as %s", async (raw, sort) => {
    const { readSpecsSort } = await import("./settings");
    expect(readSpecsSort(raw)).toBe(sort);
  });
});

describe("F1: composerFooter reads one of three modes and reloads cleanly", () => {
  it.each([
    ["show", "show"],
    ["pinned", "pinned"],
    ["all", "all"],
    [undefined, "show"],
    ["unknown", "show"],
    [true, "show"],
    [42, "show"],
  ] as const)("reads %j as %s", async (raw, expected) => {
    const { readComposerFooter } = await import("./settings");
    expect(readComposerFooter(raw)).toBe(expected);
  });

  it("reloads 0.6 and 0.7 settings unchanged with composerFooter starting at show and persisting writes", async () => {
    let read: () => Promise<Record<string, unknown>> = async () => ({});
    const factory = (bb: BbPluginApi) => {
      const definition = vi.spyOn(bb.settings, "define");
      plugin(bb);
      const handles = definition.mock.results.map((result) => result.value as { get(): Promise<Record<string, unknown>> });
      read = async () => Object.assign({}, ...await Promise.all(handles.map((handle) => handle.get())));
    };
    const stored07 = {
      ...v6Store050,
      specsSort: "recent",
      sectionsOrder: '["pinned","cloud","specs","yours"]',
      threadsSort: "activity",
      threadsFilter: '{"status":"idle"}',
    };
    let host = createFakePluginHost({ pluginId: "wizbar" });
    hosts.push(host);
    factory(host.bb);
    await host.harness.behavior.setSettings(stored07);
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);
    expect(await read()).toEqual({ ...stored07, composerFooter: "show" });

    await host.harness.behavior.setSettings({ composerFooter: "pinned" });
    host = await host.harness.lifecycle.reload(factory);
    hosts.push(host);
    expect(await read()).toEqual({ ...stored07, composerFooter: "pinned" });
  });
});
