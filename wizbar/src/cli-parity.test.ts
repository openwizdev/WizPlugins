// @vitest-environment jsdom
// WZ22 (#44), V5: the CLI parity test (contracts/sidebar-v3.v1.md sections 1
// and 7). Every UI action has a `wizbar` command that takes `--json`; each
// command does what its UI action does on the same rows; and `children` and
// `stats` JSON equal what the hover panel and the footer panel show for the
// same fixtures. Every row is synthetic (src/fixtures/v3.ts).
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import plugin, { t3sidebarRpcContract } from "./server";
import { v3Children, v3Now, v3Stats, v3Threads } from "./fixtures/v3";
import { wizbarOperationsV3 } from "./v3-types";

/**
 * The UI's actions, by the RPC method the sidebar calls for each (every
 * WizBar UI change and read goes through `t3sidebarRpcContract`), plus the
 * two panels that compute in the app. Each names its `wizbar` command.
 */
const uiActions = {
  settle: "settle", unsettle: "unsettle", snooze: "snooze", unsnooze: "unsnooze",
  mute: "mute", unmute: "unmute", listLifecycle: "list",
  pin: "pin", unpin: "unpin", move: "move",
  childrenPanel: "children", statsPanel: "stats",
} as const;
/** RPC methods that only feed a UI action, never an action of their own. */
const actionInputs = {
  cardModels: "model and effort for cards and the children panel; `children` JSON carries them",
  pinnedOrder: "the pinned order a drag places against; `move` JSON carries it",
} as const;

/** `threads.list` rows for the fixture, by the contract's raw-to-row table. */
const raw = (t: PluginSidebarThread) => ({
  id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, archivedAt: null, deletedAt: null,
  title: t.title, titleFallback: t.titleFallback, createdAt: t.createdAt, updatedAt: t.updatedAt,
  lastReadAt: t.lastReadAt, latestAttentionAt: t.latestAttentionAt, hasPendingInteraction: t.hasPendingInteraction,
  queuedWork: t.queuedWork, status: t.status, pinnedAt: t.pinnedAt, pinSortKey: t.pinSortKey,
  runtime: { displayStatus: t.runtimeStatus, hostReconnectGraceExpiresAt: null },
  activity: {
    activeWorkflowCount: t.activity.workflows, activeBackgroundAgentCount: t.activity.backgroundAgents,
    activeBackgroundCommandCount: t.activity.backgroundCommands, activePlanModeCount: t.activity.planMode,
    activeGoalCount: t.activity.goals,
  },
  environmentId: t.environment?.id ?? null, environmentBranchName: t.environment?.branchName ?? null,
  environmentProviderId: t.environment?.providerId ?? null, environmentHostId: t.host?.id ?? null,
});

const hosts: FakePluginHost[] = [];
/** A server on the fixture rows, with host pins that record each call. */
function server() {
  const rows = v3Threads.map(raw);
  const byId = (threadId: string) => {
    const row = rows.find((r) => r.id === threadId);
    if (!row) throw Object.assign(new Error("not found"), { status: 404 });
    return row;
  };
  const hostCalls: unknown[] = [];
  const record = (method: string) => vi.fn(async ({ signal: _signal, ...args }: { threadId: string; signal?: AbortSignal }) => {
    hostCalls.push([method, args]);
    const row = byId(args.threadId);
    if (method === "pin") row.pinnedAt ??= v3Now;
    if (method === "unpin") { row.pinnedAt = null; row.pinSortKey = null; }
    return row;
  });
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: { threads: {
    get: vi.fn(async ({ threadId }: { threadId: string }) => byId(threadId)),
    list: vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => rows.slice(offset, offset + 100)),
    pin: record("pin"), unpin: record("unpin"), reorderPinned: record("reorderPinned"),
  } } });
  hosts.push(host);
  plugin(host.bb);
  const run = async (argv: string[]) => {
    const result = await host.harness.behavior.runCli(argv);
    return { exitCode: result.exitCode, json: JSON.parse(result.stdout) };
  };
  const shelf = async (id: string) => (await run(["list", id, "--json"])).json;
  return { host, run, shelf, hostCalls, rpc: (method: string, input: unknown) => host.harness.behavior.callRpc(method, input) };
}

const until = Date.parse("2026-11-13T09:00:00Z");
/** One case per UI action: what the UI calls, and the same thing on the CLI. */
const cases: Record<keyof typeof uiActions, { argv: string[]; rpc?: [string, unknown]; before?: string[][] }> = {
  settle: { argv: ["thr_v3_finished_today"], rpc: ["settle", { threadId: "thr_v3_finished_today" }] },
  unsettle: { before: [["settle", "thr_v3_finished_today"]], argv: ["thr_v3_finished_today"], rpc: ["unsettle", { threadId: "thr_v3_finished_today" }] },
  snooze: { argv: ["thr_v3_finished_today", "--until", new Date(until).toISOString()], rpc: ["snooze", { threadId: "thr_v3_finished_today", snoozedUntil: until }] },
  unsnooze: { before: [["snooze", "thr_v3_finished_today", "--until", "tomorrow"]], argv: ["thr_v3_finished_today"], rpc: ["unsnooze", { threadId: "thr_v3_finished_today" }] },
  mute: { argv: ["thr_v3_child_working"], rpc: ["mute", { threadId: "thr_v3_child_working" }] },
  unmute: { before: [["mute", "thr_v3_child_working"]], argv: ["thr_v3_child_working"], rpc: ["unmute", { threadId: "thr_v3_child_working" }] },
  listLifecycle: { argv: ["thr_v3_pinned_idle"] },
  pin: { argv: ["thr_v3_starting"], rpc: ["pin", { threadId: "thr_v3_starting" }] },
  unpin: { argv: ["thr_v3_pinned_idle"], rpc: ["unpin", { threadId: "thr_v3_pinned_idle" }] },
  move: { argv: ["thr_v3_parent_one", "--first"], rpc: ["move", { threadId: "thr_v3_parent_one", position: { first: true } }] },
  childrenPanel: { argv: ["thr_v3_parent_many"] },
  statsPanel: { argv: [] },
};

beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(v3Now);
  Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
});
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.useRealTimers(); vi.unstubAllEnvs();
});

describe("V5: every UI action has a wizbar command with --json", () => {
  it("classifies every RPC method the UI can call", () => {
    expect(Object.keys(t3sidebarRpcContract).sort()).toEqual(
      [...Object.keys(uiActions).filter((k) => k in t3sidebarRpcContract), ...Object.keys(actionInputs)].sort());
  });

  it("registers each action's command, and every command's usage offers --json", () => {
    const cli = server().host.harness.registrations.cli!;
    const names = cli.commands.map((c) => c.name);
    expect(names.sort()).toEqual([...wizbarOperationsV3].sort());
    expect(names).toEqual(expect.arrayContaining(Object.values(uiActions)));
    for (const command of cli.commands) expect(command.usage, command.name).toMatch(/\[--json\]$/);
  });

  it.each(Object.entries(cases))("%s: the command answers in JSON and does what the UI does", async (action, c) => {
    const command = uiActions[action as keyof typeof uiActions];
    const cli = server();
    for (const step of c.before ?? []) expect((await cli.run([...step, "--json"])).exitCode).toBe(0);
    const result = await cli.run([command, ...c.argv, "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.json).not.toHaveProperty("error");
    if (!c.rpc) return;
    // The same action through the UI's RPC, on a second server with the same rows.
    const ui = server();
    for (const step of c.before ?? []) expect((await ui.run([...step, "--json"])).exitCode).toBe(0);
    await ui.rpc(...c.rpc);
    const id = c.argv[0]!;
    expect(await cli.shelf(id)).toEqual(await ui.shelf(id));
    expect(cli.hostCalls).toEqual(ui.hostCalls);
    if (["pin", "unpin", "move"].includes(command)) expect(cli.hostCalls).not.toEqual([]);
  });
});

const app = await loadPluginApp(() => import("../app"));

describe("V5: children and stats JSON equal the UI for the same fixtures", () => {
  /** What the hover panel lists for one parent: each child's id (by opening it), status, title and age. */
  async function panelChildren(parentId: string) {
    const rendered = renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: `synthetic-wz22-parity-${parentId}`,
      sidebarThreads: { status: "ready", threads: [...v3Threads] },
      rpc: { listLifecycle: () => ({ rows: [] }),
        cardModels: (input: unknown) => ({ source: "none",
          items: (input as { threadIds: string[] }).threadIds.map((threadId) => ({ threadId, model: null, effort: null })) }) },
    });
    const card = document.querySelector(`[data-sidebar-thread-id="${parentId}"]`)?.parentElement;
    expect(card, `${parentId} card`).toBeInstanceOf(HTMLElement);
    const chip = within(card!).queryByRole("button", { name: /^\d+ child(ren)?$/ });
    if (!chip) return [];
    const listed: { id: string; label: string | null }[] = [];
    for (let i = 0; ; i++) {
      fireEvent.pointerEnter(chip);
      const rows = within(await screen.findByRole("dialog")).getAllByRole("button", { name: /^Open child/ });
      if (i >= rows.length) break;
      const before = rendered.sidebarActionCalls.length;
      fireEvent.click(rows[i]!);
      listed.push({ id: rendered.sidebarActionCalls[before]!.threadId!, label: rows[i]!.getAttribute("aria-label") });
    }
    return listed;
  }

  it.each(Object.keys(v3Children))("children %s: the CLI's list is the panel's list", async (id) => {
    const cli = await server().run(["children", id, "--json"]);
    expect(cli).toEqual({ exitCode: 0, json: v3Children[id] });
    const ui = await panelChildren(id);
    // The panel shows age as `relativeTimeLabel`; the fixture's ages are worked by hand.
    const ages: Record<string, string> = {
      thr_v3_child_working: "now", thr_v3_child_waiting: "2m", thr_v3_child_finished: "8m", thr_v3_child_local: "1m",
    };
    expect(ui).toEqual(cli.json.children.map((c: { id: string; title: string; status: string }) =>
      ({ id: c.id, label: `Open child: ${c.title}, ${c.status}, ${ages[c.id]}` })));
  });

  it("stats: the CLI's numbers are the footer panel's", async () => {
    const cli = await server().run(["stats", "--json"]);
    expect(cli).toEqual({ exitCode: 0, json: v3Stats });
    const item = app.experimentalSidebarFooterItems.find(({ id }) => id === "stats");
    expect(item?.kind).toBe("disclosure");
    if (item?.kind !== "disclosure") return;
    renderSlot({ component: item.component }, { dismiss() {} }, { sidebarThreads: { status: "ready", threads: [...v3Threads] } });
    const lines = [...screen.getByRole("region", { name: "WizBar stats" }).querySelectorAll("p")].map((p) => p.textContent ?? "");
    const number = (pattern: RegExp) => {
      const found = lines.join("\n").match(pattern);
      return found ? Number(found[1]) : undefined;
    };
    const panel = {
      running: {
        total: number(/^(\d+) running/m), topLevel: number(/(\d+) top-level/), children: number(/(\d+) children/),
        cloud: number(/(\d+) cloud/), local: number(/(\d+) local/), unknown: number(/(\d+) unknown/),
      },
      waitingOnYou: number(/^Waiting on you: (\d+)$/m),
      finishedToday: lines.includes("Finished today: not available yet") ? { source: "none", count: null } : undefined,
      coverage: lines.includes("subagents not counted yet · some threads may be unseen")
        ? { scope: "observable-sidebar", subagents: "not-counted", unseen: "possible" } : undefined,
    };
    const { running, waitingOnYou, finishedToday, coverage } = cli.json;
    expect(panel).toEqual({ running, waitingOnYou, finishedToday, coverage });
  });
});
