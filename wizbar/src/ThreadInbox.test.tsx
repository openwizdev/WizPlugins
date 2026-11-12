// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

// Load through the harness so the plugin's `@get-bb/plugin-sdk/app` import binds
// to the test runtime; importing the component directly would bind it to an
// empty runtime first.
const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    displayTitle: "A thread",
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: "/projects/proj_1/threads/thr_1",
    isHidden: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

const listProps = {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
};

function render(
  threads: PluginSidebarThread[],
  projects = [
    {
      id: "proj_1",
      name: "bb",
      isPersonal: false,
      href: "/projects/proj_1",
      settingsHref: "/projects/proj_1/settings",
    },
  ],
) {
  return renderSlot(inbox, listProps, {
    sidebarThreads: { status: "ready", threads, projects },
    // The lifecycle store is the plugin's own backend; an empty one means
    // every thread is active, which is what these list tests are about.
    rpc: { listLifecycle: () => ({ rows: [] }) },
  });
}

afterEach(cleanup);

describe("t3sidebar registration", () => {
  it("registers exactly one thread list", () => {
    expect(app.threadLists).toHaveLength(1);
    expect(inbox.id).toBe("inbox");
  });
});

describe("ThreadInbox", () => {
  it("lists threads newest first", () => {
    render([
      thread({ id: "a", title: "Older", createdAt: 1 }),
      thread({ id: "b", title: "Newer", createdAt: 2 }),
    ]);
    // The anchor is a full-bleed overlay, so read the row containers.
    const titles = screen
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(titles[0]).toContain("Newer");
    expect(titles[1]).toContain("Older");
  });

  // The DOM contract behind numbered thread shortcuts and thread.next/previous.
  // A plugin that drops these attributes silently breaks nine host shortcuts.
  it("marks every row as a host shortcut target", () => {
    render([thread({ id: "thr_x" })]);
    const row = screen.getByRole("link");
    expect(row.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(row.getAttribute("data-sidebar-thread-id")).toBe("thr_x");
  });

  it("opens a thread on click and closes the mobile drawer", () => {
    let navigated = 0;
    const rendered = renderSlot(
      inbox,
      { ...listProps, onNavigate: () => (navigated += 1) },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_open" })],
          projects: [
            {
              id: "proj_1",
              name: "bb",
              isPersonal: false,
              href: "/projects/proj_1",
              settingsHref: "/projects/proj_1/settings",
            },
          ],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );
    fireEvent.click(screen.getByRole("link"));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_open",
      options: { split: false },
    });
    expect(navigated).toBe(1);
  });

  it("opens in a split with the platform modifier held", () => {
    const rendered = render([thread({ id: "thr_split" })]);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_split",
      options: { split: true },
    });
  });

  it("separates pinned threads from the inbox", () => {
    render([
      thread({ id: "a", title: "Plain" }),
      thread({ id: "b", title: "Stuck", isPinned: true }),
    ]);
    const pinned = screen.getByRole("region", { name: /pinned/i });
    expect(within(pinned).getByText("Stuck")).toBeDefined();
  });

  // The host owns the search field; the plugin only filters by what it is
  // handed, so there is deliberately no second search box to type into.
  it("filters by the host's search query", () => {
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "sidebar" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "a", title: "Sidebar work" }),
            thread({ id: "b", title: "Something else" }),
          ],
          projects: [
            {
              id: "proj_1",
              name: "bb",
              isPersonal: false,
              href: "/projects/proj_1",
              settingsHref: "/projects/proj_1/settings",
            },
          ],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Sidebar work")).toBeDefined();
  });

  it("ships no search field of its own", () => {
    render([thread({ id: "a" })]);
    expect(screen.queryByLabelText("Search threads")).toBeNull();
  });

  it("ships no new-thread button of its own", () => {
    render([thread({ id: "a" })]);
    expect(screen.queryByLabelText("New thread")).toBeNull();
  });

  it("scopes to one project", () => {
    render(
      [
        thread({ id: "a", title: "In bb", projectId: "proj_1" }),
        thread({ id: "b", title: "In other", projectId: "proj_2" }),
      ],
      [
        {
          id: "proj_1",
          name: "bb",
          isPersonal: false,
          href: "/projects/proj_1",
          settingsHref: "/projects/proj_1/settings",
        },
        {
          id: "proj_2",
          name: "other",
          isPersonal: false,
          href: "/projects/proj_2",
          settingsHref: "/projects/proj_2/settings",
        },
      ],
    );
    // Radix opens on keyboard too, which jsdom can drive without pointer
    // capture. Enter opens the list; the option click picks the scope.
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "other" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("In other")).toBeDefined();
  });

  it("hides archived threads", () => {
    render([thread({ id: "a", isArchived: true })]);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("reports an empty inbox and a fruitless search differently", () => {
    render([]);
    expect(screen.getByText("No threads yet")).toBeDefined();
  });
});

describe("parking threads", () => {
  it("moves a settled thread to the Settled shelf", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_done", title: "Finished work" })],
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_done",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    // The shelf renders once the lifecycle read resolves.
    const shelf = await screen.findByRole("region", { name: "Settled" });
    expect(within(shelf).getByText(/Settled \(1\)/)).toBeDefined();
    // Collapsed by default: parked work is out of the way, never gone.
    expect(screen.queryByText("Finished work")).toBeNull();
    fireEvent.click(within(shelf).getByRole("button"));
    expect(within(shelf).getByText("Finished work")).toBeDefined();
  });

  it("keeps a working thread out of the shelves and offers no park action", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_busy",
            title: "Still running",
            indicator: "runtime",
            activity: {
              workflows: 0,
              backgroundAgents: 0,
              backgroundCommands: 0,
              planMode: 0,
              goals: 0,
            },
          }),
        ],
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
      // Settled in the store, but still working: it must stay visible.
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_busy",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    expect(await screen.findByText("Still running")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
    expect(screen.queryByLabelText("Settle thread")).toBeNull();
  });

  it("offers settle and snooze on a parkable thread", async () => {
    render([thread({ id: "thr_park", title: "Quiet" })]);
    // Rendered (not merely accepted as props): a card whose park controls
    // never mount leaves the whole feature unreachable.
    expect(await screen.findByLabelText("Settle thread")).toBeDefined();
    expect(screen.getByLabelText("Snooze until tomorrow")).toBeDefined();
  });

  it("settles a thread when the user clicks Settle", async () => {
    let settled: string | null = null;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_park", title: "Quiet" })],
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        settle: (input) => {
          settled = (input as { threadId: string }).threadId;
          return { ok: true };
        },
      },
    });
    fireEvent.click(await screen.findByLabelText("Settle thread"));
    await waitFor(() => expect(settled).toBe("thr_park"));
  });

  it("shows the wake countdown on a snoozed row", async () => {
    const wakeAt = Date.now() + 2 * 60 * 60 * 1000;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_snz", title: "Later" })],
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_snz",
              settledAt: null,
              snoozedUntil: wakeAt,
              snoozedAt: Date.now(),
            },
          ],
        }),
      },
    });
    const shelf = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(shelf).getByRole("button"));
    expect(within(shelf).getByText("2h")).toBeDefined();
    expect(within(shelf).getByLabelText("Wake thread now")).toBeDefined();
  });
});

describe("row context menu", () => {
  it("offers the plugin's own thread actions on right-click", async () => {
    render([thread({ id: "thr_menu", title: "Right click me" })]);
    const row = await screen.findByText("Right click me");
    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    // The plugin builds this menu itself — the SDK ships no menu component —
    // so the items are this plugin's choice, backed by the action hook.
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Open in split", "Mark unread", "Pin", "Archive", "Delete"]);
  });

  it("routes deletion through the host's confirmation", async () => {
    const rendered = render([thread({ id: "thr_del", title: "Delete me" })]);
    fireEvent.contextMenu(await screen.findByText("Delete me"));
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    fireEvent.click(within(menu).getByText("Delete"));
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "requestDelete",
        threadId: "thr_del",
      }),
    );
  });
});

describe("card metadata", () => {
  it("always shows the provider glyph, even without a branch", async () => {
    render([thread({ id: "thr_p", providerId: "claude-code" })]);
    expect(await screen.findByLabelText("Claude Code")).toBeDefined();
  });

  it("falls back to a neutral glyph for an unknown provider", async () => {
    render([thread({ id: "thr_p", providerId: "some-new-agent" })]);
    expect(await screen.findByLabelText("some-new-agent")).toBeDefined();
  });

  // A personal-project thread has a machine but no worktree, so the machine
  // takes the branch's place instead of leaving the line blank.
  it("shows the machine when the thread has no branch", async () => {
    render([
      thread({
        id: "thr_m",
        host: { id: "host_1", name: "Sawyer's MacBook" },
      }),
    ]);
    expect(await screen.findByText("Sawyer's MacBook")).toBeDefined();
  });

  it("prefers the branch over the machine when both exist", async () => {
    render([
      thread({
        id: "thr_b",
        host: { id: "host_1", name: "Sawyer's MacBook" },
        environment: {
          id: "env_1",
          name: "Worktree",
          branchName: "bb/feature",
          path: null,
          isWorktree: null,
          providerId: null,
          workspaceDisplayKind: "managed-worktree",
        },
      }),
    ]);
    expect(await screen.findByText("bb/feature")).toBeDefined();
    expect(screen.queryByText("Sawyer's MacBook")).toBeNull();
  });

  // Not exactly 3h: the card's clock is quantized to the minute, so a
  // timestamp sitting on a bucket boundary legitimately reads one unit lower.
  it("shows how long ago the thread was touched", async () => {
    render([
      thread({ id: "thr_t", updatedAt: Date.now() - (3 * 3_600_000 + 60_000) }),
    ]);
    expect(await screen.findByText("3h")).toBeDefined();
  });

  // Status and age share one slot. A row that shows both puts a variable-width
  // label in the column, and no two rows line up.
  it("replaces the age label with the status glyph while work runs", async () => {
    render([
      thread({
        id: "thr_run",
        indicator: "runtime",
        indicatorLabel: "Agent is working",
        updatedAt: Date.now() - (3 * 3_600_000 + 60_000),
      }),
    ]);
    expect(await screen.findByLabelText("Agent is working")).toBeDefined();
    expect(screen.queryByText("3h")).toBeNull();
  });

  // An indicator this plugin does not know must fall through to the age label
  // rather than leave the slot blank.
  it("keeps the age label for an unrecognized indicator", async () => {
    render([
      thread({
        id: "thr_new",
        indicator: "something-bb-ships-later" as never,
        updatedAt: Date.now() - (3 * 3_600_000 + 60_000),
      }),
    ]);
    expect(await screen.findByText("3h")).toBeDefined();
  });
});

// The three states that want the user take the slot from the age label, and
// they use bb's own glyphs: the two lists sit in one window, and a user who
// switches between them should not have to learn a second vocabulary.
describe("attention states", () => {
  const states = [
    ["waiting-for-input", "Thread needs user input"],
    ["unread-error", "Unread thread failed"],
    ["unread-success", "Unread thread succeeded"],
  ] as const;

  for (const [indicator, label] of states) {
    it(`shows the ${indicator} glyph instead of the age`, async () => {
      render([
        thread({
          id: `thr_${indicator}`,
          indicator,
          indicatorLabel: label,
          updatedAt: Date.now() - (3 * 3_600_000 + 60_000),
        }),
      ]);
      expect(await screen.findByLabelText(label)).toBeDefined();
      expect(screen.queryByText("3h")).toBeNull();
    });
  }

  // Running work is the one state the user does NOT have to act on, so it gets
  // the neutral spinner and no notification dot.
  it("shows the spinner, not a dot, while work runs", async () => {
    render([
      thread({
        id: "thr_busy",
        isUnread: true,
        indicator: "runtime",
        indicatorLabel: "Thread working",
      }),
    ]);
    expect(await screen.findByLabelText("Thread working")).toBeDefined();
    expect(screen.queryByLabelText("Unread thread succeeded")).toBeNull();
  });
});

describe("pull request badge", () => {
  const withPr = (attention: string, state = "open") =>
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_pr" })],
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
      sidebarPullRequests: {
        thr_pr: {
          number: 412,
          title: "Fix the flake",
          url: "https://github.com/o/r/pull/412",
          state,
          attention,
        } as never,
      },
    });

  it("links the PR number out to the git host", async () => {
    withPr("none");
    const badge = await screen.findByRole("link", { name: "#412" });
    expect(badge.getAttribute("href")).toBe("https://github.com/o/r/pull/412");
    expect(badge.getAttribute("title")).toBe("Fix the flake");
  });

  it("shows no badge when the branch has no PR", async () => {
    render([thread({ id: "thr_nopr" })]);
    await screen.findByText("A thread");
    expect(screen.queryByRole("link", { name: /^#/ })).toBeNull();
  });

  // The attention state is bb's rolled-up "does this need you" signal, so the
  // badge can colour itself without reading checks/review/mergeability.
  it("colors the badge from the attention state", async () => {
    const failing = withPr("checks_failed");
    expect(
      (await screen.findByRole("link", { name: "#412" })).className,
    ).toContain("destructive");
    failing.unmount();

    withPr("ready_to_merge");
    expect(
      (await screen.findByRole("link", { name: "#412" })).className,
    ).toContain("success");
  });
});

// R4: mute's stricter runtime authority must not change ordinary parking.
// The existing shelf fixtures used idle runtime and missed the valid pending state.
describe("mute compatibility with ordinary pending runtime", () => {
  it.each(["settled", "snoozed"])("preserves the ordinary %s shelf", async (shelf) => {
    const now = Date.now();
    const row = { threadId: "sample-pending", settledAt: shelf === "settled" ? now : null,
      snoozedUntil: shelf === "snoozed" ? now + 3_600_000 : null,
      snoozedAt: shelf === "snoozed" ? now : null };
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [thread({ id: "sample-pending", title: "Pending setup",
        status: "pending", runtimeStatus: "pending", indicator: "none", isUnread: false })], projects: [] },
      rpc: { listLifecycle: () => ({ rows: [row] }) },
    });
    await screen.findByRole("region", { name: shelf === "settled" ? "Settled" : "Snoozed" });
    expect(screen.queryByText("Pending setup")).toBeNull();
  });
});

// N2: existing shelf tests store ordinary parks, not persistent running mute.
describe("explicit muted shelf", () => {
  const mutedRow = { threadId: "sample-mute", settledAt: null, snoozedUntil: null,
    snoozedAt: null, mutedAt: 1000, muteAttentionAt: 100 };
  const busy = () => thread({ id: "sample-mute", title: "Write guide", indicator: "runtime",
    status: "active", runtimeStatus: "active", latestAttentionAt: 200, isUnread: true });
  it("keeps running attention muted through refresh and offers navigation and explicit undo", async () => {
    let rows = [mutedRow];
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [busy()], projects: [] },
      rpc: { listLifecycle: () => ({ rows }), unmute: () => { rows = []; return { ok: true }; } },
    });
    const shelf = await screen.findByRole("region", { name: "Muted" });
    expect(screen.queryByText("Write guide")).toBeNull();
    fireEvent.click(within(shelf).getByRole("button", { name: "Muted (1)" }));
    await rendered.emitRealtime("lifecycle", {});
    fireEvent.click(within(shelf).getByRole("link", { name: "Write guide" }), { metaKey: true });
    expect(rendered.sidebarActionCalls).toContainEqual({ method: "open", threadId: "sample-mute", options: { split: true } });
    fireEvent.click(within(shelf).getByRole("button", { name: "Unmute thread" }));
    await waitFor(() => expect(rendered.rpcCalls.some((c) => c.method === "unmute")).toBe(true));
    await rendered.emitRealtime("lifecycle", {});
    await waitFor(() => expect(screen.queryByRole("region", { name: "Muted" })).toBeNull());
    expect(screen.getByText("Write guide")).toBeDefined();
  });
  // R2: attention indicators outrank runtime indicators in the host projection.
  // The earlier busy fixture always supplied a runtime indicator and missed this.
  it("R2 retains running attention on Muted using runtime authority", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [{ ...busy(), indicator: "unread-success" }], projects: [] },
      rpc: { listLifecycle: () => ({ rows: [mutedRow] }) },
    });
    await screen.findByRole("region", { name: "Muted" });
    expect(screen.queryByText("Write guide")).toBeNull();
  });
  it.each([
    { hasPendingInteraction: true, indicator: "waiting-for-input" },
    { runtimeStatus: "error", status: "error", indicator: "unread-error" },
    { indicator: "none", status: "idle", runtimeStatus: "idle", isUnread: true },
    { isPinned: true },
    { runtimeStatus: "waiting-for-host" },
    { status: "pending", runtimeStatus: "pending", indicator: "none" },
    { runtimeStatus: "future-status" as never },
    { queuedWork: "future-status" as never },
  ] as Partial<PluginSidebarThread>[])("keeps attention/pinned/unavailable work in Inbox: %j", async (changes) => {
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [{ ...busy(), ...changes }], projects: [] },
      rpc: { listLifecycle: () => ({ rows: [mutedRow] }) },
    });
    expect(await screen.findByText("Write guide")).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Muted" })).toBeNull());
  });
  it("loads a stored mute on a fresh mount", async () => {
    const options = { sidebarThreads: { status: "ready" as const, threads: [busy()], projects: [] },
      rpc: { listLifecycle: () => ({ rows: [mutedRow] }) } };
    const first = renderSlot(inbox, listProps, options);
    await screen.findByRole("region", { name: "Muted" });
    first.unmount();
    renderSlot(inbox, listProps, options);
    await screen.findByRole("button", { name: "Muted (1)" });
    expect(screen.queryByText("Write guide")).toBeNull();
  });
});

// WZ16: isolated artwork tests cannot prove a number exists in the thread list.
describe("WZ16: visible list-bottom running count", () => {
  it("keeps exactly one inert count below the scrolling rows, independent of search and projects", () => {
    const threads = [
      thread({ id: "sample-parent", indicator: "runtime", runtimeStatus: "active" }),
      thread({ id: "sample-child", parentThreadId: "sample-parent", indicator: "runtime", runtimeStatus: "active" }),
      thread({ id: "sample-hidden", projectId: "sample-other", isHidden: true, indicator: "runtime", runtimeStatus: "active" }),
    ];
    const rendered = renderSlot(inbox, { ...listProps, searchQuery: "unmatched" }, {
      sidebarThreads: { status: "ready", threads },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    const counters = screen.getAllByRole("status", { name: "3 running" });
    expect(counters).toHaveLength(1);
    const counter = counters[0]!;
    expect(counter.textContent).toBe("3");
    expect(counter.parentElement).toBe(rendered.container.firstElementChild);
    expect(counter).toBe(counter.parentElement?.lastElementChild);
    const scrollArea = counter.parentElement?.querySelector(".overflow-y-auto");
    expect(scrollArea?.contains(counter)).toBe(false);
    expect(scrollArea!.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(counter.querySelector("svg")?.style.animation).toContain("wizbar-running-spin");
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("3 running · subagents not counted yet · some threads may be unseen");
    expect(counter.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.click(counter);
    expect(rendered.navigateCalls).toEqual([]);
    expect(rendered.sidebarActionCalls).toEqual([]);
    expect(rendered.sdkCalls).toEqual([]);
    expect(rendered.rpcCalls.filter(({ method }) => method !== "listLifecycle")).toEqual([]);
    expect(counter.closest("button, a")).toBeNull();
  });

  it("shows dim zero on an empty list and stops its spinner", () => {
    render([]);
    const counter = screen.getByRole("status", { name: "0 running" });
    expect(counter.textContent).toBe("0");
    expect(counter.style.color).toBe("var(--muted-foreground)");
    expect(counter.querySelector("svg")?.style.animation).toBe("");
    fireEvent.mouseEnter(counter);
    expect(screen.getByRole("tooltip").textContent).toBe("0 running · subagents not counted yet · some threads may be unseen");
  });

  it.each(["loading", "error"] as const)("hides the number for %s despite retained rows", (status) => {
    const rendered = renderSlot(inbox, listProps, {
      pluginId: "synthetic-wz16-gap", // the plugin's gap record (WZ20) outlives this render
      sidebarThreads: { status, threads: [thread({ indicator: "runtime", runtimeStatus: "active" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    expect(rendered.container.querySelector('[aria-label$=" running"]')).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("updates list and artwork together when the registered settings switch is saved", async () => {
    const Page = app.settingsSections[0]!.component;
    const List = inbox.component;
    let settings = { footerCountEnabled: true, machineIconsEnabled: true };
    renderSlot({ component: () => <><Page /><List {...listProps} /></> }, {}, {
      pluginId: "synthetic-wz16-settings",
      settings,
      sidebarThreads: { status: "ready", threads: [thread({ indicator: "runtime", runtimeStatus: "active" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
      sdk: { plugins: { updateSettings: async ({ values }) => {
        settings = { ...settings, ...values };
        return { ok: true, schema: {}, values: settings };
      } } },
    });
    expect(screen.getAllByRole("status", { name: "1 running" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: "Footer count" }));
    await waitFor(() => expect(screen.queryAllByRole("status", { name: "1 running" })).toHaveLength(0));
    fireEvent.click(screen.getByRole("switch", { name: "Footer count" }));
    await waitFor(() => expect(screen.getAllByRole("status", { name: "1 running" })).toHaveLength(1));
  });

  it("honors the footer switch and hides stale numbers on disconnect", async () => {
    const hidden = renderSlot(inbox, listProps, {
      settings: { footerCountEnabled: false },
      sidebarThreads: { status: "ready", threads: [thread({ indicator: "runtime", runtimeStatus: "active" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    expect(screen.queryByRole("status", { name: "1 running" })).toBeNull();
    hidden.unmount();
    const connected = render([thread({ indicator: "runtime", runtimeStatus: "active" })]);
    const counter = screen.getByRole("status", { name: "1 running" });
    fireEvent.mouseEnter(counter);
    await connected.setRealtimeConnectionState("reconnecting");
    expect(screen.queryByRole("status", { name: "1 running" })).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

// V4 (WZ21): drag pins, unpins and reorders through WizBar's server operations
// (which call the host's pins); rows are always drawn as the host returns them.
describe("WZ21: drag to pin, unpin and reorder", () => {
  const rows = () => [
    thread({ id: "pin_b", title: "Pinned second", isPinned: true, pinnedAt: 50, pinSortKey: "a1", createdAt: 300 }),
    thread({ id: "pin_a", title: "Pinned first", isPinned: true, pinnedAt: 40, pinSortKey: "a0", createdAt: 100 }),
    thread({ id: "in_old", title: "Inbox older", createdAt: 10 }),
    thread({ id: "in_new", title: "Inbox newer", createdAt: 20 }),
  ];
  type Handler = (input: any) => unknown;
  // `pinnedOrder` is the server's fresh read after the calls. By default it
  // agrees with the fixed sidebar rows, i.e. the host has already redrawn them.
  const keyedOrder = (threads: PluginSidebarThread[]) => threads.filter((t) => t.isPinned)
    .sort((a, b) => ((a.pinSortKey ?? "~") < (b.pinSortKey ?? "~") ? -1 : 1)).map((t) => t.id);
  function renderDrag(threads = rows(), handlers: Record<string, Handler> = {}, lifecycleRows: unknown[] = []) {
    return renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads, projects: [] },
      rpc: { listLifecycle: () => ({ rows: lifecycleRows }), pin: () => ({ ok: true }), unpin: () => ({ ok: true }),
        move: () => ({ ok: true }), pinnedOrder: () => ({ order: keyedOrder(threads) }), ...handlers },
    });
  }
  const card = (title: string) => screen.getByRole("link", { name: title });
  const row = (title: string) => card(title).closest("li")!;
  const titlesIn = (region: HTMLElement) =>
    within(region).getAllByRole("link").map((link) => link.getAttribute("aria-label"));
  const inboxTitles = () => screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"))
    .filter((t) => t!.startsWith("Inbox"));
  // jsdom has no DragEvent, so pointer coordinates are set on the event itself.
  // Rows measure 0 px there: clientY 0 is the upper half, 10 the lower half.
  const at = (event: Event, clientY: number) => Object.defineProperty(event, "clientY", { value: clientY });
  const drag = (from: HTMLElement, to: HTMLElement, clientY = 0) => {
    fireEvent.dragStart(from, { dataTransfer: { setData() {}, effectAllowed: "all" } });
    fireEvent(to, at(createEvent.dragOver(to), clientY));
    fireEvent(to, at(createEvent.drop(to), clientY));
    fireEvent.dragEnd(from);
  };
  const pinCalls = (rendered: { rpcCalls: { method: string; input: unknown }[] }) =>
    rendered.rpcCalls.filter((c) => c.method !== "listLifecycle" && c.method !== "pinnedOrder")
      .map((c) => [c.method, c.input]);
  const reads = (rendered: { rpcCalls: { method: string }[] }) =>
    rendered.rpcCalls.filter((c) => c.method === "pinnedOrder").length;

  it("draws Pinned in the host's pinned order, not creation order", () => {
    renderDrag();
    expect(titlesIn(screen.getByRole("region", { name: "Pinned" }))).toEqual(["Pinned first", "Pinned second"]);
  });

  it("pins a card dropped into Pinned, then places it where it was dropped", async () => {
    const rendered = renderDrag();
    drag(card("Inbox older"), row("Pinned second"));
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["pin", { threadId: "in_old" }], ["move", { threadId: "in_old", position: { before: "pin_b" } }],
    ]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("unpins a pinned card dropped outside Pinned", async () => {
    const rendered = renderDrag();
    drag(card("Pinned first"), row("Inbox newer"));
    await waitFor(() => expect(pinCalls(rendered)).toEqual([["unpin", { threadId: "pin_a" }]]));
  });

  it("reorders inside Pinned, after the card when dropped on its lower half", async () => {
    const rendered = renderDrag();
    drag(card("Pinned first"), row("Pinned second"), 10);
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["move", { threadId: "pin_a", position: { after: "pin_b" } }],
    ]));
  });

  it("never re-orders the Inbox: an Inbox-to-Inbox drop calls nothing", async () => {
    const rendered = renderDrag();
    expect(inboxTitles()).toEqual(["Inbox newer", "Inbox older"]);
    drag(card("Inbox newer"), row("Inbox older"), 10);
    await Promise.resolve();
    expect(pinCalls(rendered)).toEqual([]);
    expect(inboxTitles()).toEqual(["Inbox newer", "Inbox older"]);
  });

  it("offers an empty Pinned drop target while dragging when nothing is pinned", async () => {
    const rendered = renderDrag([thread({ id: "in_only", title: "Inbox only" })]);
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
    fireEvent.dragStart(card("Inbox only"));
    const target = screen.getByRole("region", { name: "Pinned" });
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["pin", { threadId: "in_only" }], ["move", { threadId: "in_only", position: { last: true } }],
    ]));
    fireEvent.dragEnd(card("Inbox only"));
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
  });

  it.each([
    ["a failed pin", { pin: () => { throw new Error("Sample host refusal."); } }, "Inbox older", "Pinned second",
      "Pin failed: Sample host refusal.", ["pin"]],
    ["a failed placement after the pin", { move: () => { throw new Error("Sample host refusal."); } }, "Inbox older",
      "Pinned second", "Pin succeeded, but placement failed: Sample host refusal.", ["pin", "move"]],
    ["a failed unpin", { unpin: () => { throw new Error("Sample host refusal."); } }, "Pinned first", "Inbox newer",
      "Unpin failed: Sample host refusal.", ["unpin"]],
    ["a failed move", { move: () => { throw new Error("Sample host refusal."); } }, "Pinned first", "Pinned second",
      "Move failed: Sample host refusal.", ["move"]],
  ] as const)("shows %s and keeps every card where the host rows put it", async (_n, handlers, from, to, message, calls) => {
    const rendered = renderDrag(rows(), handlers);
    drag(card(from), row(to));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(pinCalls(rendered).map(([method]) => method)).toEqual(calls);
    expect(titlesIn(screen.getByRole("region", { name: "Pinned" }))).toEqual(["Pinned first", "Pinned second"]);
    expect(inboxTitles()).toEqual(["Inbox newer", "Inbox older"]);
  });

  it.each([
    ["Pinned second", "ArrowUp", [["move", { threadId: "pin_b", position: { before: "pin_a" } }]]],
    ["Pinned first", "ArrowDown", [["move", { threadId: "pin_a", position: { after: "pin_b" } }]]],
    ["Pinned second", "ArrowDown", [["unpin", { threadId: "pin_b" }]]],
    ["Inbox older", "ArrowUp", [["pin", { threadId: "in_old" }], ["move", { threadId: "in_old", position: { after: "pin_b" } }]]],
    ["Inbox older", "ArrowDown", []],
  ] as const)("moves %s with Alt+%s from the keyboard", async (title, key, expected) => {
    const rendered = renderDrag();
    fireEvent.keyDown(card(title), { key });
    fireEvent.keyDown(card(title), { key, altKey: true });
    await waitFor(() => expect(pinCalls(rendered)).toEqual(expected));
  });

  it("makes one move per action: a repeated key while a move is in flight calls nothing more", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const rendered = renderDrag(rows(), { move: async () => { await held; return { ok: true }; } });
    fireEvent.keyDown(card("Pinned second"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(card("Pinned second"), { key: "ArrowUp", altKey: true, repeat: true });
    drag(card("Inbox older"), row("Pinned first"));
    await waitFor(() => expect(pinCalls(rendered)).toHaveLength(1));
    release();
    await held;
    expect(pinCalls(rendered)).toEqual([["move", { threadId: "pin_b", position: { before: "pin_a" } }]]);
  });

  // R1: a move counts as drawn only once a fresh post-call read agrees with
  // the sidebar rows while the realtime connection is up.
  it("R1 re-reads after the calls and reports placed only when the rows agree", async () => {
    const rendered = renderDrag();
    drag(card("Inbox older"), row("Pinned second"));
    await waitFor(() => expect(reads(rendered)).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("region", { name: "Pinned" })).toBeDefined();
  });
  it("R1 reports an unknown result and the unavailable state when the rows never catch up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const rendered = renderDrag(rows(), { pinnedOrder: () => ({ order: ["in_old", "pin_a", "pin_b"] }) });
      drag(card("Inbox older"), row("Pinned first"));
      await waitFor(() => expect(reads(rendered)).toBe(1));
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect((await screen.findByRole("alert")).textContent).toBe("Pin result unknown: Thread rows are unavailable.");
      expect(screen.getByText("Could not load threads.")).toBeDefined();
      expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("R1 treats rows behind a lost realtime connection as unknown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const rendered = renderDrag();
      await rendered.setRealtimeConnectionState("reconnecting");
      drag(card("Pinned first"), row("Inbox newer"));
      await waitFor(() => expect(pinCalls(rendered)).toEqual([["unpin", { threadId: "pin_a" }]]));
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect((await screen.findByRole("alert")).textContent).toBe("Unpin result unknown: Thread rows are unavailable.");
      expect(screen.getByText("Could not load threads.")).toBeDefined();
    } finally { vi.useRealTimers(); }
  });
  it("R1 keeps the next move waiting until the post-call read has reconciled", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const rendered = renderDrag(rows(), { pinnedOrder: async () => { await held; return { order: ["pin_a", "pin_b"] }; } });
    fireEvent.keyDown(card("Pinned second"), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(reads(rendered)).toBe(1));
    fireEvent.keyDown(card("Pinned first"), { key: "ArrowDown", altKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pinCalls(rendered)).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.keyDown(card("Pinned first"), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(pinCalls(rendered)).toHaveLength(2));
  });

  // R1 round 2: a read taken before a reconnect is stale; the move gate must
  // wait for a read made on the restored connection and rows that agree.
  it("R1 never reconciles against a read taken before a reconnect", async () => {
    let hostChanged = false;
    const rendered = renderDrag(rows(), {
      pinnedOrder: () => ({ order: hostChanged ? ["pin_b", "pin_a"] : ["pin_a", "pin_b"] }),
    });
    await rendered.setRealtimeConnectionState("reconnecting");
    fireEvent.keyDown(card("Pinned second"), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(pinCalls(rendered)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    hostChanged = true;
    await rendered.setRealtimeConnectionState("connected");
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.keyDown(card("Pinned first"), { key: "ArrowDown", altKey: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pinCalls(rendered)).toHaveLength(1);
  });
  // R6: a read from before a reconnect that fails late must not end the
  // current attempt; the read on the restored connection decides.
  it("R6 ignores a late failure from a read superseded by a reconnect", async () => {
    let rejectA!: (error: Error) => void, resolveB!: (value: { order: string[] }) => void;
    let calls = 0;
    const rendered = renderDrag(rows(), { pinnedOrder: () => (++calls === 1
      ? new Promise((_, reject) => { rejectA = reject; })
      : new Promise((resolve) => { resolveB = resolve; })) });
    fireEvent.keyDown(card("Pinned second"), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(reads(rendered)).toBe(1));
    await rendered.setRealtimeConnectionState("reconnecting");
    await rendered.setRealtimeConnectionState("connected");
    await waitFor(() => expect(reads(rendered)).toBe(2));
    await act(async () => { rejectA(new Error("Sample stale read failure.")); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { resolveB({ order: ["pin_a", "pin_b"] }); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("region", { name: "Pinned" })).toBeDefined();
  });

  // R5: a read that never answers still ends in the unknown state on time.
  it("R5 bounds a never-settling read: unknown result and unavailable shelves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderDrag(rows(), { pinnedOrder: () => new Promise(() => {}) });
      drag(card("Pinned first"), row("Pinned second"), 10);
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect((await screen.findByRole("alert")).textContent).toBe("Move result unknown: Thread rows are unavailable.");
      expect(screen.getByText("Could not load threads.")).toBeDefined();
    } finally { vi.useRealTimers(); }
  });

  // R3: the drag table pins from any shelf; the keyboard must too.
  it.each([
    ["Settled", { threadId: "parked", settledAt: 200, snoozedUntil: null, snoozedAt: null }, {}],
    ["Snoozed", { threadId: "parked", settledAt: null, snoozedUntil: Date.now() + 3_600_000, snoozedAt: 200 }, {}],
    ["Muted", { threadId: "parked", settledAt: null, snoozedUntil: null, snoozedAt: null, mutedAt: 1000, muteAttentionAt: 100 },
      { indicator: "runtime", status: "active", runtimeStatus: "active" }],
  ] as const)("R3 pins an expanded %s row with Alt+Up", async (shelf, stored, extra) => {
    const rendered = renderDrag([...rows(), thread({ id: "parked", title: "Parked row", createdAt: 5, ...extra })], {}, [stored]);
    const region = await screen.findByRole("region", { name: shelf });
    fireEvent.click(within(region).getByRole("button", { name: `${shelf} (1)` }));
    fireEvent.keyDown(within(region).getByRole("link", { name: "Parked row" }), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["pin", { threadId: "parked" }], ["move", { threadId: "parked", position: { after: "pin_b" } }],
    ]));
  });

  // R4: a pinned thread is shown in Pinned even with a stored settle or snooze;
  // the stored row is kept, so an unpin returns it to its shelf.
  it.each([
    [{ threadId: "parked", settledAt: 200, snoozedUntil: null, snoozedAt: null }, "Settled"],
    [{ threadId: "parked", settledAt: null, snoozedUntil: Date.now() + 3_600_000, snoozedAt: 200 }, "Snoozed"],
  ] as const)("R4 shows a pinned thread in Pinned despite its stored %j row", async (stored, shelf) => {
    const parked = (isPinned: boolean) => thread({ id: "parked", title: "Parked row", createdAt: 5, latestAttentionAt: 100,
      isPinned, pinnedAt: isPinned ? 300 : null });
    renderDrag([parked(true)], {}, [stored]);
    await screen.findByText("Parked row");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(screen.getByRole("region", { name: "Pinned" })).getByText("Parked row")).toBeDefined();
    expect(screen.queryByRole("region", { name: shelf })).toBeNull();
    cleanup();
    renderDrag([parked(false)], {}, [stored]);
    expect(await screen.findByRole("region", { name: shelf })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
  });

  it("keeps a pinned card out of mute, settle and snooze rules it already had", () => {
    renderDrag([thread({ id: "pin_busy", title: "Pinned busy", isPinned: true, pinnedAt: 1,
      indicator: "runtime", status: "active", runtimeStatus: "active" })]);
    const pinned = screen.getByRole("region", { name: "Pinned" });
    expect(within(pinned).getByText("Pinned busy")).toBeDefined();
    expect(within(pinned).queryByRole("button", { name: /settle|snooze/i })).toBeNull();
  });
});
