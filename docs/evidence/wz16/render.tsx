// Synthetic registered-app fixture only; no host, backend or live identifiers.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { positiveThreads } from "../wz5/fixtures";
const app = await loadPluginApp(() => import("../../../wizbar/app"));
const mode = new URLSearchParams(location.search).get("state") ?? "positive";
if (!["positive", "hover", "zero", "disabled", "unavailable"].includes(mode)) throw new Error("Unknown fixture state");
const threads = mode === "zero" ? [] : positiveThreads;
const rendered = renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: innerWidth < 480,
  searchQuery: "", onNavigate() {},
}, {
  pluginId: "synthetic-wz16-browser", settings: { footerCountEnabled: mode !== "disabled", machineIconsEnabled: false },
  sidebarThreads: { status: mode === "unavailable" ? "error" : "ready", threads,
    projects: ["a", "b"].map((id) => ({ id: `sample-project-${id}`, name: `Sample ${id.toUpperCase()}`, isPersonal: false,
      href: `/projects/sample-project-${id}`, settingsHref: `/projects/sample-project-${id}/settings` })) },
  rpc: { listLifecycle: () => ({ rows: [] }) },
});
document.querySelector("#slot")!.append(rendered.container);
const footer = document.querySelector<HTMLElement>("#host-footer")!;
footer.title = app.experimentalSidebarFooterItems[0]!.label;
const expected = ["disabled", "unavailable"].includes(mode) ? null : mode === "zero" ? "0" : "2";
const counter = rendered.container.querySelector<HTMLElement>('[aria-label$=" running"]');
if ((counter?.textContent ?? null) !== expected) throw new Error("Unexpected synthetic count");
if (expected !== null) await rendered.findByRole("status", { name: `${expected} running` });
document.querySelector("#state")!.textContent = mode;
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => rendered.unmount(), { once: true });
