import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import {
  childrenOf,
  filterByProject,
  hideChildrenOfVisibleParents,
  parentOf,
  partitionPinned,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  sortPinned,
  threadDisplayTitle,
  unreadThreads,
  visibleInboxThreads,
} from "./inbox";
import { v3PinnedOrder, v3Threads } from "./fixtures/v3";
import { v4SpecsFile } from "./fixtures/v4";

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

describe("sortByCreatedAtDescending", () => {
  it("puts the newest thread first", () => {
    const ordered = sortByCreatedAtDescending([
      thread({ id: "a", createdAt: 1 }),
      thread({ id: "b", createdAt: 3 }),
      thread({ id: "c", createdAt: 2 }),
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  // The whole premise: activity must never move a row. Only createdAt is read,
  // so a thread that just did work keeps its place.
  it("ignores activity and update time", () => {
    const before = [
      thread({ id: "a", createdAt: 2, updatedAt: 1 }),
      thread({ id: "b", createdAt: 1, updatedAt: 999, indicator: "runtime" }),
    ];
    expect(sortByCreatedAtDescending(before).map((t) => t.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("breaks ties on id so the order is stable", () => {
    const ordered = sortByCreatedAtDescending([
      thread({ id: "b", createdAt: 5 }),
      thread({ id: "a", createdAt: 5 }),
    ]);
    expect(ordered.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const input = [
      thread({ id: "a", createdAt: 1 }),
      thread({ id: "b", createdAt: 2 }),
    ];
    sortByCreatedAtDescending(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("threadDisplayTitle", () => {
  it("prefers the title, then the fallback, then a placeholder", () => {
    expect(threadDisplayTitle(thread({ title: "Real" }))).toBe("Real");
    expect(
      threadDisplayTitle(thread({ title: null, titleFallback: "Fallback" })),
    ).toBe("Fallback");
    expect(
      threadDisplayTitle(thread({ title: null, titleFallback: null })),
    ).toBe("Untitled thread");
  });

  it("treats a whitespace-only title as absent", () => {
    expect(
      threadDisplayTitle(thread({ title: "   ", titleFallback: "Fallback" })),
    ).toBe("Fallback");
  });
});

describe("searchThreadsByTitle", () => {
  it("matches case-insensitively on the visible title", () => {
    const threads = [
      thread({ id: "a", title: "Sidebar work" }),
      thread({ id: "b", title: "Something else" }),
      thread({ id: "c", title: null, titleFallback: "sidebar fallback" }),
    ];
    expect(searchThreadsByTitle(threads, "SIDEBAR").map((t) => t.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns everything for a blank query", () => {
    const threads = [thread({ id: "a" }), thread({ id: "b" })];
    expect(searchThreadsByTitle(threads, "   ")).toHaveLength(2);
  });
});

describe("filtering", () => {
  it("scopes to one project, or to all", () => {
    const threads = [
      thread({ id: "a", projectId: "p1" }),
      thread({ id: "b", projectId: "p2" }),
    ];
    expect(filterByProject(threads, "p1").map((t) => t.id)).toEqual(["a"]);
    expect(filterByProject(threads, null)).toHaveLength(2);
  });

  it("drops archived threads", () => {
    const threads = [
      thread({ id: "a" }),
      thread({ id: "b", isArchived: true }),
    ];
    expect(visibleInboxThreads(threads).map((t) => t.id)).toEqual(["a"]);
  });

  it("splits pinned from the rest, keeping order", () => {
    const { pinned, inbox } = partitionPinned([
      thread({ id: "a" }),
      thread({ id: "b", isPinned: true }),
      thread({ id: "c" }),
    ]);
    expect(pinned.map((t) => t.id)).toEqual(["b"]);
    expect(inbox.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("child threads", () => {
  it("hides a child whose parent is on screen", () => {
    const visible = hideChildrenOfVisibleParents([
      thread({ id: "parent" }),
      thread({ id: "child", parentThreadId: "parent" }),
    ]);
    expect(visible.map((t) => t.id)).toEqual(["parent"]);
  });

  // An orphan must stay visible: hidden here AND absent from any header chip
  // would make it unreachable everywhere.
  it("keeps a child whose parent is not on screen", () => {
    const visible = hideChildrenOfVisibleParents([
      thread({ id: "child", parentThreadId: "archived-parent" }),
    ]);
    expect(visible.map((t) => t.id)).toEqual(["child"]);
  });

  it("lists a thread's children oldest first", () => {
    const children = childrenOf(
      [
        thread({ id: "parent" }),
        thread({ id: "b", parentThreadId: "parent", createdAt: 20 }),
        thread({ id: "a", parentThreadId: "parent", createdAt: 10 }),
        thread({ id: "other", parentThreadId: "elsewhere" }),
      ],
      "parent",
    );
    expect(children.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("parentOf", () => {
  // The list hides an archived parent, but the child's header must still get
  // it back — otherwise the child is a dead end.
  it("finds a parent the inbox filters out", () => {
    const parent = parentOf(
      [
        thread({ id: "parent", isArchived: true, projectId: "other" }),
        thread({ id: "child", parentThreadId: "parent" }),
      ],
      "child",
    );
    expect(parent?.id).toBe("parent");
  });

  it("returns null for a root thread", () => {
    expect(parentOf([thread({ id: "root" })], "root")).toBeNull();
  });

  it("returns null when the parent row is gone", () => {
    const threads = [thread({ id: "child", parentThreadId: "deleted" })];
    expect(parentOf(threads, "child")).toBeNull();
  });
});

// V4 (WZ21): Pinned shows the host's pinned order (sidebar-v3.v1.md section 5),
// not creation order. A creation sort would undo every reorder on the next render.
describe("sortPinned", () => {
  it("gives the contract's pinned order for the v0.3 fixtures", () => {
    expect(sortPinned(v3Threads.filter((t) => t.isPinned)).map((t) => t.id)).toEqual(v3PinnedOrder);
  });
  it("puts keyed pins first by key, then unkeyed pins newest pin first", () => {
    const rows = [
      thread({ id: "unkeyed_old", isPinned: true, pinnedAt: 10, pinSortKey: null, createdAt: 9 }),
      thread({ id: "keyed_b", isPinned: true, pinnedAt: 1, pinSortKey: "b", createdAt: 1 }),
      thread({ id: "unkeyed_new", isPinned: true, pinnedAt: 30, pinSortKey: null, createdAt: 1 }),
      thread({ id: "keyed_B", isPinned: true, pinnedAt: 2, pinSortKey: "B", createdAt: 2 }),
      thread({ id: "unkeyed_tie_b", isPinned: true, pinnedAt: 20, pinSortKey: null, createdAt: 5 }),
      thread({ id: "unkeyed_tie_a", isPinned: true, pinnedAt: 20, pinSortKey: null, createdAt: 5 }),
      thread({ id: "unkeyed_tie_newer", isPinned: true, pinnedAt: 20, pinSortKey: null, createdAt: 6 }),
    ];
    // Plain string comparison: "B" (0x42) sorts before "b" (0x62).
    expect(sortPinned(rows).map((t) => t.id)).toEqual([
      "keyed_B", "keyed_b", "unkeyed_new", "unkeyed_tie_newer", "unkeyed_tie_a", "unkeyed_tie_b", "unkeyed_old",
    ]);
  });
});

// E2 (#188): Unread (sidebar-v3.v1.md section 10). Every row is synthetic.
describe("unreadThreads", () => {
  const working = { status: "active", runtimeStatus: "active" } as const;
  // catches: an Unread that keeps every thread (the 0.5 Inbox), drops an attention marker that is not
  // `isUnread`, lists a spec's running agent twice, or lets a fleet thread in.
  it.each([
    ["a read thread", {}, false],
    ["an unread thread", { isUnread: true }, true],
    ["a thread waiting on you", { hasPendingInteraction: true, indicator: "waiting-for-input" }, true],
    ["a failed unread thread", { indicator: "unread-error" }, true],
    ["a finished unread thread", { indicator: "unread-success" }, true],
    ["a queued message that failed to send", { indicator: "queued-failed", queuedWork: "failed" }, true],
    ["a working read thread", { ...working, indicator: "runtime" }, false],
    ["an unread spec agent, running", { ...working, isUnread: true, displayTitle: "Builder · SC-1: Sample borrowed code" }, false],
    ["an unread spec agent, finished", { isUnread: true, displayTitle: "Builder · SC-1: Sample borrowed code" }, true],
    ["an unread thread matching no spec, running", { ...working, isUnread: true, displayTitle: "Builder · ZZ-9: Sample stray" }, true],
    ["an unread fleet wake", { isUnread: true, displayTitle: "Fleet #77: Sample cache" }, false],
    ["a fleet wake waiting on you", { hasPendingInteraction: true, displayTitle: "Fleet #12: Sample anything" }, false],
    ["a title only mentioning a fleet", { isUnread: true, displayTitle: "Sample notes on Fleet #77: later" }, true],
  ] as const)("%s", (_name, changes, shown) => {
    const row = thread({ id: "thr_x", ...(changes as Partial<PluginSidebarThread>) });
    expect(unreadThreads([row], v4SpecsFile, [row]).map((t) => t.id)).toEqual(shown ? ["thr_x"] : []);
  });

  // catches: a fleet loop run let into Unread because it is unread, a loop of a repository outside the
  // binding hidden, or a near-miss title (another loop, extra words) hidden by a loose match. Every row
  // carries `originKind` and `originPluginId` null, as the owner's host answers for every thread.
  it.each([
    ["launch-fleet example/sample-plans", false],
    ["launch-fleet wakes example/sample-plans", false],
    ["launch-fleet #181 example/sample-plans", false],
    ["launch-fleet wakes example/sample-tools", false],
    ["launch-fleet wakes example/elsewhere", true],
    ["launch-fleet #0181 example/sample-plans", true],
    ["launch-fleet wakes example/sample-plans now", true],
    ["Re: launch-fleet example/sample-plans", true],
    ["board publish kick", true],
    ["Skills-eval weekly mistakes", true],
  ] as const)("unread loop titled %j: shown %s", (title, shown) => {
    const row = thread({ id: "thr_x", title, displayTitle: title, isUnread: true });
    expect(row.originKind).toBeNull();
    expect(row.originPluginId).toBeNull();
    expect(unreadThreads([row], v4SpecsFile, [row], ["example/sample-plans", "example/sample-tools"]).map((t) => t.id))
      .toEqual(shown ? ["thr_x"] : []);
  });

  // catches: a spec match that ignores the fleet parent (section 3 rule 1), so a running agent under a
  // spec's fleet thread is listed in Unread as well.
  it("keeps out a running unread child of a spec's fleet thread", () => {
    const child = thread({ id: "thr_child", status: "active", runtimeStatus: "active", isUnread: true,
      parentThreadId: "thr_v4_fleet_a", displayTitle: "Builder · SC-1: Sample borrowed code" });
    expect(unreadThreads([child], v4SpecsFile, [child])).toEqual([]);
  });

  // #211 R1: catches a read parent kept out of Unread although a child hidden under it (in the parent's chip)
  // has something new, so the hand-back is unreachable; or a parent brought in by a child that Unread itself
  // would keep out (a running spec agent, a fleet loop run), or by a child of another parent.
  it.each([
    ["an unread child", { isUnread: true }, "thr_parent", true],
    ["a child waiting on you", { hasPendingInteraction: true }, "thr_parent", true],
    ["a read child", {}, "thr_parent", false],
    ["an unread running spec agent", { isUnread: true, status: "active", runtimeStatus: "active", displayTitle: "Builder · SC-1: Sample borrowed code" }, "thr_parent", false],
    ["an unread fleet loop run", { isUnread: true, displayTitle: "launch-fleet wakes example/sample-plans" }, "thr_parent", false],
    ["an unread child of another parent", { isUnread: true }, "thr_other", false],
  ] as const)("a read parent with %s hidden under it", (_name, changes, parentThreadId, shown) => {
    const parent = thread({ id: "thr_parent", displayTitle: "Sample quiet parent" });
    const child = thread({ id: "thr_child", displayTitle: "Sample child", parentThreadId, ...(changes as Partial<PluginSidebarThread>) });
    expect(unreadThreads([parent], v4SpecsFile, [parent, child], ["example/sample-plans"], [child]).map((t) => t.id))
      .toEqual(shown ? ["thr_parent"] : []);
  });

  // catches: a parent Unread keeps out (a fleet wake) brought back in by its unread child.
  it("keeps a fleet wake out even when a child under it is unread", () => {
    const parent = thread({ id: "thr_parent", displayTitle: "Fleet #77: Sample cache" });
    const child = thread({ id: "thr_child", displayTitle: "Sample child", parentThreadId: "thr_parent", isUnread: true });
    expect(unreadThreads([parent], v4SpecsFile, [parent, child], [], [child])).toEqual([]);
  });

  // catches: an unreadable specs file that hides everything, or one that drops the order it was given.
  it("matches no spec without a specs file, and keeps the order it is given", () => {
    const rows = [
      thread({ id: "b", isUnread: true, status: "active", runtimeStatus: "active", displayTitle: "Builder · SC-1: Sample borrowed code" }),
      thread({ id: "a", isUnread: true }),
      thread({ id: "c" }),
    ];
    expect(unreadThreads(rows, null, rows).map((t) => t.id)).toEqual(["b", "a"]);
  });
});
