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

// R1: closing the final consumer must retain an outstanding host-write lock.
// The preview fixture keeps additional consumers mounted and misses this path.
function deferredPage() {
  const section = app.settingsSections.find(({ id }) => id === "wizbar-settings")!;
  const pluginId = `synthetic-deferred-settings-${++fixtureNumber}`;
  const hostValues = { footerCountEnabled: true, machineIconsEnabled: true };
  let stored = { ...hostValues };
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  const write = ({ values }: { values: Record<string, unknown> }) => {
    stored = { ...stored, ...values } as typeof stored;
    return { ok: true as const, schema: {}, values: { ...stored } };
  };
  const updateSettings = vi.fn(async (args: { values: Record<string, unknown> }) => write(args));
  updateSettings.mockImplementationOnce(async (args) => {
    await pending;
    return write(args);
  });
  return {
    open: () => renderSlot(section, {}, {
      pluginId, settings: hostValues, sdk: { plugins: { updateSettings } },
    }),
    updateSettings,
    settle: async (succeeds: boolean) => {
      await act(async () => {
        if (succeeds) resolve();
        else reject(new Error("Synthetic deferred save rejection"));
      });
    },
  };
}

describe("N1: settings through the registered app", () => {
  it("registers one section, actual version and honest independent source status", () => {
    mount();
    expect(app.settingsSections.map(({ id }) => id)).toEqual(["wizbar-settings"]);
    expect(screen.getByRole("heading", { name: "WizBar" })).toBeDefined();
    expect(screen.getByText(`Version ${manifest.version}`)).toBeDefined();
    expect(screen.getAllByRole("switch")).toHaveLength(4);
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

  it.each([
    { succeeds: true, footerEnabled: false, message: "Saved", alerts: 0 },
    { succeeds: false, footerEnabled: true, message: "Could not save. Try again.", alerts: 1 },
  ])("R1/R2 keeps the save lock and outcome across closing and reopening: %j", async ({ succeeds, footerEnabled, message, alerts }) => {
    const fixture = deferredPage();
    const first = fixture.open();
    toggle("Footer count");
    expect(fixture.updateSettings).toHaveBeenCalledTimes(1);
    first.unmount();
    fixture.open();
    const footer = screen.getByRole("switch", { name: "Footer count" }) as HTMLInputElement;
    const icons = screen.getByRole("switch", { name: "Cloud/Local row icons" }) as HTMLInputElement;
    expect(footer.disabled).toBe(true);
    expect(icons.disabled).toBe(true);
    toggle("Cloud/Local row icons");
    expect(fixture.updateSettings).toHaveBeenCalledTimes(1);
    await fixture.settle(succeeds);
    await waitFor(() => expect(footer.disabled).toBe(false));
    expect(footer.checked).toBe(footerEnabled);
    expect(icons.checked).toBe(true);
    // R2: the initiating page is gone, so its local notification misses this page.
    expect(screen.getByRole("status", { name: "Settings save" }).textContent).toBe(message);
    expect(screen.queryAllByRole("alert")).toHaveLength(alerts);
    toggle("Cloud/Local row icons");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status", { name: "Settings save" }).textContent).toBe("Saving…");
    await waitFor(() => expect(icons.checked).toBe(false));
    expect(fixture.updateSettings).toHaveBeenCalledTimes(2);
    expect(footer.checked).toBe(footerEnabled);
    expect(screen.getByRole("status", { name: "Settings save" }).textContent).toBe("Saved");
  });

  it.each([true, false])("R1 clears settled acknowledgements with no mounted consumers, success=%s", async (succeeds) => {
    const fixture = deferredPage();
    const first = fixture.open();
    toggle("Footer count");
    first.unmount();
    await fixture.settle(succeeds);
    fixture.open();
    const footer = screen.getByRole("switch", { name: "Footer count" }) as HTMLInputElement;
    expect(footer.disabled).toBe(false);
    expect(footer.checked).toBe(true);
    expect(fixture.updateSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Settings save" }).textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
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
    let iconsFailed!: () => void;
    act(() => { iconsFailed = reportFeatureSourceStatus(rendered.pluginId, "icons", "unavailable"); });
    expect(screen.getByText("The Cloud/Local source is not connected.")).toBeDefined();
    act(() => { failed(); remove(); iconsFailed(); });
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

// WZ19 (#43), V2: the two header-chip switches on the settings page. Each one
// turns only its own chip on and off; the host store saves exactly that key.
describe("header-chip switches", () => {
  const parentSlot = app.threadHeaderActions.find(({ id }) => id === "parent")!;
  const childrenSlot = app.threadHeaderActions.find(({ id }) => id === "children")!;
  const row = (id: string, parentThreadId: string | null) => ({
    id, projectId: "prj_synthetic", title: `Thread ${id}`, titleFallback: null, displayTitle: `Thread ${id}`,
    parentThreadId, lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null, originKind: null,
    originPluginId: null, providerId: "synthetic", status: "idle", runtimeStatus: "idle", queuedWork: "none",
    hasPendingInteraction: false, activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none", indicatorLabel: null, isUnread: false, isPinned: false, pinnedAt: null, pinSortKey: null,
    isArchived: false, archivedAt: null, href: `/t/${id}`, isHidden: false, environment: null, host: null,
    createdAt: 1, updatedAt: 1, lastReadAt: 1, latestAttentionAt: 1,
  }) as const;

  function mountChips() {
    const Page = app.settingsSections.find(({ id }) => id === "wizbar-settings")!.component;
    const Parent = parentSlot.component, Children = childrenSlot.component;
    let stored: Record<string, boolean> = {};
    const updateSettings = vi.fn(async ({ values }: { values: Record<string, unknown> }) => {
      stored = { ...stored, ...values } as Record<string, boolean>;
      return { ok: true as const, schema: {}, values: stored };
    });
    renderSlot({ component: () => <>
      <Page />
      <div aria-label="Child header"><Parent threadId="thr_c" projectId="prj_synthetic" isCompactViewport={false} /></div>
      <div aria-label="Parent header"><Children threadId="thr_p" projectId="prj_synthetic" isCompactViewport={false} /></div>
    </> }, {}, {
      pluginId: `synthetic-header-chips-${++fixtureNumber}`, settings: {},
      sidebarThreads: { status: "ready", threads: [row("thr_p", null), row("thr_c", "thr_p")] as never, projects: [] },
      sdk: { plugins: { updateSettings } },
    });
    return { updateSettings };
  }
  const shown = () => ({
    parent: screen.queryByRole("button", { name: "Back to parent: Thread thr_p" }) !== null,
    children: screen.queryByRole("button", { name: "1 child threads" }) !== null,
  });

  it("starts with the children chip off and the parent chip on, and each switch changes only its own chip", async () => {
    const { updateSettings } = mountChips();
    const childrenSwitch = screen.getByRole("switch", { name: "Children chip in thread header" }) as HTMLInputElement;
    const parentSwitch = screen.getByRole("switch", { name: "Parent chip in thread header" }) as HTMLInputElement;
    expect([childrenSwitch.checked, parentSwitch.checked]).toEqual([false, true]);
    expect(shown()).toEqual({ parent: true, children: false });

    fireEvent.click(childrenSwitch);
    await waitFor(() => expect(shown()).toEqual({ parent: true, children: true }));
    expect(updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ values: { childrenChipEnabled: true } }));

    await waitFor(() => expect(parentSwitch.disabled).toBe(false));
    fireEvent.click(parentSwitch);
    await waitFor(() => expect(shown()).toEqual({ parent: false, children: true }));
    expect(updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ values: { parentChipEnabled: false } }));

    await waitFor(() => expect(childrenSwitch.disabled).toBe(false));
    fireEvent.click(childrenSwitch);
    await waitFor(() => expect(shown()).toEqual({ parent: false, children: false }));
    expect(updateSettings).toHaveBeenCalledTimes(3);
  });
});
