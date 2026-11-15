// F1 (#75) fleet model and work-link reader proofs. Synthetic only.
import { describe, expect, it } from "vitest";
import { readHostInventory } from "../../factory-contract";
import { GitHubReadFailed, type GitHubReader } from "../data/github";
import { liveHealth } from "../live/health";
import { fxNow, fxPullRequests, fxRunning, fxThread, fxThreads, OTHER_SPEC, REPO, SPEC } from "./fixtures";
import { FLEET_LINK_LIMITS, loadFleetLinks } from "./links";
import { buildFleet, fleetLinkSource, specOfThread, threadsOfSpec, viewGroup, type FleetLinkSourceV1, type FleetModelV1 } from "./model";

const read = (pullRequests = fxPullRequests, complete = true): FleetLinkSourceV1 => ({ status: "read", pullRequests, complete, stale: false, gaps: [] });
const model = (links: FleetLinkSourceV1 = read(), threads = fxThreads, host: { runningThreads?: unknown } = { runningThreads: fxRunning }): FleetModelV1 =>
  buildFleet({
    projectId: "prj_a", threads,
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
    const twin = { ...fxPullRequests[0], ref: "example-org/second-app#9" };
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

  it("lists tickets closed by merged pull requests under their spec, once", () => {
    const merged = model().mergedTickets.get(SPEC) ?? [];
    expect(merged.map(({ ticket, pullRequest }) => [ticket.ref, pullRequest.ref])).toEqual([[`${REPO}#42`, `${REPO}#50`], [`${REPO}#45`, `${REPO}#51`]]);
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

  it("refuses a malformed answer", async () => {
    const { reader } = fakeReader([{ repository: { open: { nodes: "x" }, merged: conn([]) } }]);
    await expect(loadFleetLinks({ reader, repository: REPO }, new AbortController().signal)).rejects.toBeInstanceOf(GitHubReadFailed);
  });

  // Bug caught: one unread repository presented as a complete link read.
  it("marks the combined read partial when a repository is unavailable", () => {
    const ok = { snapshot: { status: "ready" as const, data: { repository: REPO as `${string}/${string}`, pullRequests: fxPullRequests }, fetchedAt: fxNow, stale: false, complete: true, gaps: [] }, detail: null, nextRefreshAt: null, refreshing: false };
    const down = { snapshot: { status: "unavailable" as const, reason: "unreadable" as const, lastGood: null }, detail: "GitHub could not be read.", nextRefreshAt: null, refreshing: false };
    expect(fleetLinkSource(undefined)).toEqual({ status: "not-connected" });
    expect(fleetLinkSource([ok, down])).toMatchObject({ status: "read", complete: false, stale: true, gaps: ["GitHub could not be read."] });
    expect(fleetLinkSource([down])).toMatchObject({ status: "unavailable" });
  });
});

it("fixtures carry recent creation times that are never activity", () => {
  expect(fxThread({ id: "x", title: "x", created: 0 }).updatedAt).toBe(fxNow - 1_000);
});
