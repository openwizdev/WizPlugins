// F1 (#75) fleet model and work-link reader proofs. Synthetic only.
import { describe, expect, it } from "vitest";
import { readHostInventory } from "../../factory-contract";
import { GitHubReadFailed, type GitHubReader } from "../data/github";
import { liveHealth } from "../live/health";
import { fxNow, fxPullRequests, fxRunning, fxThread, fxThreads, OTHER_SPEC, REPO, SPEC } from "./fixtures";
import { FLEET_LINK_LIMITS, loadFleetLinks } from "./links";
import { buildFleet, fleetLinkSource, specOfThread, threadsOfSpec, viewGroup, type FleetLinkSourceV1, type FleetModelV1, type RepositoryProvenanceV1 } from "./model";

/** A link read; `coverage` says which repositories' open and merged pull requests were read in full. */
const read = (pullRequests = fxPullRequests, complete = true, coverage: Record<string, { open: boolean; merged: boolean }> = { [REPO]: { open: complete, merged: true } }): FleetLinkSourceV1 =>
  ({ status: "read", pullRequests, complete, stale: false, gaps: [], coverage });
/** A fixture checkout provenance (seam only: no supported source exists in SDK 0.6.33). */
const verified: RepositoryProvenanceV1 = { status: "verified", repository: REPO };
/**
 * Per-thread repository provenance is a seam: no supported source exists in
 * SDK 0.6.33 (R1), so placement tests supply a fixture lookup explicitly.
 */
const model = (links: FleetLinkSourceV1 = read(), threads = fxThreads, host: { runningThreads?: unknown } = { runningThreads: fxRunning }, repository: RepositoryProvenanceV1 = verified): FleetModelV1 =>
  buildFleet({
    projectId: "prj_a", threads, provenance: () => repository,
    health: liveHealth({ inventory: readHostInventory(host), projectId: "prj_a", now: fxNow }), links,
  });
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
const everyRow = (m: FleetModelV1) => [...m.groups.flatMap((group) => group.rows), ...m.unplaced.rows];

describe("fleet placement", () => {
  // Bug caught: lost agents (hidden, absent-parent or not-in-list running work dropped) or shown twice.
  it("shows every active thread of the project once, hidden, absent-parent and inventory-only work included", () => {
    const m = model();
    expect(ids(everyRow(m)).sort()).toEqual(["thr_b2", "thr_b3", "thr_ghost", "thr_help", "thr_mgr", "thr_orphan", "thr_rev", "thr_titled"]);
    expect(m.threadCount).toBe(8);
    expect(m.running.count).toBe(4);
    expect(everyRow(m).filter((row) => row.running).map((row) => row.id).sort()).toEqual(["thr_b2", "thr_b3", "thr_ghost", "thr_mgr"]);
  });

  // Bug caught: placement guessed rather than taken from branch → PR → ticket → spec.
  it("places by verified links, then arranges managers, builders and helpers by parent", () => {
    const m = model();
    expect(m.groups.map((group) => group.spec)).toEqual([SPEC]);
    const rows = m.groups[0].rows;
    expect(rows.map((row) => [row.id, row.depth, row.role, row.placement])).toEqual([
      ["thr_mgr", 0, "manager", "children"],
      ["thr_b2", 1, "builder", "own"],
      ["thr_rev", 2, "helper", "parent"],
      ["thr_ghost", 2, "helper", "parent"],
      ["thr_b3", 1, "helper", "parent"],
      ["thr_help", 2, "helper", "parent"],
    ]);
    const b2 = rows[1];
    expect(b2.link.status === "linked" && [b2.link.pullRequest.ref, b2.link.tickets.map((t) => t.ref)]).toEqual([`${REPO}#52`, [`${REPO}#43`]]);
    expect(rows.find((row) => row.id === "thr_b3")?.link).toEqual({ status: "no-pull-request", branch: "room/t3", complete: true });
    expect(m.groups[0].running).toBe(4);
  });

  // Bug caught: a title that mentions a spec number places the thread under it.
  it("never parses titles: unlinked work stays unplaced, with its absent parent named", () => {
    const m = model();
    expect(ids(m.unplaced.rows)).toEqual(["thr_orphan", "thr_titled"]);
    expect(m.unplaced.rows[0]).toMatchObject({ parentNote: "absent", link: { status: "no-branch" }, role: null });
    expect(specOfThread(m, "thr_titled")).toBeNull();
    expect(specOfThread(m, "thr_help")).toBe(SPEC);
  });

  // Bug caught: work placed while links are unknown, or a total claimed with no inventory.
  it("places nothing without a work-link read and leaves running unknown without an inventory", () => {
    const m = model({ status: "not-connected" }, fxThreads, {});
    expect(m.groups).toEqual([]);
    expect(m.unplaced.rows).toHaveLength(7); // No inventory: the inventory-only running child cannot be known.
    expect(m.unplaced.rows.find((row) => row.id === "thr_b2")?.link).toEqual({ status: "links-unavailable", branch: "room/t2" });
    expect(m.running).toMatchObject({ status: "unavailable", reason: "absent", count: null });
    expect(m.unplaced.running).toBeNull();
    expect(m.unplaced.rows.every((row) => row.running === null)).toBe(true);
  });

  // Bug caught: a branch shared by two pull requests, or a PR spanning two specs, silently picks one.
  it("leaves ambiguous links unplaced", () => {
    const twin = { ...fxPullRequests[0], ref: `${REPO}#99`, url: `https://github.com/${REPO}/pull/99` };
    expect(model(read([...fxPullRequests, twin])).groups[0]?.rows.find((row) => row.id === "thr_b2")).toBeUndefined();
    const split = { ...fxPullRequests[0], tickets: [...fxPullRequests[0].tickets, { ...fxPullRequests[0].tickets[0], ref: `${REPO}#61` as const, spec: OTHER_SPEC }] };
    const m = model(read([split, ...fxPullRequests.slice(1)]));
    expect(m.unplaced.rows.find((row) => row.id === "thr_b2")?.link).toMatchObject({ status: "ambiguous" });
  });

  // Bug caught: a partial link read reported as "no pull request" fact.
  it("says a branch was not found in what was read when the read is partial", () => {
    const m = model(read(fxPullRequests, false));
    expect(everyRow(m).find((row) => row.id === "thr_b3")?.link).toEqual({ status: "no-pull-request", branch: "room/t3", complete: false });
  });

  // Bug caught (B1 seam): a spec highlight reaching only threads behind merged PRs,
  // missing its running manager, builders and helpers, or catching unplaced work.
  it("gives a spec's full placed membership for the shared highlight", () => {
    const m = model();
    expect(threadsOfSpec(m, SPEC).sort()).toEqual(["thr_b2", "thr_b3", "thr_ghost", "thr_help", "thr_mgr", "thr_rev"]);
    expect(threadsOfSpec(m, OTHER_SPEC)).toEqual([]);
    expect(threadsOfSpec(model({ status: "not-connected" }), SPEC)).toEqual([]);
  });

  // R1. Bug caught: a branch name alone links a thread to another repository's pull request.
  it("matches a branch only within the thread's verified repository, and places nothing without that provenance", () => {
    const foreign = [{ ...fxPullRequests[0], ref: "example-org/other-app#9", url: "https://github.com/example-org/other-app/pull/9" }, ...fxPullRequests.slice(1)];
    const coverage = { [REPO]: { open: true, merged: true }, "example-org/other-app": { open: true, merged: true } };
    const m = model(read(foreign, true, coverage));
    expect(everyRow(m).find((row) => row.id === "thr_b2")?.link).toEqual({ status: "no-pull-request", branch: "room/t2", complete: true });
    expect(m.groups).toEqual([]); // Nor are its manager and helpers placed through it.
    expect(threadsOfSpec(m, SPEC)).toEqual([]);

    const unknown = model(read(), fxThreads, { runningThreads: fxRunning }, { status: "unverified", reason: "no-supported-source" });
    expect(unknown.groups).toEqual([]);
    expect(everyRow(unknown).find((row) => row.id === "thr_b2")?.link).toMatchObject({ status: "repository-unverified", branch: "room/t2" });
    expect(threadsOfSpec(unknown, SPEC)).toEqual([]);
  });

  // R2. Bug caught: a single spec asserted when the pull request closes more tickets than were read.
  it("keeps the known links but withholds placement when closing tickets were truncated", () => {
    const truncated = [{ ...fxPullRequests[0], ticketsComplete: false }, ...fxPullRequests.slice(1)];
    const m = model(read(truncated));
    const b2 = everyRow(m).find((row) => row.id === "thr_b2")!;
    expect(b2.link).toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#52` }, tickets: [{ ref: `${REPO}#43` }] });
    expect(b2.spec).toBeNull();
    expect(threadsOfSpec(m, SPEC)).toEqual([]);
  });

  // R2. Bug caught: a match treated as unique while a competing pull request may sit in an unread page.
  it("withholds placement when the relevant pull requests were not all read, but not for unrelated merged bounds", () => {
    const openPartial = model(read(fxPullRequests, false, { [REPO]: { open: false, merged: true } }));
    expect(everyRow(openPartial).find((row) => row.id === "thr_b2")?.link).toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#52` } });
    expect(openPartial.groups).toEqual([]);
    // An open match is unique among open pull requests; the merged list's bound is unrelated to it.
    const mergedPartial = model(read(fxPullRequests, false, { [REPO]: { open: true, merged: false } }));
    expect(threadsOfSpec(mergedPartial, SPEC)).toContain("thr_b2");
    // A merged-only match needs both lists read in full.
    const mergedOnly = [fxThread({ id: "thr_m", title: "Merged work", branch: "room/t1", created: 9 })];
    const shipped = model(read(fxPullRequests, false, { [REPO]: { open: true, merged: false } }), mergedOnly, { runningThreads: [] });
    expect(shipped.unplaced.rows[0].link).toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#50` } });
    expect(model(read(), mergedOnly, { runningThreads: [] }).groups[0]?.rows.map((row) => row.id)).toEqual(["thr_m"]);
    // A repository whose links were never read proves nothing.
    expect(everyRow(model(read(fxPullRequests, false, {}))).find((row) => row.id === "thr_b3")?.link).toEqual({ status: "no-pull-request", branch: "room/t3", complete: false });
  });

  // R2 (final). Bug caught: an unproved row (truncated closing tickets) acquires its proved parent's spec,
  // or makes its parent a manager, and so enters specOfThread/threadsOfSpec.
  it("never gives unproved work a spec through its parent or its descendants", () => {
    const proved = { ...fxPullRequests[1], ref: `${REPO}#70`, url: `https://github.com/${REPO}/pull/70`, headRefName: "room/p1", state: "open" as const, mergedAt: null };
    const truncated = { ...fxPullRequests[0], ticketsComplete: false };
    const threads = [
      fxThread({ id: "thr_parent", title: "Proved builder", branch: "room/p1", created: 1 }),
      fxThread({ id: "thr_child", title: "Truncated child", parent: "thr_parent", branch: "room/t2", created: 2 }),
      fxThread({ id: "thr_lead", title: "Lead over unproved", branch: "room/lead", created: 3 }),
      fxThread({ id: "thr_only", title: "Only unproved child", parent: "thr_lead", branch: "room/t2", created: 4 }),
    ];
    const m = model(read([proved, truncated]), threads, { runningThreads: [] });
    const child = everyRow(m).find((row) => row.id === "thr_child")!;
    expect(child.link).toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#52` }, tickets: [{ ref: `${REPO}#43` }] });
    expect([child.spec, child.placement]).toEqual([null, "none"]);
    expect(specOfThread(m, "thr_parent")).toBe(SPEC);
    expect(specOfThread(m, "thr_child")).toBeNull();
    expect(threadsOfSpec(m, SPEC)).toEqual(["thr_parent"]);
    // Descendants: a lead whose only linked-looking child is unproved is not a manager of that spec.
    expect(specOfThread(m, "thr_lead")).toBeNull();
    expect(specOfThread(m, "thr_only")).toBeNull();
  });

  it("lists tickets closed by merged pull requests under their spec, once", () => {
    const merged = model().mergedTickets.get(SPEC) ?? [];
    expect(merged.map(({ ticket, pullRequest }) => [ticket.ref, pullRequest.ref])).toEqual([[`${REPO}#42`, `${REPO}#50`], [`${REPO}#45`, `${REPO}#51`]]);
  });
});

describe("coverage at the fleetLinkSource boundary (R2)", () => {
  // Bug caught: a link read whose coverage booleans are missing or not booleans counts as complete,
  // so an open match is placed although competing pull requests may be unread.
  it("treats missing or unknown coverage as unread, through the real fleetLinkSource", () => {
    const view = (data: Record<string, unknown>) => ({
      snapshot: { status: "ready" as const, data: { repository: REPO, pullRequests: fxPullRequests, ...data } as never, fetchedAt: fxNow, stale: false, complete: true, gaps: [] },
      detail: null, nextRefreshAt: null, refreshing: false,
    });
    const placed = (data: Record<string, unknown>) => threadsOfSpec(model(fleetLinkSource([view(data)])), SPEC).includes("thr_b2");
    expect(placed({ openComplete: true, mergedComplete: true })).toBe(true);
    for (const openComplete of [undefined, null, "true", 1]) {
      expect(placed({ openComplete, mergedComplete: true })).toBe(false);
      expect(everyRow(model(fleetLinkSource([view({ openComplete, mergedComplete: true })]))).find((row) => row.id === "thr_b2")?.link)
        .toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#52` } });
    }
    // Control: an unrelated merged bound does not unseat a verified open match.
    expect(placed({ openComplete: true, mergedComplete: false })).toBe(true);
    // A merged-only match with unknown merged coverage stays unproved.
    const mergedOnly = [fxThread({ id: "thr_m", title: "Merged work", branch: "room/t1", created: 9 })];
    for (const mergedComplete of [undefined, "yes"]) {
      const m = model(fleetLinkSource([view({ openComplete: true, mergedComplete })]), mergedOnly, { runningThreads: [] });
      expect(m.unplaced.rows[0].link).toMatchObject({ status: "unproved", pullRequest: { ref: `${REPO}#50` } });
    }
  });
});

describe("fleet search and sort", () => {
  // Bug caught: search drops a match's builder context, or sorting flattens the tree.
  it("keeps ancestors as context and reorders siblings only", () => {
    const group = model().groups[0];
    expect(ids(viewGroup(group, "#52", "plan"))).toEqual(["thr_mgr", "thr_b2", "thr_rev"]);
    expect(ids(viewGroup(group, "room/t3", "plan"))).toEqual(["thr_mgr", "thr_b3"]);
    expect(ids(viewGroup(group, "search helper", "plan"))).toEqual(["thr_mgr", "thr_b3", "thr_help"]);
    expect(ids(viewGroup(group, "", "title"))).toEqual(["thr_mgr", "thr_b2", "thr_rev", "thr_ghost", "thr_b3", "thr_help"]);
    expect(ids(viewGroup(group, "", "running"))).toEqual(["thr_mgr", "thr_b2", "thr_ghost", "thr_rev", "thr_b3", "thr_help"]);
  });

  // Bug caught: fleet sorting reorders the sidebar's stable inbox order.
  it("never reorders the host's thread list", () => {
    const threads = [...fxThreads];
    const before = ids(threads);
    viewGroup(model(read(), threads).groups[0], "", "title");
    expect(ids(threads)).toEqual(before);
  });
});

describe("work-link reader", () => {
  const raw = (number: number, branch: string, extra: Record<string, unknown> = {}) => ({
    number, url: `https://github.com/${REPO}/pull/${number}`, headRefName: branch, isCrossRepository: false, mergedAt: null,
    repository: { nameWithOwner: REPO },
    closingIssuesReferences: { pageInfo: { hasNextPage: false }, nodes: [{
      number: 43, title: "Filter chips", url: `https://github.com/${REPO}/issues/43`, state: "OPEN",
      repository: { nameWithOwner: REPO }, parent: { number: 41, repository: { nameWithOwner: REPO } },
    }] },
    ...extra,
  });
  const fakeReader = (answers: unknown[]) => {
    const calls: { query: string; variables: Record<string, unknown> }[] = [];
    const reader = { graphql: async (query: string, variables: Record<string, unknown>) => { calls.push({ query, variables }); return answers.shift(); } };
    return { reader: reader as unknown as GitHubReader, calls };
  };
  const conn = (nodes: unknown[], hasNextPage = false, endCursor: string | null = hasNextPage ? "c1" : null) => ({ pageInfo: { hasNextPage, endCursor }, nodes });

  // Bug caught: a fork's same-named branch links a thread to someone else's PR.
  it("reads branch, PR, ticket and parent spec, skipping forks", async () => {
    const { reader, calls } = fakeReader([{ repository: {
      open: conn([raw(52, "room/t2"), raw(70, "room/t3", { isCrossRepository: true })]),
      merged: conn([raw(50, "room/t1", { mergedAt: "2026-11-15T10:00:00Z" })]),
    } }]);
    const result = await loadFleetLinks({ reader, repository: REPO }, new AbortController().signal);
    expect(calls.every((call) => !/mutation/.test(call.query))).toBe(true);
    expect(result.complete).toBe(true);
    expect(result.data.pullRequests.map((pr) => [pr.ref, pr.headRefName, pr.state, pr.tickets[0].spec])).toEqual([
      [`${REPO}#52`, "room/t2", "open", SPEC], [`${REPO}#50`, "room/t1", "merged", SPEC],
    ]);
  });

  // Bug caught: a bounded read presented as complete.
  it("records gaps past its bounds", async () => {
    const { reader, calls } = fakeReader([
      { repository: { open: conn([raw(1, "a")], true), merged: conn([], true) } },
      { repository: { open: conn([raw(2, "b")], true, "c2") } },
    ]);
    const result = await loadFleetLinks({ reader, repository: REPO }, new AbortController().signal);
    expect(calls).toHaveLength(FLEET_LINK_LIMITS.openPages);
    expect(calls[1].variables).toMatchObject({ after: "c1" });
    expect(result.data.pullRequests.map((pr) => pr.headRefName)).toEqual(["a", "b"]);
    expect(result.complete).toBe(false);
    expect(result.gaps).toHaveLength(2);
  });

  // R3. Bug caught: a cancelled continuation reported as partial data instead of cancellation.
  it("still propagates cancellation during a continuation", async () => {
    const controller = new AbortController();
    const reader = { graphql: async (query: string) => {
      if (/WizDeckFleetOpen/.test(query)) { controller.abort(); throw new DOMException("aborted", "AbortError"); }
      return { repository: { open: conn([raw(1, "a")], true), merged: conn([]) } };
    } } as unknown as GitHubReader;
    await expect(loadFleetLinks({ reader, repository: REPO }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("refuses a malformed answer", async () => {
    const { reader } = fakeReader([{ repository: { open: { nodes: "x" }, merged: conn([]) } }]);
    await expect(loadFleetLinks({ reader, repository: REPO }, new AbortController().signal)).rejects.toBeInstanceOf(GitHubReadFailed);
  });

  // Bug caught: one unread repository presented as a complete link read.
  it("marks the combined read partial when a repository is unavailable", () => {
    const ok = { snapshot: { status: "ready" as const, data: { repository: REPO as `${string}/${string}`, pullRequests: fxPullRequests, openComplete: true, mergedComplete: true }, fetchedAt: fxNow, stale: false, complete: true, gaps: [] }, detail: null, nextRefreshAt: null, refreshing: false };
    const down = { snapshot: { status: "unavailable" as const, reason: "unreadable" as const, lastGood: null }, detail: "GitHub could not be read.", nextRefreshAt: null, refreshing: false };
    expect(fleetLinkSource(undefined)).toEqual({ status: "not-connected" });
    expect(fleetLinkSource([ok, down])).toMatchObject({ status: "read", complete: false, stale: true, gaps: ["GitHub could not be read."] });
    expect(fleetLinkSource([down])).toMatchObject({ status: "unavailable" });
  });
});

it("fixtures carry recent creation times that are never activity", () => {
  expect(fxThread({ id: "x", title: "x", created: 0 }).updatedAt).toBe(fxNow - 1_000);
});
