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
    const descriptors = host.harness.inspection.settingsDescriptors;
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
