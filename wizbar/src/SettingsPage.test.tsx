// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import manifest from "../package.json";
import { reportFeatureSourceStatus } from "./settings";
import { FooterCounterArtwork } from "./FooterCounter";
import { MachineIcon } from "./MachineIcon";
import { positiveSource } from "../../docs/evidence/wz5/fixtures";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);
let fixtureNumber = 0;

function mount(options: {
  stored?: Record<string, string | number | boolean>;
  write?: (values: Record<string, unknown>) => Promise<void>;
  pluginId?: string;
  unavailable?: boolean;
} = {}) {
  const section = app.settingsSections.find(({ id }) => id === "wizbar-settings");
  expect(section, "N1: the plugin must register its settings section").toBeDefined();
  const Page = section!.component;
  let stored = options.stored ?? { footerCountEnabled: true, machineIconsEnabled: true };
  const initial = stored;
  const pluginId = options.pluginId ?? `synthetic-settings-${++fixtureNumber}`;
  const updateSettings = vi.fn(async ({ pluginId: target, values }: {
    pluginId?: string; values: Record<string, unknown>;
  }) => {
    if (target !== pluginId) throw new Error("Wrong plugin settings boundary");
    for (const [key, value] of Object.entries(values)) {
      if (!["footerCountEnabled", "machineIconsEnabled"].includes(key) || typeof value !== "boolean") {
        throw new Error("Invalid synthetic setting");
      }
    }
    await options.write?.(values);
    stored = { ...stored, ...values } as typeof stored;
    return { ok: true as const, schema: {}, values: stored };
  });
  const rendered = renderSlot({ component: () => <>
    <Page />
    <div aria-label="Synthetic feature previews">
      <FooterCounterArtwork source={positiveSource} />
      <MachineIcon environment={{
        id: "synthetic-environment", name: "Synthetic workspace", path: null,
        branchName: null, providerId: "project-checkout", isWorktree: false,
        workspaceDisplayKind: "other",
      }} />
      <MachineIcon environment={null} />
    </div>
  </> }, {}, {
    pluginId, settings: options.unavailable ? undefined : initial,
    sdk: { plugins: { updateSettings } },
  });
  return { ...rendered, updateSettings, pluginId, getStored: () => stored };
}

function toggle(name: string) {
  fireEvent.click(screen.getByRole("switch", { name }));
}
function expectFeatures(footer: boolean, icons: boolean) {
  expect(screen.queryByRole("status", { name: "5 running" }) !== null).toBe(footer);
  expect(screen.queryAllByRole("img", { name: "Local" })).toHaveLength(icons ? 1 : 0);
  expect(screen.queryByRole("img", { name: "Cloud" })).toBeNull();
}

describe("N1: settings through the registered app", () => {
  it("registers one section, actual version and honest independent source status", () => {
    mount();
    expect(app.settingsSections.map(({ id }) => id)).toEqual(["wizbar-settings"]);
    expect(screen.getByRole("heading", { name: "WizBar" })).toBeDefined();
    expect(screen.getByText(`Version ${manifest.version}`)).toBeDefined();
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByText("Footer: Enabled · Not connected yet")).toBeDefined();
    expect(screen.getByText("Icons: Enabled · Not connected yet")).toBeDefined();
    expect(screen.queryByText(/· Live/)).toBeNull();
    expectFeatures(true, true);
  });

  it("persists each switch independently, updates both consumers, and survives reopening", async () => {
    const first = mount({ stored: {
      footerCountEnabled: true, machineIconsEnabled: true, unrelated: "keep",
    } });
    toggle("Footer count");
    await waitFor(() => expectFeatures(false, true));
    expect(screen.getByText("Footer: Disabled · Not connected yet")).toBeDefined();
    toggle("Cloud/Local row icons");
    await waitFor(() => expectFeatures(false, false));
    expect(first.getStored()).toEqual({
      footerCountEnabled: false, machineIconsEnabled: false, unrelated: "keep",
    });
    const saved = first.getStored();
    const pluginId = first.pluginId;
    first.unmount();
    mount({ stored: saved, pluginId });
    expect((screen.getByRole("switch", { name: "Footer count" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch", { name: "Cloud/Local row icons" }) as HTMLInputElement).checked).toBe(false);
    expectFeatures(false, false);
    toggle("Cloud/Local row icons");
    await waitFor(() => expectFeatures(false, true));
    toggle("Footer count");
    await waitFor(() => expectFeatures(true, true));
    expect(screen.queryByText(/· Live/)).toBeNull();
  });

  it("does not apply an in-flight write and retains focus until a confirmed save", async () => {
    let finish!: () => void;
    mount({ write: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const control = screen.getByRole("switch", { name: "Footer count" }) as HTMLInputElement;
    control.focus();
    toggle("Footer count");
    await waitFor(() => expect(control.disabled).toBe(true));
    expect(screen.getAllByRole("switch").every((node) => (node as HTMLInputElement).disabled)).toBe(true);
    expectFeatures(true, true);
    expect(document.activeElement).toBe(control);
    finish();
    await waitFor(() => expectFeatures(false, true));
    expect(screen.getByRole("switch", { name: "Footer count" })).toBe(control);
    expect(document.activeElement).toBe(control);
    expect(screen.getByRole("status", { name: "Settings save" }).textContent).toContain("Saved");
  });

  it("retains prior values after a rejected write and announces the error", async () => {
    const first = mount({ write: async () => { throw new Error("Synthetic save rejection"); } });
    toggle("Cloud/Local row icons");
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Could not save");
    expectFeatures(true, true);
    expect(first.getStored()).toEqual({ footerCountEnabled: true, machineIconsEnabled: true });
    expect((screen.getByRole("switch", { name: "Cloud/Local row icons" }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(/· Live/)).toBeNull();
  });

  it("disables writes when host settings are unavailable", () => {
    const rendered = mount({ unavailable: true });
    expect(screen.getAllByRole("switch").every((node) => (node as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByText("Settings are unavailable. Changes cannot be saved.")).toBeDefined();
    expect(rendered.updateSettings).not.toHaveBeenCalled();
    expect(screen.queryByText(/· Live/)).toBeNull();
  });

  // N1: a stale report could leave a false Live claim after failure/unmount.
  // Existing toggle tests have no source adapter and cannot catch that bug.
  it("tracks source reports independently of visibility and clears stale live status", async () => {
    const rendered = mount();
    let remove!: () => void;
    act(() => { remove = reportFeatureSourceStatus(rendered.pluginId, "footer", "live"); });
    expect(screen.getByText("Footer: Enabled · Live")).toBeDefined();
    toggle("Footer count");
    await waitFor(() => expectFeatures(false, true));
    expect(screen.getByText("Footer: Disabled · Live")).toBeDefined();
    let failed!: () => void;
    act(() => { failed = reportFeatureSourceStatus(rendered.pluginId, "footer", "unavailable"); });
    expect(screen.getByText("Footer: Disabled · Not connected yet")).toBeDefined();
    act(() => { failed(); remove(); });
    expect(screen.queryByText(/· Live/)).toBeNull();
    expect(screen.getByText("Icons: Enabled · Not connected yet")).toBeDefined();
    expect(screen.queryByText(/PC persistence|Unavailable|Unverified/)).toBeNull();
  });

  it.each([
    { footerCountEnabled: false, machineIconsEnabled: true, footer: false, icons: true },
    { footerCountEnabled: true, machineIconsEnabled: false, footer: true, icons: false },
    { footerCountEnabled: "true", machineIconsEnabled: 1, footer: false, icons: false },
  ])("honors persisted values and fails closed on wrong types: %j", ({ footer, icons, ...stored }) => {
    mount({ stored });
    expectFeatures(footer, icons);
  });
});
