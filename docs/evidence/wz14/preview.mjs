// Synthetic registered-app rendering only; no host connection or backend calls.
import { loadPluginApp, renderSlot } from "/wizbar/node_modules/@get-bb/plugin-sdk/dist/testing/app.js";
const NOW = Date.UTC(2030, 0, 15, 9);
const DAY = 86400000;
const RealDate = Date;
class FixtureDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
globalThis.Date = FixtureDate;
const project = { id: "sample-project", name: "Orchard", isPersonal: false,
  href: "/projects/sample-project", settingsHref: "/projects/sample-project/settings" };
const params = new URLSearchParams(location.search);
const threads = ["Review parser", "Write guide", "Guide notes"].map((title, i) => ({
  id: `sample-${i}`, projectId: project.id,
  title: params.has("long") && i === 1 ? "Write guide compatibility and documentation across workspaces" : title,
  titleFallback: null, displayTitle: title, parentThreadId: null,
  lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
  originKind: null, originPluginId: null, providerId: "synthetic-agent",
  status: i === 1 ? "active" : "idle", runtimeStatus: i === 1 ? "active" : "idle",
  queuedWork: "none", hasPendingInteraction: i === 0,
  activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
  indicator: i === 0 ? "waiting-for-input" : i === 1 ? (params.has("running-attention") ? "unread-success" : "runtime") : "none",
  indicatorLabel: i === 0 ? "Thread needs user input" : i === 1 ? "Thread working" : null,
  isUnread: i !== 2, isPinned: false, pinnedAt: null, pinSortKey: null,
  isArchived: false, archivedAt: null, isHidden: false,
  href: `/projects/sample-project/threads/sample-${i}`,
  environment: { id: null, name: null, providerId: "personal-workspace", branchName: null,
    path: null, isWorktree: false, workspaceDisplayKind: "other" },
  host: null, createdAt: NOW - i * DAY, updatedAt: NOW - 7 * 60000,
  lastReadAt: NOW - DAY, latestAttentionAt: NOW - 100,
}));
let rows = [
  { threadId: "sample-1", settledAt: null, snoozedAt: null, snoozedUntil: null, mutedAt: NOW - 200, muteAttentionAt: NOW - 300 },
  { threadId: "sample-2", settledAt: NOW, snoozedAt: null, snoozedUntil: null },
];
const app = await loadPluginApp(() => import("/wizbar/app.tsx"));
const rendered = renderSlot(app.threadLists[0], {
  activeThreadId: null, activeProjectId: null, isCompactViewport: innerWidth < 480,
  onNavigate() {}, searchQuery: "",
}, {
  sidebarThreads: { status: "ready", threads, projects: [project] },
  rpc: { listLifecycle: () => ({ rows }), unmute: async ({ threadId }) => {
    rows = rows.filter((row) => row.threadId !== threadId);
    queueMicrotask(() => rendered.emitRealtime("lifecycle", { threadId }));
    return { ok: true };
  } },
});
document.getElementById("slot").append(rendered.container);
const muted = await rendered.findByRole("region", { name: "Muted" });
if (!params.has("collapsed")) muted.querySelector("button").click();
await rendered.findByRole("region", { name: "Settled" });
if (!params.has("collapsed")) await rendered.findByRole("button", { name: "Unmute thread" });
window.fixture = rendered;
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => rendered.unmount(), { once: true });
