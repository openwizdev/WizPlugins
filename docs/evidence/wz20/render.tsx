// Synthetic registered-app fixture only; no host, backend or live identifiers.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { v3Now, v3Threads } from "../../../wizbar/src/fixtures/v3";
// Fix the clock to the fixture's, so ages and "today" match the hand-worked values.
Date.now = () => v3Now;
const app = await loadPluginApp(() => import("../../../wizbar/app"));
const mode = new URLSearchParams(location.search).get("state") ?? "ready";
if (!["ready", "unavailable"].includes(mode)) throw new Error("Unknown fixture state");
const item = app.experimentalSidebarFooterItems[0]!;
if (item.kind !== "disclosure") throw new Error("Expected the stats disclosure");
const options = {
  pluginId: "synthetic-wz20-browser", settings: { footerCountEnabled: true, machineIconsEnabled: true },
  sidebarThreads: { status: mode === "ready" ? "ready" as const : "error" as const, threads: v3Threads,
    projects: ["atlas", "studio", "forge"].map((id) => ({ id: `prj_v3_${id}`, name: `Sample ${id[0]!.toUpperCase()}${id.slice(1)}`, isPersonal: false,
      href: `/projects/prj_v3_${id}`, settingsHref: `/projects/prj_v3_${id}/settings` })) },
  rpc: { listLifecycle: () => ({ rows: [] }) },
};
const list = renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: innerWidth < 480, searchQuery: "", onNavigate() {},
}, options);
document.querySelector("#slot")!.append(list.container);
const panel = renderSlot({ component: item.component }, { dismiss() {} }, options);
document.querySelector("#disclosure")!.append(panel.container);
document.querySelector("#bolt")!.setAttribute("aria-label", item.label);
document.querySelector("#state")!.textContent = mode;
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => { list.unmount(); panel.unmount(); }, { once: true });
