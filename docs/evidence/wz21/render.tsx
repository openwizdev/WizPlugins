// Synthetic registered-app fixture only; no host, backend or live identifiers.
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { v3Threads } from "../../../wizbar/src/fixtures/v3";
const app = await loadPluginApp(() => import("../../../wizbar/app"));
const mode = new URLSearchParams(location.search).get("state") ?? "before";
const notes: Record<string, string> = {
  before: "Host rows: Pinned in the host's pinned order; the Inbox newest first.",
  dragging: "Dragging an Inbox card over the lower half of the first pinned card: the marker shows where it lands.",
  after: "Host rows after pin and move: the card is pinned in second place; the Inbox keeps its order.",
  failed: "The host refused the pin: the message shows and every card stays where the host rows put it.",
  empty: "Nothing pinned: while a card is dragged, an empty Pinned drop target appears (screenshot taken mid-drag).",
  unpin: "Dragging a pinned card out of Pinned onto the Inbox unpins it.",
};
if (!(mode in notes)) throw new Error("Unknown fixture state");
const dragged = "thr_v3_finished_yesterday";
const topLevel = v3Threads.filter((t) => t.parentThreadId === null);
let threads = mode === "empty" ? topLevel.map((t) => ({ ...t, isPinned: false, pinnedAt: null, pinSortKey: null })) : topLevel;
if (mode === "after") threads = threads.map((t) => t.id === dragged
  ? { ...t, isPinned: true, pinnedAt: t.createdAt + 1, pinSortKey: "a0V" } : t);
const calls: string[] = [];
const record = (method: string) => (input: unknown) => {
  calls.push(`${method} ${JSON.stringify(input)}`);
  if (method === "pin" && mode === "failed") throw new Error("Sample host refusal.");
  return { ok: true };
};
const rendered = renderSlot(app.threadLists[0]!, {
  activeThreadId: null, activeProjectId: null, isCompactViewport: false, searchQuery: "", onNavigate() {},
}, {
  pluginId: "synthetic-wz21-browser", settings: { footerCountEnabled: false, machineIconsEnabled: false },
  sidebarThreads: { status: "ready", threads, projects: [
    { id: "prj_v3_web", name: "Sample web", isPersonal: false, href: "/projects/prj_v3_web", settingsHref: "/projects/prj_v3_web/settings" },
    { id: "prj_v3_studio", name: "Sample studio", isPersonal: false, href: "/projects/prj_v3_studio", settingsHref: "/projects/prj_v3_studio/settings" },
  ] },
  rpc: { listLifecycle: () => ({ rows: [] }), pin: record("pin"), unpin: record("unpin"), move: record("move") },
});
document.querySelector("#slot")!.append(rendered.container);
const anchor = (id: string) => rendered.container.querySelector<HTMLElement>(`[data-sidebar-thread-id="${id}"]`)!;
const fire = (target: Element, type: string, clientY = 0) => {
  target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientY, dataTransfer: new DataTransfer() }));
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
await tick();
if (mode === "dragging" || mode === "failed" || mode === "empty" || mode === "unpin") {
  const source = mode === "unpin" ? "thr_v3_pinned_idle" : dragged;
  fire(anchor(source), "dragstart");
  await tick();
  const target = mode === "empty" ? rendered.container.querySelector("[data-wizbar-pinned] li")!
    : mode === "unpin" ? anchor("thr_v3_finished_today").closest("li")!
      : anchor("thr_v3_parent_many").closest("li")!;
  const box = target.getBoundingClientRect();
  fire(target, "dragover", box.bottom - 2);
  await tick();
  if (mode !== "dragging" && mode !== "empty") {
    fire(target, "drop", box.bottom - 2);
    fire(anchor(source), "dragend");
    await tick();
  }
}
document.querySelector("#state")!.textContent = mode;
document.querySelector("#note")!.textContent = notes[mode]!;
document.querySelector("#calls")!.textContent = calls.length ? `WizBar server calls:\n${calls.join("\n")}` : "WizBar server calls: none";
document.documentElement.dataset.ready = "true";
