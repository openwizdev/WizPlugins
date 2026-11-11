// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { MachineIcon } from "./MachineIcon";
import { getSourceStatuses } from "./settings";

const app = await loadPluginApp(() => import("../app"));
const Page = app.settingsSections.find(({ id }) => id === "wizbar-settings")!.component;
afterEach(cleanup);
let sequence = 0;

// N5d: a switch changes visibility, not source authority. Existing row tests
// omit hook loading/error and cannot catch stale icons or false live reports.
describe("N5 source availability and visibility at the rendered boundary", () => {
  it.each([true, false])("ready observed input, icons enabled %s", (enabled) => {
    const pluginId = `synthetic-machine-${++sequence}`;
    const rendered = renderSlot({ component: () => <>
      <Page />
      <MachineIcon environment={null} host={null} runtimeStatus="idle" />
    </> }, {}, {
      pluginId, settings: { machineIconsEnabled: enabled },
      sidebarThreads: { status: "ready" },
    });
    expect(screen.queryAllByRole("img", { name: "Cloud" })).toHaveLength(enabled ? 1 : 0);
    if (enabled) {
      const marker = screen.getByRole("img", { name: "Cloud" });
      expect(marker.getAttribute("title")).toBe("Cloud");
      expect(marker.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    // The projection rule has a known startup limit and lacks an explicit
    // machine discriminant. Do not upgrade it to verified live authority.
    expect(getSourceStatuses(pluginId).icons).toBe("unverified");
    expect(within(screen.getByRole("region", { name: "WizBar settings" })).getByText(
      `Icons: ${enabled ? "Enabled" : "Disabled"} · Not connected yet`,
    )).toBeDefined();
    rendered.unmount();
    expect(getSourceStatuses(pluginId).icons).toBe("unverified");
  });

  it.each(["loading", "error"] as const)("%s suppresses a stale Local row and reports unavailable while hidden too", (status) => {
    for (const enabled of [true, false]) {
      const pluginId = `synthetic-machine-${++sequence}`;
      const rendered = renderSlot({ component: () => <>
        <Page />
        <MachineIcon environment={{ id: "synthetic-environment", name: null,
          branchName: null, path: null, isWorktree: false,
          providerId: "project-checkout", workspaceDisplayKind: "other" }} />
      </> }, {}, {
        pluginId, settings: { machineIconsEnabled: enabled },
        sidebarThreads: { status },
      });
      expect(screen.queryAllByRole("img", { name: /^(Cloud|Local)$/ })).toHaveLength(0);
      expect(getSourceStatuses(pluginId).icons).toBe("unavailable");
      expect(screen.getByText("The Cloud/Local source is not connected.")).toBeDefined();
      rendered.unmount();
      expect(getSourceStatuses(pluginId).icons).toBe("unverified");
    }
  });
});
