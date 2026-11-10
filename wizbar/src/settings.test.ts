import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

// N1: the real backend must declare writable keys in the host's persistent store.
// App SDK fakes alone would incorrectly pass if server declaration were omitted.
const hosts: FakePluginHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});
function setup() {
  const host = createFakePluginHost({ pluginId: "wizbar" });
  hosts.push(host);
  plugin(host.bb);
  return host;
}

describe("N1: actual WizBar settings declarations and persistent reload", () => {
  it("declares exactly two named boolean switches with defaults", () => {
    const host = setup();
    const descriptors = host.harness.inspection.registrations.settingsDescriptors;
    expect(Object.keys(descriptors).sort()).toEqual(["footerCountEnabled", "machineIconsEnabled"]);
    expect(descriptors.footerCountEnabled).toMatchObject({ type: "boolean", label: "Footer count", default: true });
    expect(descriptors.machineIconsEnabled).toMatchObject({ type: "boolean", label: "Cloud/Local row icons", default: true });
  });

  it("keeps both values across actual server reload and independent partial writes", async () => {
    let host = setup();
    await host.harness.behavior.setSettings({ footerCountEnabled: false });
    await host.harness.behavior.setSettings({ machineIconsEnabled: false });
    host = await host.harness.lifecycle.reload(plugin);
    hosts.push(host);
    const handle = host.bb.settings.define({
      footerCountEnabled: { type: "boolean", label: "Footer count", default: true },
      machineIconsEnabled: { type: "boolean", label: "Cloud/Local row icons", default: true },
    });
    expect(await handle.get()).toEqual({ footerCountEnabled: false, machineIconsEnabled: false });
    await host.harness.behavior.setSettings({ footerCountEnabled: true });
    expect(await handle.get()).toEqual({ footerCountEnabled: true, machineIconsEnabled: false });
  });

  it("rejects wrong types and unknown keys without changing saved settings", async () => {
    const host = setup();
    await host.harness.behavior.setSettings({ footerCountEnabled: false });
    await expect(host.harness.behavior.setSettings({ footerCountEnabled: "true" })).rejects.toThrow();
    await expect(host.harness.behavior.setSettings({ machineIconsEnabled: 1 })).rejects.toThrow();
    await expect(host.harness.behavior.setSettings({ syntheticUnknown: true })).rejects.toThrow();
    const handle = host.bb.settings.define({
      footerCountEnabled: { type: "boolean", label: "Footer count", default: true },
      machineIconsEnabled: { type: "boolean", label: "Cloud/Local row icons", default: true },
    });
    expect(await handle.get()).toEqual({ footerCountEnabled: false, machineIconsEnabled: true });
  });
});

// N1: a string truthiness bug could silently turn a disabled feature on;
// a source-status cache could retain "live" after its source unmounts.
// These pure boundary cases complement the rendered controls, not storage.
describe("N1: boolean settings and source status boundary", () => {
  it.each([
    [undefined, { footerCountEnabled: true, machineIconsEnabled: true }],
    [{}, { footerCountEnabled: true, machineIconsEnabled: true }],
    [{ footerCountEnabled: false }, { footerCountEnabled: false, machineIconsEnabled: true }],
    [{ footerCountEnabled: "true", machineIconsEnabled: 1 }, { footerCountEnabled: false, machineIconsEnabled: false }],
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
