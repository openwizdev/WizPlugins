// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createElement } from "react";
import { tokens } from "./specs/theme";
import { v4Now, v4SpecsFileText } from "./fixtures/v4";

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
    // E2 (#188): the list's rows have something new, so Unread shows them; a read row is set per case.
    isUnread: true,
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
    expect(within(shelf).getByRole("button", { name: "Settled 1" })).toBeDefined();
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
    ).toEqual(["Open in split", "Mark read", "Pin", "Archive", "Delete"]);
  });

  it("offers Mark unread on a read pinned row", async () => {
    render([thread({ title: "Read pinned row", isPinned: true, isUnread: false })]);
    fireEvent.contextMenu(await screen.findByText("Read pinned row"));
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    expect(within(menu).getByRole("menuitem", { name: "Mark unread" })).toBeDefined();
    expect(within(menu).queryByRole("menuitem", { name: "Mark read" })).toBeNull();
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
  // label in the column, and no two rows line up. (Plain live work, `runtime`,
  // shows its age instead since round 5 A; see "attention states".)
  it("replaces the age label with the status glyph while a workflow runs", async () => {
    render([
      thread({
        id: "thr_run",
        indicator: "workflow",
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

  // Round 5 A (#115): running work is the one state the user does NOT have to
  // act on, so its card reads like an idle one: the age, no spinner, no dot.
  // catches: the spinner back in the corner, or the age dropped for live work.
  it("shows the age, not a spinner or a dot, while work runs", async () => {
    render([
      thread({
        id: "thr_busy",
        isUnread: true,
        indicator: "runtime",
        indicatorLabel: "Thread working",
        updatedAt: Date.now(),
      }),
    ]);
    const card = (await screen.findByRole("link", { name: "A thread" })).closest("li")!;
    expect(within(card).getByText("now")).toBeDefined();
    expect(card.querySelector(".animate-spin")).toBeNull();
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
          experimental_checks: { state: "passing" },
        } as never,
      },
    });

  it("links the PR number out to the git host", async () => {
    withPr("none");
    const badge = await screen.findByRole("link", { name: "PR #412" });
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
      (await screen.findByRole("link", { name: "PR #412" })).className,
    ).toContain("destructive");
    failing.unmount();

    withPr("ready_to_merge");
    expect(
      (await screen.findByRole("link", { name: "PR #412" })).className,
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
    fireEvent.click(within(shelf).getByRole("button", { name: "Muted 1" }));
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
    await screen.findByRole("button", { name: "Muted 1" });
    expect(screen.queryByText("Write guide")).toBeNull();
  });
});

// WZ16: isolated artwork tests cannot prove a number exists in the thread list.
describe("WZ16: visible list-bottom running count", () => {
  it("keeps exactly one count below the scrolling rows, independent of search and projects", () => {
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
    expect(counter.textContent).toBe("3 running");
    // WB4-3 (#1437): the line sits in its card's wrapper, the list's last child.
    const line = counter.parentElement!;
    expect(line.parentElement).toBe(rendered.container.firstElementChild);
    expect(line).toBe(line.parentElement?.lastElementChild);
    const scrollArea = line.parentElement?.querySelector(".overflow-y-auto");
    expect(scrollArea?.contains(counter)).toBe(false);
    expect(scrollArea!.compareDocumentPosition(counter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(counter.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("working");
    fireEvent.pointerEnter(line);
    expect(screen.getByRole("region", { name: "Running threads" })).toBeDefined();
    expect(rendered.navigateCalls).toEqual([]);
    expect(rendered.sidebarActionCalls).toEqual([]);
  });

  it("shows dim zero on an empty list with an idle mark", () => {
    render([]);
    const counter = screen.getByRole("status", { name: "0 running" });
    expect(counter.textContent).toBe("0 running");
    expect(counter.style.color).toBe("var(--muted-foreground, #b7b7b7)");
    expect(counter.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("idle");
  });

  it.each(["loading", "error"] as const)("hides the number for %s despite retained rows", (status) => {
    const rendered = renderSlot(inbox, listProps, {
      pluginId: "synthetic-wz16-gap", // the plugin's gap record (WZ20) outlives this render
      sidebarThreads: { status, threads: [thread({ indicator: "runtime", runtimeStatus: "active" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    expect(rendered.container.querySelector('[aria-label$=" running"]')).toBeNull();
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
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
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
    // #172: a brief gap keeps the last count; past the 5 s hold, with the card closed, it is dropped.
    expect(screen.getByRole("status", { name: "1 running" })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole("status", { name: "1 running" })).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.useRealTimers();
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
    rendered.rpcCalls.filter((c) => c.method !== "listLifecycle" && c.method !== "pinnedOrder" && c.method !== "cardModels")
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
    fireEvent.click(within(region).getByRole("button", { name: `${shelf} 1` }));
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

// Round 5 A (#115): every shelf rule is the Specs section's olive, and a parked
// shelf reads "Settled 4" with its rule to the edge and no chevron.
describe("round 5 shelves", () => {
  const parked = [
    { threadId: "thr_set", settledAt: 200, snoozedUntil: null, snoozedAt: null },
    { threadId: "thr_snz", settledAt: null, snoozedUntil: Date.now() + 3_600_000, snoozedAt: 200 },
    { threadId: "thr_mut", settledAt: null, snoozedUntil: null, snoozedAt: null, mutedAt: 1000, muteAttentionAt: 100 },
  ];
  const busy = { indicator: "runtime", status: "active", runtimeStatus: "active" } as const;
  function renderShelves() {
    return renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", projects: [], threads: [
        thread({ id: "thr_pin", title: "Pinned one", isPinned: true, pinnedAt: 1 }),
        thread({ id: "thr_inb", title: "Inbox one" }),
        thread({ id: "thr_set", title: "Settled one" }),
        thread({ id: "thr_snz", title: "Snoozed one" }),
        thread({ id: "thr_mut", title: "Muted one", ...busy }),
      ] },
      rpc: { listLifecycle: () => ({ rows: parked }) },
    });
  }
  // The heading's rule: the last thing in the shelf's header line.
  const rule = (region: HTMLElement) => region.querySelector<HTMLElement>(":scope > h2 > span:last-child, :scope > button > span:last-child")!;

  // catches: a shelf left on the grey border rule, or on the text olive, while Specs uses its quieter rule olive.
  // E1 (#187): Settled is a quiet link with no rule now, tested in the E1 block.
  it.each(["Pinned", "Unread", "Snoozed", "Muted"])("draws the %s rule in the Specs rule olive", async (name) => {
    renderShelves();
    const region = await screen.findByRole("region", { name });
    const specs = await screen.findByRole("region", { name: "Specs" });
    const specsRule = specs.querySelector<HTMLElement>("[data-rule-line]")!;
    expect(specsRule.style.background).toBe(tokens.rule);
    expect(rule(region).style.background).toBe(specsRule.style.background);
  });

  // catches: "Settled (1)" or a chevron back on a parked shelf, or a header that no longer expands.
  it.each(["Snoozed", "Muted"])("opens a matching %s shelf only while searching", async (name) => {
    const rendered = renderShelves();
    const region = await screen.findByRole("region", { name });
    const heading = within(region).getByRole("button", { name: `${name} 1` });
    const match = () => within(region).queryByRole("link", { name: `${name} one` });
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    expect(match()).toBeNull();
    rendered.rerender(createElement(inbox.component, { ...listProps, searchQuery: `${name} one` }));
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    expect(match()).not.toBeNull();
    rendered.rerender(createElement(inbox.component, listProps));
    expect(heading.getAttribute("aria-expanded")).toBe("false");
    expect(match()).toBeNull();
    expect(rendered.sdkCalls).toEqual([]);
  });

  it.each(["Snoozed", "Muted", "Settled"])("labels %s with a faint count, no chevron, and still expands", async (name) => {
    renderShelves();
    const region = await screen.findByRole("region", { name });
    const header = within(region).getByRole("button", { name: `${name} 1` });
    expect(header.querySelector("svg")).toBeNull();
    expect(header.textContent).not.toMatch(/[()]/);
    const count = within(header).getByText("1");
    expect(count.className).toMatch(/\/50|\/40|opacity/);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(within(region).getByRole("link", { name: `${name} one` })).toBeDefined();
  });
});

// S1 (#169), E2 (#188): Pinned and Unread (the 0.5 Inbox) collapse like Settled, and the choice is kept in
// `sectionsCollapsed` (sidebar-v3.v1.md section 9). Every row is synthetic.
describe("S1: collapsible Pinned and Unread", () => {
  const rows = () => [
    thread({ id: "pin_b", title: "Pinned second", isPinned: true, pinnedAt: 50, pinSortKey: "a1", createdAt: 300 }),
    thread({ id: "pin_a", title: "Pinned first", isPinned: true, pinnedAt: 40, pinSortKey: "a0", createdAt: 100 }),
    thread({ id: "in_old", title: "Inbox older", createdAt: 10 }),
    thread({ id: "in_new", title: "Inbox newer", createdAt: 20 }),
  ];
  const ordered = (threads: PluginSidebarThread[]) => threads.filter((t) => t.isPinned)
    .sort((a, b) => ((a.pinSortKey ?? "~") < (b.pinSortKey ?? "~") ? -1 : 1)).map((t) => t.id);
  function renderSections(options: { stored?: string; searchQuery?: string; save?: (values: Record<string, unknown>) => unknown } = {}) {
    const updates: unknown[] = [];
    const settings: Record<string, string> = options.stored === undefined ? {} : { sectionsCollapsed: options.stored };
    const threads = rows();
    const rendered = renderSlot(inbox, { ...listProps, searchQuery: options.searchQuery ?? "" }, {
      pluginId: "wizbar", settings,
      sidebarThreads: { status: "ready", threads, projects: [] },
      rpc: { listLifecycle: () => ({ rows: [] }), pin: () => ({ ok: true }), unpin: () => ({ ok: true }),
        move: () => ({ ok: true }), pinnedOrder: () => ({ order: ordered(threads) }) },
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, unknown> }) => {
        updates.push(args);
        return options.save?.(args.values) ?? { values: { ...settings, ...args.values } };
      }) as never } },
    });
    return { rendered, updates };
  }
  const header = (name: "Pinned" | "Unread") =>
    within(screen.getByRole("region", { name })).getByRole("button", { name: new RegExp(`^${name}( \\d+)?$`) });
  const links = (name: "Pinned" | "Unread") => within(screen.getByRole("region", { name })).queryAllByRole("link").map((l) => l.getAttribute("aria-label"));
  const pinCalls = (rendered: { rpcCalls: { method: string; input: unknown }[] }) =>
    rendered.rpcCalls.filter((c) => ["pin", "unpin", "move"].includes(c.method)).map((c) => [c.method, c.input]);

  // catches: a header that is only text, so neither a click nor Enter/Space (a native button's keys) can collapse it,
  // or a collapse that hides the header, drops the rule, or writes any key but sectionsCollapsed.
  it.each(["Pinned", "Unread"] as const)("collapses and expands %s from its header, keeping the header, rule and count", async (name) => {
    const { updates } = renderSections();
    const button = header(name);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe(name);
    expect(links(name)).toHaveLength(2);
    fireEvent.click(button);
    await waitFor(() => expect(header(name).getAttribute("aria-expanded")).toBe("false"));
    expect(header(name).textContent).toBe(`${name} 2`);
    expect(within(header(name)).getByText("2").className).toContain("text-muted-foreground/40");
    expect(header(name).querySelector<HTMLElement>(":scope > span:last-child")!.style.background).toBe(tokens.rule);
    expect(links(name)).toEqual([]);
    expect(updates).toEqual([{ pluginId: "wizbar", values: { sectionsCollapsed: JSON.stringify([name.toLowerCase()]) } }]);
    fireEvent.click(header(name));
    await waitFor(() => expect(header(name).getAttribute("aria-expanded")).toBe("true"));
    expect(links(name)).toHaveLength(2);
    expect(updates.at(-1)).toEqual({ pluginId: "wizbar", values: { sectionsCollapsed: "[]" } });
  });

  // catches: a collapse kept only in memory, so a reload (a fresh mount on the stored value) shows the rows again.
  it("restores collapsed sections from the stored setting on a fresh mount", async () => {
    renderSections({ stored: "[\"pinned\",\"inbox\"]" });
    expect(header("Pinned").getAttribute("aria-expanded")).toBe("false");
    expect(header("Unread").getAttribute("aria-expanded")).toBe("false");
    expect(header("Pinned").textContent).toBe("Pinned 2");
    expect(header("Unread").textContent).toBe("Unread 2");
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  // catches: a refused save that snaps the section back without a word, or that leaves no notice.
  it("keeps the on-screen state and says so when the save fails", async () => {
    renderSections({ save: () => { throw new Error("refused"); } });
    fireEvent.click(header("Unread"));
    expect(await screen.findByText("Could not save the collapsed section. Try again.")).toBeTruthy();
    expect(header("Unread").getAttribute("aria-expanded")).toBe("false");
    expect(links("Unread")).toEqual([]);
  });

  // catches: a collapsed Pinned that stops being a drop zone, so a card dropped on its header is not pinned.
  it("pins a card dropped on a collapsed Pinned header, at the end", async () => {
    const { rendered } = renderSections({ stored: "[\"pinned\"]" });
    const from = screen.getByRole("link", { name: "Inbox older" });
    fireEvent.dragStart(from, { dataTransfer: { setData() {}, effectAllowed: "all" } });
    fireEvent.dragOver(header("Pinned"));
    fireEvent.drop(header("Pinned"));
    fireEvent.dragEnd(from);
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["pin", { threadId: "in_old" }], ["move", { threadId: "in_old", position: { after: "pin_b" } }],
    ]));
  });

  // catches: Alt+Up computing against only the drawn pinned cards, so a collapsed Pinned pins to the wrong place or not at all.
  it("pins with Alt+Up into a collapsed Pinned, after its last card", async () => {
    const { rendered } = renderSections({ stored: "[\"pinned\"]" });
    fireEvent.keyDown(screen.getByRole("link", { name: "Inbox older" }), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(pinCalls(rendered)).toEqual([
      ["pin", { threadId: "in_old" }], ["move", { threadId: "in_old", position: { after: "pin_b" } }],
    ]));
  });

  // #170 R1: catches an Unread with no pinned rows that has no header, so it can never be collapsed.
  it("gives an Unread-only list a native Unread header that collapses and expands", async () => {
    const updates: unknown[] = [];
    renderSlot(inbox, listProps, {
      pluginId: "wizbar", settings: {},
      sidebarThreads: { status: "ready", projects: [], threads: [thread({ id: "in_a", title: "Inbox alone" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, unknown> }) => {
        updates.push(args); return { values: args.values };
      }) as never } },
    });
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
    const button = header("Unread");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    await waitFor(() => expect(header("Unread").getAttribute("aria-expanded")).toBe("false"));
    expect(header("Unread").textContent).toBe("Unread 1");
    expect(screen.queryByRole("link", { name: "Inbox alone" })).toBeNull();
    expect(updates).toEqual([{ pluginId: "wizbar", values: { sectionsCollapsed: "[\"unread\"]" } }]);
  });

  // #170 R2: catches a header click during a search that saves a collapse the owner cannot see,
  // which then hides the section once the search clears.
  it.each(["Pinned", "Unread"] as const)("leaves %s untoggleable while a search holds it open, and writes nothing", async (name) => {
    const { rendered, updates } = renderSections({ searchQuery: name === "Pinned" ? "first" : "older" });
    const button = header(name);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("title")).toBe("Clear the search to collapse");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(header(name).getAttribute("aria-expanded")).toBe("true");
    expect(links(name)).toHaveLength(1);
    expect(updates).toEqual([]);
    // Clearing the search restores the stored choice: still expanded, and the header toggles again.
    rendered.rerender(createElement(inbox.component, { ...listProps, searchQuery: "" }));
    expect(header(name).getAttribute("aria-disabled")).toBeNull();
    expect(header(name).getAttribute("title")).toBeNull();
    expect(header(name).getAttribute("aria-expanded")).toBe("true");
    expect(links(name)).toHaveLength(2);
  });

  // catches: a search that finds nothing inside a collapsed section, or one that writes the expansion to the store.
  it("shows matches in a collapsed section while searching, without saving anything", async () => {
    const { updates } = renderSections({ stored: "[\"pinned\",\"inbox\"]", searchQuery: "older" });
    expect(header("Unread").getAttribute("aria-expanded")).toBe("true");
    expect(links("Unread")).toEqual(["Inbox older"]);
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(updates).toEqual([]);
  });
});

// E1 (#187): the sections follow `sectionsOrder` and reorder by header drag or
// Alt+Up/Alt+Down on a focused header; Settled leaves the list for one quiet
// `Settled N` link at the very bottom (sidebar-v3.v1.md section 10). Synthetic rows.
describe("E1: section order and the Settled link", () => {
  const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
    home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);
  const rows = () => [
    thread({ id: "pin_b", title: "Pinned second", isPinned: true, pinnedAt: 50, pinSortKey: "a1", createdAt: 300 }),
    thread({ id: "pin_a", title: "Pinned first", isPinned: true, pinnedAt: 40, pinSortKey: "a0", createdAt: 100 }),
    thread({ id: "in_old", title: "Inbox older", createdAt: 10 }),
    thread({ id: "in_new", title: "Inbox newer", createdAt: 20 }),
    thread({ id: "set_a", title: "Settled alpha", createdAt: 5 }),
  ];
  const settledRows = [{ threadId: "set_a", settledAt: 200, snoozedUntil: null, snoozedAt: null }];
  const ordered = (threads: PluginSidebarThread[]) => threads.filter((t) => t.isPinned)
    .sort((a, b) => ((a.pinSortKey ?? "~") < (b.pinSortKey ?? "~") ? -1 : 1)).map((t) => t.id);
  function renderOrder(options: { stored?: Record<string, string>; searchQuery?: string; specs?: boolean; hidePinned?: boolean;
    save?: (values: Record<string, unknown>) => unknown } = {}) {
    const updates: { pluginId: string; values: Record<string, unknown> }[] = [];
    const settings: Record<string, string> = { ...(options.specs ? { wizdeckFactories: binding } : {}), ...options.stored };
    const threads = rows().filter((row) => !options.hidePinned || !row.isPinned);
    const rendered = renderSlot(inbox, { ...listProps, searchQuery: options.searchQuery ?? "" }, {
      pluginId: "wizbar", settings,
      sidebarThreads: { status: "ready", threads, projects: [] },
      rpc: { listLifecycle: () => ({ rows: settledRows }), pin: () => ({ ok: true }), unpin: () => ({ ok: true }),
        move: () => ({ ok: true }), pinnedOrder: () => ({ order: ordered(threads) }),
        ...(options.specs ? { specsFile: () => ({ kind: "content", text: v4SpecsFileText }) } : {}) },
      sdk: { plugins: { updateSettings: (async (args: { pluginId: string; values: Record<string, unknown> }) => {
        updates.push(args);
        return options.save?.(args.values) ?? { values: { ...settings, ...args.values } };
      }) as never } },
    });
    return { rendered, updates };
  }
  // The three sections' regions, top to bottom.
  const sectionOrder = () => screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))
    .filter((name) => name === "Pinned" || name === "Specs" || name === "Unread");
  const header = (name: "Pinned" | "Unread") =>
    within(screen.getByRole("region", { name })).getByRole("button", { name: new RegExp(`^${name}( \\d+)?$`) });
  const specsHeader = () => within(screen.getByRole("region", { name: "Specs" })).getAllByRole("button")
    .find((b) => b.closest("h2") !== null)!;
  const grip = (name: string) => screen.getByRole("region", { name })
    .closest<HTMLElement>("[data-wizbar-section]")!.querySelector<HTMLElement>("[data-wizbar-section-grip]")!;
  const orderWrites = (updates: { values: Record<string, unknown> }[]) =>
    updates.filter((u) => "sectionsOrder" in u.values).map((u) => u.values);
  const at = (event: Event, clientY: number) => Object.defineProperty(event, "clientY", { value: clientY });

  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(v4Now); });
  afterEach(() => { vi.useRealTimers(); });

  // catches: 0.5's fixed Pinned, Inbox, Specs order kept, so the approved Pinned, Specs, Unread default never shows.
  it("draws Pinned, Specs, then the Unread place by default", async () => {
    renderOrder();
    await screen.findByRole("region", { name: "Specs" });
    expect(sectionOrder()).toEqual(["Pinned", "Specs", "Unread"]);
  });

  // catches: a stored order that is read but not drawn, or a malformed value that hides a section.
  it.each([
    ["[\"unread\",\"pinned\",\"specs\"]", ["Unread", "Pinned", "Specs"]],
    ["[\"inbox\",\"specs\"]", ["Unread", "Specs", "Pinned"]],
    ["garbage", ["Pinned", "Specs", "Unread"]],
  ])("draws the stored order %s", async (stored, expected) => {
    renderOrder({ stored: { sectionsOrder: stored } });
    await screen.findByRole("region", { name: "Specs" });
    expect(sectionOrder()).toEqual(expected);
  });

  // catches: Alt+Up/Alt+Down that only work on cards, write the wrong key, or move the section without keeping focus.
  it("moves a focused section header with Alt+Down and Alt+Up, keeping focus and saving only sectionsOrder", async () => {
    const { updates } = renderOrder({ specs: true });
    await waitFor(() => expect(specsHeader()).toBeDefined());
    header("Pinned").focus();
    fireEvent.keyDown(header("Pinned"), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(sectionOrder()).toEqual(["Specs", "Pinned", "Unread"]));
    expect(document.activeElement).toBe(header("Pinned"));
    expect(updates).toEqual([{ pluginId: "wizbar", values: { sectionsOrder: "[\"specs\",\"pinned\",\"unread\"]" } }]);
    specsHeader().focus();
    fireEvent.keyDown(specsHeader(), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(sectionOrder()).toEqual(["Pinned", "Specs", "Unread"]));
    expect(document.activeElement).toBe(specsHeader());
    fireEvent.keyDown(header("Unread"), { key: "ArrowUp", altKey: true });
    await waitFor(() => expect(sectionOrder()).toEqual(["Pinned", "Unread", "Specs"]));
    expect(orderWrites(updates).at(-1)).toEqual({ sectionsOrder: "[\"pinned\",\"unread\",\"specs\"]" });
    // A plain arrow, or Alt at the top, moves nothing and toggles nothing.
    fireEvent.keyDown(header("Pinned"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(header("Pinned"), { key: "ArrowDown" });
    expect(orderWrites(updates)).toHaveLength(3);
    expect(header("Pinned").getAttribute("aria-expanded")).toBe("true");
  });

  it("moves across the nearest rendered section while keeping empty Pinned in storage", async () => {
    const { updates } = renderOrder({ specs: true, hidePinned: true, stored: { sectionsOrder: '["specs","pinned","unread"]' } });
    await waitFor(() => expect(specsHeader()).toBeDefined());
    expect(sectionOrder()).toEqual(["Specs", "Unread"]);
    specsHeader().focus();
    fireEvent.keyDown(specsHeader(), { key: "ArrowUp", altKey: true });
    expect(orderWrites(updates)).toEqual([]);
    fireEvent.keyDown(specsHeader(), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(sectionOrder()).toEqual(["Unread", "Specs"]));
    expect(document.activeElement).toBe(specsHeader());
    expect(orderWrites(updates)).toEqual([{ sectionsOrder: '["pinned","unread","specs"]' }]);
  });

  // catches: a header that cannot be dragged, or a drop that lands on the wrong side of its target.
  it("reorders by dragging a header's grip onto another section", async () => {
    const { updates } = renderOrder();
    await screen.findByRole("region", { name: "Specs" });
    const from = grip("Unread");
    expect(from.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(from, { dataTransfer: { setData() {}, effectAllowed: "all" } });
    const onto = header("Pinned");
    fireEvent(onto, at(createEvent.dragOver(onto), 0));
    fireEvent(onto, at(createEvent.drop(onto), 0));
    fireEvent.dragEnd(from);
    await waitFor(() => expect(sectionOrder()).toEqual(["Unread", "Pinned", "Specs"]));
    expect(orderWrites(updates)).toEqual([{ sectionsOrder: "[\"unread\",\"pinned\",\"specs\"]" }]);
  });

  // catches: section reordering that breaks card drag-to-pin, or a card drop read as a section move.
  it("keeps card drag-to-pin working in a reordered list, writing no order", async () => {
    const { rendered, updates } = renderOrder({ stored: { sectionsOrder: "[\"unread\",\"specs\",\"pinned\"]" } });
    await screen.findByRole("region", { name: "Specs" });
    const from = screen.getByRole("link", { name: "Inbox older" });
    fireEvent.dragStart(from, { dataTransfer: { setData() {}, effectAllowed: "all" } });
    const onto = screen.getByRole("link", { name: "Pinned second" }).closest("li")!;
    fireEvent(onto, at(createEvent.dragOver(onto), 0));
    fireEvent(onto, at(createEvent.drop(onto), 0));
    fireEvent.dragEnd(from);
    await waitFor(() => expect(rendered.rpcCalls.filter((c) => ["pin", "move"].includes(c.method)).map((c) => [c.method, c.input])).toEqual([
      ["pin", { threadId: "in_old" }], ["move", { threadId: "in_old", position: { before: "pin_b" } }],
    ]));
    expect(orderWrites(updates)).toEqual([]);
  });

  // catches: a refused order save that snaps back silently.
  it("keeps the moved order on screen and says so when the save fails", async () => {
    renderOrder({ save: (values) => { if ("sectionsOrder" in values) throw new Error("refused"); return { values }; } });
    await screen.findByRole("region", { name: "Specs" });
    fireEvent.keyDown(header("Unread"), { key: "ArrowUp", altKey: true });
    expect(await screen.findByText("Could not save the section order. Try again.")).toBeTruthy();
    expect(sectionOrder()).toEqual(["Pinned", "Unread", "Specs"]);
  });

  it("retries the displayed section order after a refusal without moving again", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("refused")).mockImplementation((values) => ({ values }));
    const { updates } = renderOrder({ save });
    await screen.findByRole("region", { name: "Specs" });
    fireEvent.keyDown(header("Unread"), { key: "ArrowUp", altKey: true });
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(sectionOrder()).toEqual(["Pinned", "Unread", "Specs"]);
    fireEvent.click(retry);
    await waitFor(() => expect(orderWrites(updates)).toEqual([
      { sectionsOrder: '["pinned","unread","specs"]' },
      { sectionsOrder: '["pinned","unread","specs"]' },
    ]));
    expect(screen.queryByText(/Could not save the section order/)).toBeNull();
    expect(sectionOrder()).toEqual(["Pinned", "Unread", "Specs"]);
  });

  // catches: Settled still drawn as a shelf, its threads in the list, or a link that is not last.
  it("drops Settled from the list for one quiet Settled N link at the very bottom, which opens it", async () => {
    renderOrder();
    const link = await screen.findByRole("button", { name: "Settled 1" });
    // Its landmark holds only the link: no section frame, no grip, no header rule.
    const region = screen.getByRole("region", { name: "Settled" });
    expect(region.closest("[data-wizbar-section]")).toBeNull();
    expect(region.firstElementChild).toBe(link);
    expect(region.querySelector("[aria-hidden='true'].h-px")).toBeNull();
    expect(screen.queryByRole("link", { name: "Settled alpha" })).toBeNull();
    // Nothing of the list comes after it: every other region is above.
    for (const other of screen.getAllByRole("region").filter((r) => r !== region)) {
      expect(other.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(link.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(link);
    expect(link.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Settled alpha" })).toBeDefined();
  });

  // catches: a search that no longer finds settled threads once Settled left the list.
  it("finds a settled thread by search without opening the link", async () => {
    renderOrder({ searchQuery: "alpha" });
    expect(await screen.findByRole("link", { name: "Settled alpha" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Settled 1" }).getAttribute("aria-expanded")).toBe("true");
  });

  // catches: an empty Settled link left behind when nothing is settled.
  it("shows no Settled link when nothing is settled", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", projects: [], threads: [thread({ id: "in_a", title: "Inbox alone" })] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    await screen.findByRole("link", { name: "Inbox alone" });
    expect(screen.queryByRole("button", { name: /^Settled/ })).toBeNull();
  });
});

// E2 (#188): Inbox becomes Unread (sidebar-v3.v1.md section 10): only threads with something new
// for the owner that match no spec, and never a fleet wake. Every row is synthetic.
describe("E2: Unread", () => {
  const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
    home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);
  const working = { status: "active", runtimeStatus: "active", indicator: "runtime" } as const;
  const rows = () => [
    thread({ id: "u_read", title: "Sample read", displayTitle: "Sample read", isUnread: false, createdAt: 60 }),
    thread({ id: "u_new", title: "Sample new", displayTitle: "Sample new", isUnread: true, indicator: "unread-success", createdAt: 50 }),
    thread({ id: "u_wait", title: "Sample waiting", displayTitle: "Sample waiting", hasPendingInteraction: true, indicator: "waiting-for-input", createdAt: 40 }),
    thread({ id: "u_fleet", title: "Fleet #77: Sample cache", displayTitle: "Fleet #77: Sample cache", isUnread: true, createdAt: 30 }),
    thread({ id: "u_agent", title: "Builder · SC-1: Sample borrowed code", displayTitle: "Builder · SC-1: Sample borrowed code", isUnread: true, ...working, createdAt: 20 }),
    thread({ id: "u_stray", title: "Builder · ZZ-9: Sample stray", displayTitle: "Builder · ZZ-9: Sample stray", isUnread: true, ...working, createdAt: 10 }),
    thread({ id: "u_wake", title: "launch-fleet wakes example/sample-plans", displayTitle: "launch-fleet wakes example/sample-plans", isUnread: true, createdAt: 8 }),
    thread({ id: "u_loop", title: "Sample weekly loop", displayTitle: "Sample weekly loop", isUnread: true, createdAt: 6 }),
  ];
  function renderUnread(options: { stored?: string; specsFile?: () => unknown; searchQuery?: string } = {}) {
    const updates: unknown[] = [];
    const settings: Record<string, string> = { wizdeckFactories: binding, ...(options.stored === undefined ? {} : { sectionsCollapsed: options.stored }) };
    const rendered = renderSlot(inbox, { ...listProps, searchQuery: options.searchQuery ?? "" }, {
      pluginId: "wizbar", settings,
      sidebarThreads: { status: "ready", threads: rows(), projects: [] },
      rpc: { listLifecycle: () => ({ rows: [] }), specsFile: (options.specsFile ?? (() => ({ kind: "content", text: v4SpecsFileText }))) as never },
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, unknown> }) => {
        updates.push(args); return { values: { ...settings, ...args.values } };
      }) as never } },
    });
    return { rendered, updates };
  }
  // The specs file is read at its own time, so it is fresh (specs-section section 1).
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(v4Now); });
  afterEach(() => { vi.useRealTimers(); });
  const unread = () => screen.getByRole("region", { name: "Unread" });
  const header = () => within(unread()).getByRole("button", { name: /^Unread( \d+)?$/ });
  const links = () => within(unread()).queryAllByRole("link").map((l) => l.getAttribute("aria-label"));

  // catches: the 0.5 Inbox kept under a new name (every thread), a spec's running agent listed twice,
  // a fleet wake let in, or a running thread that matches no spec dropped with them.
  it("lists exactly the threads with something new that are under no spec and are not fleet wakes or fleet loop runs", async () => {
    renderUnread();
    // The bound repository's `launch-fleet wakes` loop run is out; another loop's run, unmarked by the host, stays.
    await waitFor(() => expect(links()).toEqual(["Sample new", "Sample waiting", "Builder · ZZ-9: Sample stray", "Sample weekly loop"]));
    expect(screen.queryByRole("region", { name: "Inbox" })).toBeNull();
    expect(header().textContent).toBe("Unread");
  });

  // catches: a running spec agent shown in Unread until the specs file answers, then pulled out (a flash).
  // #211 R2: Unread's filtered list waits for the first specs answer; nothing shows and then leaves.
  it("never shows a running thread before the specs file says whether it is a spec's", async () => {
    let answer: (value: unknown) => void = () => {};
    renderUnread({ specsFile: () => new Promise((resolve) => { answer = resolve; }) });
    expect(screen.queryByRole("region", { name: "Unread" })).toBeNull();
    await act(async () => answer({ kind: "content", text: v4SpecsFileText }));
    await waitFor(() => expect(links()).toEqual(["Sample new", "Sample waiting", "Builder · ZZ-9: Sample stray", "Sample weekly loop"]));
  });

  it("shares one bound Specs read and its minute refresh across the mounted sidebar and open footer", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(v4Now);
    const specsFile = vi.fn(() => ({ kind: "content", text: v4SpecsFileText }));
    await act(async () => { renderUnread({ specsFile }); });
    fireEvent.click(screen.getByRole("button", { name: /^\d+ running$/ }));
    await act(async () => {});
    expect(within(screen.getByRole("region", { name: "Running threads" })).getByText("Sample cache")).toBeDefined();
    expect(within(screen.getByRole("region", { name: "Specs" })).getByText("Sample cache")).toBeDefined();
    expect(links()).toEqual(["Sample new", "Sample waiting", "Builder · ZZ-9: Sample stray", "Sample weekly loop"]);
    expect(specsFile).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(specsFile).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(specsFile).toHaveBeenCalledTimes(2);
  });

  it("uses the wall clock for Specs skew at the real sidebar mount", async () => {
    const now = Math.floor(v4Now / 60_000) * 60_000 + 45_000;
    vi.setSystemTime(now);
    const file = JSON.parse(v4SpecsFileText);
    file.generatedAt = new Date(now + 285_000).toISOString();
    renderUnread({ specsFile: () => ({ kind: "content", text: JSON.stringify(file) }) });
    const specs = await screen.findByRole("region", { name: "Specs" });
    expect(within(specs).getByText("Sample cache")).toBeDefined();
  });

  it("filters retained Unread by the chosen project while a new binding is pending", async () => {
    const settings = { wizdeckFactories: binding };
    const projects = ["Alpha", "Beta"].map((name) => ({
      name, id: name, isPersonal: false, href: `/projects/${name}`, settingsHref: `/projects/${name}/settings`,
    }));
    const threads = projects.map(({ id }) => thread({ id, projectId: id, title: `Sample ${id} card` }));
    let respond!: (value: unknown) => void;
    const ready = { kind: "content", text: v4SpecsFileText };
    const specsFile = vi.fn(() => settings.wizdeckFactories === binding
      ? ready
      : new Promise((resolve) => { respond = resolve; }));
    const rendered = renderSlot(inbox, listProps, {
      settings, sidebarThreads: { status: "ready", threads, projects },
      rpc: { listLifecycle: () => ({ rows: [] }), specsFile: specsFile as never },
    });
    const select = (name: string) => {
      fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
      fireEvent.click(screen.getByRole("option", { name }));
    };
    await screen.findByRole("link", { name: "Sample Alpha card" });
    select("Alpha");
    expect(links()).toEqual(["Sample Alpha card"]);
    settings.wizdeckFactories = JSON.stringify([{ ...JSON.parse(binding)[0],
      home: { hostId: "hst_v4_other", rootPath: "/synthetic/other" } }]);
    rendered.rerender(createElement(inbox.component, listProps));
    await waitFor(() => expect(respond).toBeTypeOf("function"));
    expect(links()).toEqual(["Sample Alpha card"]);
    select("Beta");
    expect(screen.queryByRole("link", { name: "Sample Alpha card" })).toBeNull();
    await act(async () => respond(ready));
    expect(links()).toEqual(["Sample Beta card"]);
  });

  // catches: a search that can no longer find a read thread, a fleet wake or a spec's agent, because
  // Unread's filter still applies while searching (the 0.5 Inbox found every match).
  it("shows every matching thread while a search is active, read or not, and filters again once it clears", async () => {
    const { rendered } = renderUnread({ searchQuery: "Sample" });
    await waitFor(() => expect(links()).toEqual(["Sample read", "Sample new", "Sample waiting", "Fleet #77: Sample cache",
      "Builder · SC-1: Sample borrowed code", "Builder · ZZ-9: Sample stray", "launch-fleet wakes example/sample-plans", "Sample weekly loop"]));
    rendered.rerender(createElement(inbox.component, { ...listProps, searchQuery: "" }));
    await waitFor(() => expect(links()).toEqual(["Sample new", "Sample waiting", "Builder · ZZ-9: Sample stray", "Sample weekly loop"]));
  });

  // #211 R2: catches the plugin settings' loading read as "no factory bound", so a running spec agent and the
  // bound repository's fleet loop run flash into Unread until the binding arrives.
  it("shows no filtered row while the plugin settings load, then the settled list", async () => {
    const sdkApp = (globalThis as unknown as { __bbPluginRuntime: { pluginSdkApp: { useSettings: () => { values: unknown; isLoading: boolean } } } })
      .__bbPluginRuntime.pluginSdkApp;
    const real = sdkApp.useSettings;
    let loading = true;
    const spy = vi.spyOn(sdkApp, "useSettings").mockImplementation(() => {
      const state = real();
      return loading ? { values: undefined, isLoading: true } : state;
    });
    try {
      const seen = new Set<string>();
      const observer = new MutationObserver(() => {
        for (const link of document.querySelectorAll("a[aria-label]")) seen.add(link.getAttribute("aria-label")!);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const { rendered } = renderUnread();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(screen.queryByRole("region", { name: "Unread" })).toBeNull();
      loading = false;
      rendered.rerender(createElement(inbox.component, listProps));
      await waitFor(() => expect(links()).toEqual(["Sample new", "Sample waiting", "Builder · ZZ-9: Sample stray", "Sample weekly loop"]));
      observer.disconnect();
      expect(seen.has("Builder · SC-1: Sample borrowed code")).toBe(false);
      expect(seen.has("launch-fleet wakes example/sample-plans")).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  // #211 R1: catches a hand-back in a child of a read parent that shows nowhere: not in Unread (its parent is
  // read, and the child lives in the parent's chip) and not in a search for the child's own title.
  it("shows a read parent whose hidden child has something new, and finds the child by its own title", async () => {
    const family = [
      thread({ id: "f_parent", title: "Sample quiet parent", displayTitle: "Sample quiet parent", isUnread: false, createdAt: 70 }),
      thread({ id: "f_child", title: "Sample child hand-back", displayTitle: "Sample child hand-back", parentThreadId: "f_parent", isUnread: true, createdAt: 71 }),
    ];
    const rendered = renderSlot(inbox, listProps, {
      pluginId: "wizbar", sidebarThreads: { status: "ready", threads: family, projects: [] },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    await waitFor(() => expect(links()).toEqual(["Sample quiet parent"]));
    rendered.rerender(createElement(inbox.component, { ...listProps, searchQuery: "hand-back" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Sample child hand-back" })).toBeDefined());
  });

  // catches: a 0.5 Inbox collapse lost on upgrade, or a write that still stores `inbox`.
  it("reads a stored inbox collapse as Unread and writes unread", async () => {
    const { updates } = renderUnread({ stored: "[\"inbox\"]" });
    // Unread appears once the specs file has answered (#211 R2).
    await screen.findByRole("region", { name: "Unread" });
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(links()).toEqual([]);
    fireEvent.click(header());
    await waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("true"));
    expect(updates).toEqual([{ pluginId: "wizbar", values: { sectionsCollapsed: "[]" } }]);
    fireEvent.click(header());
    await waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("false"));
    expect(updates.at(-1)).toEqual({ pluginId: "wizbar", values: { sectionsCollapsed: "[\"unread\"]" } });
  });
});

describe("Yours and host search", () => {
  it("keeps a read top-level thread in Yours", async () => {
    render([thread({ id: "thr_sample_read", title: "Sample planning", isUnread: false })]);
    const yours = await screen.findByRole("region", { name: "Yours" });
    expect(within(yours).getByText("Sample planning")).toBeTruthy();
  });

  it.each([
    "sample purpose", "harness:codex", "model:sol", "effort:high", "status:idle",
    "SAMPLE PURPOSE harness:codex model:gpt-6.2-sol effort:high status:idle",
  ])("matches a child by %s", async (searchQuery) => {
    const parent = thread({ id: "thr_sample_parent", title: "Parent", providerId: "claude-code" });
    const child = thread({ id: "thr_sample_search", parentThreadId: parent.id, title: "Child",
      titleFallback: "Sample purpose", isUnread: false });
    renderSlot(inbox, { ...listProps, searchQuery }, {
      sidebarThreads: { status: "ready", threads: [parent, child] },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        cardModels: () => ({ source: "host", items: [{ threadId: child.id, model: "gpt-6.2-sol", effort: "high" }] }),
      },
    });
    expect(await screen.findByText("Child")).toBeTruthy();
    expect(screen.queryByText("Parent")).toBeNull();
  });
});
