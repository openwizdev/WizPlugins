// A synthetic scene for screenshots of the real WizBar sidebar (tools/render/README.md).
// Every name, number and id here is made up; nothing comes from a real account.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

const MINUTE = 60_000;
const REPO = "example/sample-factory";

export interface Scene {
  now: number;
  threads: PluginSidebarThread[];
  specsText: string;
  models: Record<string, { model: string; effort: string | null }>;
  binding: string;
}

const idle = { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 };

function row(now: number, id: string, title: string | null, over: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id, projectId: "prj_sample", title, titleFallback: null, displayTitle: title ?? "Untitled thread",
    parentThreadId: null, lifecycleOwnerThreadId: null, sourceThreadId: null, sectionId: null,
    originKind: null, originPluginId: null, providerId: "codex", status: "idle", runtimeStatus: "idle",
    queuedWork: "none", hasPendingInteraction: false, activity: idle, indicator: "none", indicatorLabel: null,
    isUnread: false, isPinned: false, pinnedAt: null, pinSortKey: null, isArchived: false, archivedAt: null,
    href: `/projects/prj_sample/threads/${id}`, isHidden: false,
    environment: { id: "env_sample", name: "cloud", branchName: null, path: null, isWorktree: false, providerId: "cloud", workspaceDisplayKind: null } as never,
    host: { id: "hst_cloud", name: "Cloud" },
    createdAt: now - 60 * MINUTE, updatedAt: now - 5 * MINUTE, lastReadAt: now - 5 * MINUTE, latestAttentionAt: now - 5 * MINUTE,
    ...over,
  };
}
const running = (over: Partial<PluginSidebarThread> = {}): Partial<PluginSidebarThread> =>
  ({ status: "active", runtimeStatus: "active", indicator: "runtime", ...over });

const specNames = ["Sidebar search", "Running card", "Release notes", "Cloud agents", "Settings sync", "Docs refresh"];

/**
 * `agents` running spec agents spread over six specs, plus a pinned orchestrator,
 * a few threads started by hand and some idle ones.
 */
export function scene(agents = 24, now = Date.now()): Scene {
  const iso = (ms: number) => new Date(ms).toISOString();
  const threads: PluginSidebarThread[] = [];
  const models: Scene["models"] = {};
  const orchestrator = row(now, "thr_orch", "Orchestrator: sample factory", { ...running(), providerId: "claude-code", isPinned: true, pinnedAt: now - 9 * 60 * MINUTE, createdAt: now - 10 * 60 * MINUTE });
  threads.push(orchestrator, row(now, "thr_hands", "Desktop helper", { providerId: "claude-code", isPinned: true, pinnedAt: now - 8 * 60 * MINUTE }));
  models.thr_orch = { model: "claude-opus-5-5", effort: "high" };
  models.thr_hands = { model: "claude-sonnet-5-5", effort: "medium" };
  threads.push(row(now, "thr_handoff", "Hand-off: new lead after a usage limit", { providerId: "claude-code", createdAt: now - 40 * MINUTE }));
  threads.push(row(now, "thr_q", "Why is CI slow on main?", { isUnread: true, indicator: "unread-success", createdAt: now - 25 * MINUTE }));
  threads.push(row(now, "thr_ask", "Pick a name for the new section", { hasPendingInteraction: true, indicator: "waiting-for-input", isUnread: true, providerId: "claude-code", createdAt: now - 15 * MINUTE }));
  models.thr_handoff = { model: "claude-opus-5-5", effort: "high" };
  models.thr_q = { model: "gpt-6.2-sol", effort: "medium" };
  models.thr_ask = { model: "claude-opus-5-5", effort: "medium" };
  const specs = specNames.map((name, s) => {
    const base = 100 * (s + 1);
    const tickets = Array.from({ length: 4 + (s % 3) }, (_, t) => {
      const n = base + t + 1;
      const state = t === 0 && s % 2 === 0 ? "done" : t === 1 && s === 2 ? "needs-you" : t < 3 ? "building" : "not-started";
      return { ticket: `${REPO}#${n}`, code: null, title: `Sample ticket ${n}`, state, pulls: [n + 50],
        closedAt: state === "done" ? iso(now - (s + 1) * 20 * MINUTE) : null, updatedAt: iso(now - (s + 2) * 7 * MINUTE) };
    });
    return { spec: `${REPO}#${base}`, shortName: name, url: `https://github.com/${REPO}/issues/${base}`, fleetThreadId: null, tickets };
  });
  const providers = ["codex", "claude-code", "codex", "codex", "claude-code"];
  for (let i = 0; i < agents; i++) {
    const spec = specs[i % specs.length]!;
    const live = spec.tickets.filter((t) => t.state === "building");
    const ticket = live[Math.floor(i / specs.length) % Math.max(1, live.length)] ?? spec.tickets[0]!;
    const n = Number(ticket.ticket.split("#")[1]);
    const reviewer = i % 4 === 3;
    const id = `thr_agent_${i}`;
    const providerId = providers[i % providers.length]!;
    threads.push(row(now, id, reviewer ? `Review #${n + 50} at a1b2c3d` : `#${n}: ${ticket.title}`, {
      ...running(), providerId, parentThreadId: "thr_orch", createdAt: now - (90 - i) * MINUTE,
      // Two in three agents run in the cloud (no environment or host on the row), the rest locally.
      ...(i % 3 === 2 ? {} : { environment: null, host: null }),
    }));
    models[id] = providerId === "codex" ? { model: "gpt-6.2-sol", effort: "medium" } : { model: "claude-opus-5-5", effort: "medium" };
  }
  for (let i = 0; i < 6; i++) {
    threads.push(row(now, `thr_old_${i}`, `Finished helper ${i + 1}`, { parentThreadId: "thr_orch", createdAt: now - (300 + i) * MINUTE }));
  }
  const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_sample", repositories: [REPO],
    home: { hostId: "hst_sample", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_orch", statusWriterLogin: "sample-writer" }]);
  return { now, threads, models, binding, specsText: JSON.stringify({ schema: "openwiz.specs.v2", generatedAt: iso(now - MINUTE), specs }) };
}
