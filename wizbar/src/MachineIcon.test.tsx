// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { experimental_useSidebarThreads as useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { syntheticThread } from "../../docs/evidence/wz5/fixtures";
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

  for (const enabled of [true, false]) {
    it.each(["loading", "error"] as const)(`R2 %s and recovery with icons enabled ${enabled}`, (status) => {
      const pluginId = `synthetic-machine-${++sequence}`;
      const Inbox = app.threadLists[0]!.component;
      let source!: ReturnType<typeof useSidebarThreads>;
      function Fixture({ showInbox = true }: { showInbox?: boolean }) {
        // SDK 0.6.33 has no sidebar-state driver. Capture its synthetic snapshot
        // to change status on the same mounted source, without mocking the hook.
        source = useSidebarThreads();
        return <>
          <Page />
          {showInbox && <Inbox activeThreadId={null} activeProjectId={null}
            isCompactViewport={false} onNavigate={() => {}} searchQuery="" />}
        </>;
      }
      const rendered = renderSlot({ component: Fixture }, {}, {
        pluginId, settings: { machineIconsEnabled: enabled },
        sidebarThreads: { status: "ready", threads: [syntheticThread()] },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      });
      const expectReady = () => {
        expect(getSourceStatuses(pluginId).icons).toBe("unverified");
        expect(screen.getByText("The Cloud/Local source is still being checked.")).toBeDefined();
        expect(screen.queryAllByRole("img", { name: "Cloud" })).toHaveLength(enabled ? 1 : 0);
      };
      expectReady();
      Object.assign(source, { status });
      rendered.rerender(<Fixture />);
      expect(screen.queryAllByRole("img", { name: /^(Cloud|Local)$/ })).toHaveLength(0);
      expect(screen.queryByRole("link", { name: "Sample work" })).toBeNull();
      if (status === "error") expect(screen.getByText("Could not load threads.")).toBeDefined();
      expect(getSourceStatuses(pluginId).icons).toBe("unavailable");
      expect(screen.getByText("The Cloud/Local source is not connected.")).toBeDefined();
      expect(screen.getByText(`Icons: ${enabled ? "Enabled" : "Disabled"} · Not connected yet`)).toBeDefined();
      Object.assign(source, { status: "ready" });
      rendered.rerender(<Fixture />);
      expectReady();
      // Empty/filtered/closed shelves cannot remove the mounted source report.
      Object.assign(source, { status, threads: [] });
      rendered.rerender(<Fixture />);
      expect(getSourceStatuses(pluginId).icons).toBe("unavailable");
      rendered.rerender(<Fixture showInbox={false} />);
      expect(getSourceStatuses(pluginId).icons).toBe("unverified");
      expect(screen.getByText("The Cloud/Local source is still being checked.")).toBeDefined();
      rendered.unmount();
      expect(getSourceStatuses(pluginId).icons).toBe("unverified");
    });
  }
});
