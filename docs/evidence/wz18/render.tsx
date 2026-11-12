// Synthetic registered-app fixture only: the contract's v3 fixture rows, no
// host, backend or live identifiers. `?models=host` serves made-up model and
// effort values through the cardModels RPC to show the chip once a host field
// exists; `?models=none` is what ships today (source "none").
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { v3PullRequests, v3Threads } from "../../../wizbar/src/fixtures/v3";
const app = await loadPluginApp(() => import("../../../wizbar/app"));
const params = new URLSearchParams(location.search);
const models = params.get("models") ?? "none";
if (!["none", "host"].includes(models)) throw new Error("Unknown fixture state");
const served: Record<string, [string, string]> = {
  thr_v3_parent_many: ["Opus 5.5", "medium"],
  thr_v3_parent_one: ["Sol 6.1", "high"],
  thr_v3_finished_today: ["Synthetic extended-context model 9.9", "xhigh"],
  thr_v3_failed: ["Sol 6.1", "high"],
};
const pullRequests = Object.fromEntries(Object.entries(v3PullRequests)
  .flatMap(([id, state]) => state.pullRequest ? [[id, state.pullRequest]] : []));
const rendered = renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: true, searchQuery: "", onNavigate() {},
}, {
  pluginId: "synthetic-wz18-browser", settings: { footerCountEnabled: false, machineIconsEnabled: true },
  sidebarThreads: { status: "ready", threads: [...v3Threads], projects: ["atlas", "studio", "forge"].map((name) => ({
    id: `prj_v3_${name}`, name: `Sample ${name[0]!.toUpperCase()}${name.slice(1)}`, isPersonal: false,
    href: `/projects/prj_v3_${name}`, settingsHref: `/projects/prj_v3_${name}/settings` })) },
  sidebarPullRequests: pullRequests,
  rpc: {
    listLifecycle: () => ({ rows: [] }),
    cardModels: ({ threadIds }: { threadIds: string[] }) => ({
      source: models,
      items: threadIds.map((threadId) => {
        const pair = models === "host" ? served[threadId] : undefined;
        return { threadId, model: pair?.[0] ?? null, effort: pair?.[1] ?? null };
      }),
    }),
  } as never,
});
document.querySelector("#slot")!.append(rendered.container);
await rendered.findByText("3 children");
if (models === "host") await rendered.findByText("Opus 5.5 · Medium");
await new Promise((resolve) => setTimeout(resolve, 50));
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => rendered.unmount(), { once: true });
