// @vitest-environment jsdom
// WZ22 (#44), V5: the CLI parity test (contracts/sidebar-v3.v1.md sections 1
// and 7). Every UI action has a `wizbar` command that takes `--json`; each
// command does what its UI action does on the same rows; and `children` and
// `stats` JSON equal what the hover panel and the running line's card show for the
// same fixtures. Every row is synthetic (src/fixtures/v3.ts).
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import plugin, { t3sidebarRpcContract } from "./server";
import { v3Children, v3Now, v3Threads } from "./fixtures/v3";
import { wizbarOperationsV3 } from "./v3-types";
import { v4Now, v4SpecsFileText, v4Stats, v4Threads, wizbarOperationsV4 } from "./fixtures/v4";
import { createHash } from "node:crypto";

const v4Binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
  home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);

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

/**
 * The row menu (`RowContextMenu`) calls the host's own thread actions. Its
 * items that are WizBar actions name their `wizbar` command.
 */
const menuWizbarCommands: Record<string, string> = { Pin: "pin", Unpin: "unpin" };
/**
 * Host-owned row-menu items, outside parity by the scope ruling on #44
 * (issuecomment-6840830960), each with its existing agent route or its gap.
 * The README's "Host-owned row-menu items" lists the same.
 */
const hostOwnedMenuItems: Record<string, string> = {
  "Open in split": "UI-only: host navigation",
  "Mark read": "gap, #60: no read-state route; `wizbar settle` / `mute` handle attention on WizBar's shelves",
  "Mark unread": "gap, #60: no read-state route; `wizbar settle` / `mute` handle attention on WizBar's shelves",
  Archive: "`room-cli thread archive`",
  Delete: "UI-only: opens the host's confirmation, never a silent delete",
};

/** `threads.list` rows for the fixture, by the contract's raw-to-row table. */
const raw = (t: PluginSidebarThread) => ({
  id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, archivedAt: null, deletedAt: null,
  title: t.title, titleFallback: t.titleFallback, providerId: t.providerId, createdAt: t.createdAt, updatedAt: t.updatedAt,
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
function server(threads = v3Threads, options = async (_args: { threadId: string }): Promise<unknown> => null) {
  const rows = threads.map(raw);
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
    defaultExecutionOptions: options as never,
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
    // #156: `models` is a read-only diagnostic of the model source, no UI action of its own.
    // S1 (#169): `section` collapses a sidebar section, the agent-first route to a header click.
    expect(names.sort()).toEqual([...wizbarOperationsV4, "agents", "footer", "models", "section", "threads"].sort());
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

describe("V5: the row menu's items are WizBar commands or named host-owned exclusions", () => {
  /** Every item the row menu offers for one card, by its visible name. */
  function menuItems(threadId: string): string[] {
    renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: `synthetic-wz22-menu-${threadId}`,
      sidebarThreads: { status: "ready", threads: [...v3Threads] },
      rpc: { listLifecycle: () => ({ rows: [] }),
        cardModels: (input: unknown) => ({ source: "none",
          items: (input as { threadIds: string[] }).threadIds.map((id) => ({ threadId: id, model: null, effort: null })) }) },
    });
    fireEvent.contextMenu(document.querySelector(`[data-sidebar-thread-id="${threadId}"]`)!);
    const items = within(screen.getByRole("menu", { name: "Thread actions" })).getAllByRole("menuitem")
      .map((item) => item.textContent ?? "");
    cleanup();
    return items;
  }

  // An unread unpinned card and a read pinned card show both labels of each toggle.
  it.each(["thr_v3_failed", "thr_v3_pinned_idle"])("classifies every menu item on %s", (id) => {
    const items = menuItems(id);
    expect(items.length).toBe(5);
    const unclassified = items.filter((name) => !(name in menuWizbarCommands) && !(name in hostOwnedMenuItems));
    expect(unclassified).toEqual([]);
    expect(items.filter((name) => name in menuWizbarCommands && name in hostOwnedMenuItems)).toEqual([]);
    for (const name of items) {
      if (name in menuWizbarCommands) expect(wizbarOperationsV3).toContain(menuWizbarCommands[name]);
    }
  });
});

describe("V5: children and stats JSON equal the UI for the same fixtures", () => {
  /** What the hover panel lists for one parent: each child's id (by opening it), status, title and age. */
  async function panelChildren(parentId: string) {
    const rendered = renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: `synthetic-wz22-parity-${parentId}`,
      // E2 (#188): Unread shows only rows with something new, so every parent card is unread here.
      sidebarThreads: { status: "ready", threads: v3Threads.map((t) => ({ ...t, isUnread: true })) },
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

  // WB4-3 (#1437): the bolt's panel is gone; "N running"'s hover card shows the stats data.
  // catches: the card and `wizbar stats --json` computing different threads, specs or harness counts for the same rows.
  it("stats: the CLI's JSON is the hover card's data", async () => {
    vi.setSystemTime(v4Now);
    const sha = createHash("sha256").update(v4SpecsFileText).digest("hex");
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha, sizeBytes: 1 })) },
      threads: { list: vi.fn(async () => v4Threads.map(raw)), get: vi.fn() },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: v4Binding });
    const cli = JSON.parse((await host.harness.behavior.runCli(["stats", "--json"])).stdout!);
    expect(cli).toEqual({ ...v4Stats, unseen: { status: "unavailable", count: null, agents: [] } });
    const served = await host.harness.behavior.callRpc("specsFile", {});
    renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: "synthetic-wb4-3-parity", settings: { wizdeckFactories: v4Binding },
      sidebarThreads: { status: "ready", threads: [...v4Threads] },
      rpc: { listLifecycle: () => ({ rows: [] }), specsFile: () => served, cardModels: (input: unknown) =>
        host.harness.behavior.callRpc("cardModels", input) },
    });
    fireEvent.pointerEnter(screen.getByRole("status", { name: /^\d+ running$/ }).parentElement!);
    const card = screen.getByRole("region", { name: "Running threads" });
    await waitFor(() => expect(card.querySelectorAll("[data-spec-name]").length).toBe(2));
    expect({
      running: card.querySelector("[data-running-count]")?.textContent,
      states: card.querySelector("[data-states]")?.textContent,
      waitingOnYou: card.querySelector("[data-waiting-on-you]")?.textContent,
      machines: card.querySelector("[data-machines]")?.textContent,
      harness: [...card.querySelectorAll("[data-harness]")].map((el) => ({ providerId: el.getAttribute("data-harness"), count: Number(el.getAttribute("data-count")) })),
      threads: [...card.querySelectorAll("[data-thread]")].map((el) => ({ id: el.getAttribute("data-thread"),
        matrix: el.querySelector("[data-matrix]")?.getAttribute("data-matrix"), shortName: el.getAttribute("data-thread-spec") ?? null })),
    }).toEqual({
      running: `${cli.running.total} running`,
      states: `${cli.states.awake} awake · ${cli.states.starting} starting · ${cli.states.asleep} asleep`,
      waitingOnYou: `${cli.waitingOnYou} waiting on you`,
      machines: `${cli.running.cloud} cloud, ${cli.running.local} local, ${cli.running.unknown} unknown`,
      harness: cli.harness,
      threads: ["Sample palette", "Sample finished", null].flatMap((name) => cli.threads
        .filter((thread: { shortName: string | null }) => thread.shortName === name)
        .map(({ id, matrix, shortName }: { id: string; matrix: string; shortName: string | null }) => ({ id, matrix, shortName }))),
    });
  });
});

// S1 (#169), E2 (#188): `wizbar section <pinned|specs|yours> --collapse|--expand --json` does what a header
// click does, including the two legacy aliases.
describe("V5: section --json matches the sidebar's collapsible headers", () => {
  // catches: the CLI and a header click storing different values, the CLI's answer disagreeing with what the
  // sidebar then shows, or either legacy alias being refused or written back.
  it.each([
    ["yours", "--collapse", "[]", "yours"],
    ["unread", "--collapse", "[]", "yours"],
    ["inbox", "--collapse", "[]", "yours"],
    ["unread", "--expand", "[\"inbox\",\"pinned\"]", "yours"],
    ["pinned", "--expand", "[\"pinned\",\"inbox\"]", "pinned"],
  ] as const)(
    "%s %s from %s", async (asked, flag, start, section) => {
      const host = createFakePluginHost({ pluginId: "wizbar" });
      hosts.push(host);
      // The real handle the server declares, to read what the command stored.
      const define = vi.spyOn(host.bb.settings, "define");
      plugin(host.bb);
      const handle = define.mock.results.find((r, i) => "sectionsCollapsed" in define.mock.calls[i]![0])!.value;
      await host.harness.behavior.setSettings({ sectionsCollapsed: start });
      const result = await host.harness.behavior.runCli(["section", asked, flag, "--json"]);
      const collapsed = flag === "--collapse";
      expect({ exitCode: result.exitCode, json: JSON.parse(result.stdout!) }).toEqual({ exitCode: 0, json: { section, collapsed } });
      const stored = (await handle.get()).sectionsCollapsed;
      expect(stored).not.toContain("inbox");
      // The same change through the UI: a header click on a sidebar mounted on the same stored value.
      const updates: { values: Record<string, unknown> }[] = [];
      const name = section === "yours" ? "Yours" : "Pinned";
      renderSlot(app.threadLists[0]!, {
        activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
      }, {
        pluginId: "wizbar", settings: { sectionsCollapsed: start },
        sidebarThreads: { status: "ready", threads: [...v3Threads] },
        rpc: { listLifecycle: () => ({ rows: [] }), cardModels: (input: unknown) => ({ source: "none",
          items: (input as { threadIds: string[] }).threadIds.map((id) => ({ threadId: id, model: null, effort: null })) }) },
        sdk: { plugins: { updateSettings: (async (args: { values: Record<string, unknown> }) => {
          updates.push(args); return { values: { sectionsCollapsed: start, ...args.values } };
        }) as never } },
      });
      const header = () => within(screen.getByRole("region", { name })).getByRole("button", { name: new RegExp(`^${name}`) });
      fireEvent.click(header());
      await waitFor(() => expect(header().getAttribute("aria-expanded")).toBe(String(!collapsed)));
      expect(updates.map((u) => u.values)).toEqual([{ sectionsCollapsed: stored }]);
    });
});

describe("Yours threads CLI parity", () => {
  const threads = [
    { id: "thr_sample_background", title: "Sample background", createdAt: 1, updatedAt: 4 },
    { id: "thr_sample_planning", title: "Sample planning", titleFallback: "Synthetic release question", createdAt: 2, updatedAt: 3 },
    { id: "thr_sample_pinned", title: "Sample pinned", isPinned: true, pinnedAt: 1, createdAt: 3, updatedAt: 5 },
    { id: "thr_sample_child", title: "Sample child", createdAt: 6, updatedAt: 2, titleFallback: "Synthetic release question", parentThreadId: "thr_sample_planning" },
    { id: "thr_sample_fleet", title: "Fleet #22: Sample fleet", createdAt: 5, updatedAt: 1 },
    { id: "thr_sample_queued", title: "Sample failed child", createdAt: 4, updatedAt: 6, queuedWork: "failed" as const, parentThreadId: "thr_sample_missing" },
  ].map((sample): PluginSidebarThread => ({
    ...v3Threads[0]!, status: "idle", runtimeStatus: "idle", queuedWork: "none", indicator: "none",
    hasPendingInteraction: false, isUnread: false, pinnedAt: null, isPinned: false, pinSortKey: null,
    parentThreadId: null, titleFallback: null, providerId: "codex", lastReadAt: 1, latestAttentionAt: 1,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    ...sample, displayTitle: sample.title, href: `/projects/sample/threads/${sample.id}`,
    ...(sample.queuedWork === "failed" ? { indicator: "queued-failed" } : {}),
  }));
  const execution = async ({ threadId }: { threadId: string }) =>
    threadId === "thr_sample_background" ? null : { model: "gpt-6.2-sol", reasoningLevel: "high" };

  it.each(["", "release harness:codex model:sol effort:high status:idle"])("matches sidebar order in text and JSON for %j", async (searchQuery) => {
    const { host, run } = server(threads, execution);
    const settings = { threadsSort: "activity", threadsFilter: '{"harness":"codex"}' };
    await host.harness.behavior.setSettings(settings);
    renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery,
    }, {
      pluginId: "wizbar-yours-cli",
      settings,
      sidebarThreads: { status: "ready", threads },
      rpc: { listLifecycle: () => ({ rows: [] }), cardModels: (input: unknown) => host.harness.behavior.callRpc("cardModels", input) },
    });
    const args = searchQuery ? ["threads", "--search", searchQuery] : ["threads"];
    const { exitCode, json } = await run([...args, "--json"]);
    expect(exitCode).toBe(0);
    const yours = within(await screen.findByRole("region", { name: "Yours" }));
    const ids = json.threads.map((row: { id: string }) => row.id);
    expect(ids).toEqual(searchQuery ? ["thr_sample_planning", "thr_sample_child"]
      : ["thr_sample_queued", "thr_sample_background", "thr_sample_planning"]);
    await waitFor(() => expect(yours.getAllByRole("link").map((link) => link.getAttribute("data-sidebar-thread-id"))).toEqual(ids));
    const text = await host.harness.behavior.runCli(args);
    expect(text.exitCode).toBe(0);
    expect(text.stdout.trim().split("\n").map((line: string) => JSON.parse(line.split(":")[0]!))).toEqual(ids);
    expect(json.threads.find(({ id }: { id: string }) => id === "thr_sample_planning")).toEqual({
      id: "thr_sample_planning", title: "Sample planning", section: "yours", status: "idle", providerId: "codex",
      harness: "Codex", model: "gpt-6.2-sol", modelLabel: "Sol 6.2 · High", effort: "high", createdAt: 2, updatedAt: 3,
      unread: false, parentThreadId: null,
    });
  });

  it("ignores saved filters with --all and applies explicit flags without saving", async () => {
    const { host, run } = server(threads, execution);
    await host.harness.behavior.setSettings({ threadsSort: "status", threadsFilter: '{"status":"unread","harness":"claude-code"}' });
    expect((await run(["threads", "--json"])).json.threads).toEqual([]);
    const unfiltered = await run(["threads", "--all", "--json"]);
    expect(unfiltered.json.threads).toHaveLength(threads.length);
    expect(unfiltered.json.threads[0]).toMatchObject({ id: "thr_sample_queued", status: "failed" });
    const seen = await run(["threads", "--all", "--sort", "model", "--json"]);
    expect(seen.exitCode).toBe(0);
    expect(seen.json.threads).toHaveLength(threads.length);
    expect(seen.json.threads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "thr_sample_pinned", section: "pinned" }),
      expect.objectContaining({ id: "thr_sample_child", parentThreadId: "thr_sample_planning" }),
      expect.objectContaining({ id: "thr_sample_fleet", section: null }),
    ]));
    expect(seen.json.threads.at(-1)).toEqual(expect.objectContaining({ id: "thr_sample_background", model: null, modelLabel: null, effort: null }));
    const filtered = await run(["threads", "--all", "--status", "idle", "--model", "Sol", "--harness", "Codex", "--effort", "high", "--json"]);
    expect(filtered.json.threads.map(({ id }: { id: string }) => id)).toEqual([
      "thr_sample_child", "thr_sample_fleet", "thr_sample_pinned", "thr_sample_planning",
    ]);
    expect((await run(["threads", "--json"])).json.threads).toEqual([]);
  });

  it("finishes one batch of model reads before starting the next", async () => {
    let inFlight = 0;
    let peak = 0;
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...threads[0]!, id: `thr_sample_batch_${index}` }));
    const { run } = server(rows, async () => {
      peak = Math.max(peak, ++inFlight);
      await Promise.resolve();
      inFlight--;
      return { model: "gpt-6.2-sol", reasoningLevel: "high" };
    });
    const result = await run(["threads", "--all", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.json.threads).toHaveLength(101);
    expect(result.json.threads.every(({ model }: { model: string }) => model === "gpt-6.2-sol")).toBe(true);
    expect(peak).toBeLessThanOrEqual(100);
  });

  it.each([
    ["--sort", "other"], ["--status", "other"], ["--effort", "other"], ["--harness"],
    ["--where", "sample"], ["--all", "--all"], ["--json"], ["literal"],
  ])("returns a usage error for %j %j", async (...flags) => {
    const { run } = server(threads);
    const result = await run(["threads", ...flags, "--json"]);
    expect(result.exitCode).toBe(2);
    expect(result.json.error.code).toBe("usage");
  });
});

describe("composer footer CLI parity", () => {
  it("saves composerFooter via wizbar footer <show|pinned|all> in text and JSON and rejects invalid modes", async () => {
    const { host, run } = server();
    const pinned = await run(["footer", "pinned", "--json"]);
    expect(pinned).toEqual({ exitCode: 0, json: { composerFooter: "pinned" } });

    const allText = await host.harness.behavior.runCli(["footer", "all"]);
    expect(allText.exitCode).toBe(0);
    expect(allText.stdout.trim()).toBe("composerFooter: all");

    const show = await run(["footer", "show", "--json"]);
    expect(show).toEqual({ exitCode: 0, json: { composerFooter: "show" } });

    const saved = await run(["footer", "pinned", "--json"]);
    expect(saved).toEqual({ exitCode: 0, json: { composerFooter: "pinned" } });
    const reloaded = await host.harness.lifecycle.reload((bb) => { plugin(bb); });
    hosts.push(reloaded);
    const afterReload = await reloaded.harness.behavior.runCli(["footer", "all", "--json"]);
    expect(afterReload.exitCode).toBe(0);
    expect(JSON.parse(afterReload.stdout!)).toEqual({ composerFooter: "all" });

    const invalid = await run(["footer", "sometimes", "--json"]);
    expect(invalid.exitCode).toBe(2);
    expect(invalid.json.error.code).toBe("usage");

    const missing = await run(["footer", "--json"]);
    expect(missing.exitCode).toBe(2);
    expect(missing.json.error.code).toBe("usage");
  });
});
