// Synthetic registered-app rendering only. No backend or host connection.
import { loadPluginApp, renderSlot } from "/wizbar/node_modules/@get-bb/plugin-sdk/dist/testing/app.js";

const NOW = Date.UTC(2030, 0, 15, 9);
const DAY = 24 * 60 * 60 * 1000;
const RealDate = Date;
class FixtureDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
globalThis.Date = FixtureDate;
const projects = ["Orchard", "Harbor"].map((name) => ({
  id: `proj_syn${name}`, name, isPersonal: false,
  href: `/projects/proj_syn${name}`, settingsHref: `/projects/proj_syn${name}/settings`,
}));
const definitions = [
  ["sample-a", "Review parser", 0, null, "feature/parser", "Inbox"],
  ["sample-b", "Write guide", 1, "personal-workspace", null, "Inbox"],
  ["sample-c", "Parser follow-up", 0, null, "feature/parser", "Snoozed"],
  ["sample-d", "Guide follow-up", 1, "personal-workspace", null, "Snoozed"],
  ["sample-e", "Parser notes", 0, null, "feature/parser", "Settled"],
  ["sample-f", "Guide notes", 1, "personal-workspace", null, "Settled"],
];
const params = new URLSearchParams(location.search);
const threads = definitions.map(([id, title, project, providerId, branchName], index) => ({
  id, projectId: projects[project].id,
  title: params.has("long") && index === 0 ? "Review parser compatibility and documentation across workspaces" : title,
  titleFallback: null, displayTitle: title, parentThreadId: null,
  lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
  originKind: null, originPluginId: null, providerId: "synthetic-agent",
  status: index === 0 ? "active" : "idle", runtimeStatus: index === 0 ? "active" : "idle",
  queuedWork: "none", hasPendingInteraction: false,
  activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
  indicator: index === 0 ? "runtime" : "none", indicatorLabel: index === 0 ? "Thread working" : null,
  isUnread: index === 0, isPinned: false, pinnedAt: null, pinSortKey: null,
  isArchived: false, archivedAt: null, isHidden: false,
  href: `/projects/${projects[project].id}/threads/${id}`,
  environment: { id: null, name: null, providerId, branchName, path: null, isWorktree: false, workspaceDisplayKind: "other" },
  host: null, createdAt: NOW - index * DAY, updatedAt: NOW - (index > 3 ? 120 : 7) * 60000,
  lastReadAt: NOW, latestAttentionAt: NOW - DAY,
}));
const rows = definitions.filter((row) => row[5] !== "Inbox").map(([threadId,,,,,shelf]) => ({
  threadId, settledAt: shelf === "Settled" ? NOW : null,
  snoozedAt: shelf === "Snoozed" ? NOW : null,
  snoozedUntil: shelf === "Snoozed" ? NOW + DAY : null,
}));
const app = await loadPluginApp(() => import("/wizbar/app.tsx"));
const rendered = renderSlot(app.threadLists[0], {
  activeThreadId: "sample-a", activeProjectId: null, isCompactViewport: innerWidth < 480,
  onNavigate() {}, searchQuery: "",
}, {
  sidebarThreads: { status: "ready", threads, projects },
  rpc: { listLifecycle: () => ({ rows }), settle: () => ({ ok: true }), snooze: () => ({ ok: true }), unsettle: () => ({ ok: true }), unsnooze: () => ({ ok: true }) },
});
document.getElementById("slot").append(rendered.container);
await rendered.findByRole("region", { name: "Snoozed" });
await rendered.findByRole("region", { name: "Settled" });
for (const region of rendered.container.querySelectorAll("section[aria-label]")) {
  region.querySelector("button[aria-expanded='false']")?.click();
}
await rendered.findByText("Guide notes");
const markers = rendered.container.querySelectorAll('[role="img"][aria-label="Cloud"], [role="img"][aria-label="Local"]');
if (markers.length !== 6) throw new Error("Incomplete fixture marker rendering");
window.fixture = rendered;
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => rendered.unmount(), { once: true });
