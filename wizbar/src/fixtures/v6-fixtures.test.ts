import { describe, expect, it } from "vitest";
import {
  breathPeriodMsV6, quietAfterMsV6, specsSortsV6, v6Activity, v6Agents, v6DotMotion, v6Now, v6QuietSplit, v6SortOrders,
  v6SpecsFile, v6SpecsFileText, v6Store050,
} from "./v6";

// C0 (#182): S1, S2, A1 and V test their sorts, the Quiet split, the activity
// look and the 0.5.0 reload on these fixtures. A fixture that silently lost a
// case (no exactly-3-days spec, two sorts giving one order, a 0.5.0 key left
// at its default) would let those tickets pass without exercising it. These
// checks read only the fixtures and the contract's numbers, never 0.6 code.

const DAY = 24 * 60 * 60_000;
const visible = v6SpecsFile.specs.filter((spec) => spec.tickets.length > 0).map((spec) => spec.spec);
const byKey = new Map(v6Activity.map((row) => [row.spec, row]));

describe("C0: synthetic 0.6 fixtures cover the contract's cases", () => {
  it("uses only made-up repositories, ids and titles, in a closed v2 file", () => {
    const parsed = JSON.parse(v6SpecsFileText) as typeof v6SpecsFile;
    expect(parsed).toEqual(v6SpecsFile);
    expect(parsed.schema).toBe("openwiz.specs.v2");
    for (const spec of parsed.specs) {
      expect(spec.spec).toMatch(/^example\/sample-[a-z]+#[1-9][0-9]*$/);
      expect(spec.shortName).toMatch(/^Sample /);
      for (const ticket of spec.tickets) {
        expect(Object.keys(ticket).every((key) => ["ticket", "code", "title", "state", "closedAt", "updatedAt"].includes(key))).toBe(true);
        expect(ticket.updatedAt ?? "2026-01-01T00:00:00.000Z").toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      }
    }
    for (const agent of Object.values(v6Agents).flat()) expect(agent.threadId).toMatch(/^thr_v6_[a-z_]+$/);
  });

  it("has one activity case for every visible spec, and none for the empty one", () => {
    expect(v6Activity.map((row) => row.spec)).toEqual(visible);
    expect(v6SpecsFile.specs.some((spec) => spec.tickets.length === 0)).toBe(true);
  });

  it("states the contract's numbers: quiet after 3 days, one breath every 2 s", () => {
    expect(quietAfterMsV6).toBe(3 * DAY);
    expect(breathPeriodMsV6).toBe(2_000);
  });

  // Each quiet reason and each exception, so S2's rule is exercised on both sides of every edge.
  it("covers finished, idle, exactly 3 days, no time, needs-you idle and an agent rescuing idle tickets", () => {
    const cases = v6Activity;
    expect(cases.some((c) => c.done === c.total && c.quiet)).toBe(true);
    expect(cases.some((c) => c.done < c.total && c.activityAt !== null && v6Now - c.activityAt > 3 * DAY && c.quiet)).toBe(true);
    expect(cases.some((c) => c.activityAt === v6Now - 3 * DAY && !c.quiet)).toBe(true);
    expect(cases.some((c) => c.activityAt === null && !c.quiet)).toBe(true);
    expect(cases.some((c) => c.needsYou > 0 && c.activityAt !== null && v6Now - c.activityAt > 3 * DAY && !c.quiet)).toBe(true);
    const rescued = Object.keys(v6Agents).map((key) => v6SpecsFile.specs.find((spec) => spec.spec === key)!)
      .filter((spec) => spec.tickets.every((t) => t.updatedAt !== undefined && v6Now - Date.parse(t.updatedAt) > 3 * DAY));
    expect(rescued.map((spec) => byKey.get(spec.spec)!.quiet)).toEqual([false]);
    // Needs you is never quiet (S2's acceptance).
    expect(cases.filter((c) => c.needsYou > 0).every((c) => !c.quiet)).toBe(true);
  });

  it("gives each sort a different order of the same visible specs", () => {
    const orders = specsSortsV6.map((sort) => v6SortOrders[sort]);
    for (const order of orders) expect([...order].sort()).toEqual([...visible].sort());
    expect(new Set(orders.map((order) => order.join())).size).toBe(4);
    expect(v6SortOrders.newest).toEqual(visible);
  });

  it("splits the default order into main and Quiet without changing either's order", () => {
    const quiet = new Set(v6Activity.filter((c) => c.quiet).map((c) => c.spec));
    expect([...v6QuietSplit.main, ...v6QuietSplit.quiet].sort()).toEqual([...visible].sort());
    expect(v6QuietSplit.quiet).toEqual(v6SortOrders["needs-you"].filter((key) => quiet.has(key)));
    expect(v6QuietSplit.main).toEqual(v6SortOrders["needs-you"].filter((key) => !quiet.has(key)));
  });

  it("covers breathing, a steady review ring, a failed agent and building with no agent", () => {
    expect(new Set(v6DotMotion.map((c) => c.motion))).toEqual(new Set(["breath", "still"]));
    expect(v6DotMotion.some((c) => c.state === "review" && c.motion === "still")).toBe(true);
    expect(v6DotMotion.some((c) => c.state === "building" && c.motion === "still")).toBe(true);
    expect(v6Activity.some((c) => c.muted) && v6Activity.some((c) => !c.muted)).toBe(true);
  });

  // catches: a review dot that breathes because a working agent names it (#192); the fixture paired its review ticket with a reviewer only.
  it("pairs a working agent with a review ticket, and that review dot stays still", () => {
    const naming = (ticket: string) => Object.values(v6Agents).flat().filter((agent) => agent.ticket === ticket).map((agent) => agent.matrix);
    const review = v6DotMotion.filter((c) => c.state === "review");
    expect(review.filter((c) => naming(c.ticket).includes("working")).map((c) => c.motion)).toEqual(["still"]);
    expect(review.every((c) => c.motion === "still")).toBe(true);
  });

  // catches: null-last read as a rule of every sort (#191), so an undated spec drops below dated ones where activityAt is never compared.
  it("puts a null activity time last only where activityAt is compared", () => {
    const undated = v6Activity.filter((c) => c.activityAt === null).map((c) => c.spec);
    expect(undated).toEqual(["example/sample-sort#751"]);
    const spec = undated[0]!;
    const datedAfter = (order: readonly string[]) => order.slice(order.indexOf(spec) + 1).filter((key) => byKey.get(key as never)!.activityAt !== null);
    // recent compares activityAt throughout: nothing dated comes after the undated spec.
    expect(datedAfter(v6SortOrders.recent)).toEqual([]);
    // needs-you compares it within a group: last among the other unfinished specs, still before the finished group.
    const others = v6SortOrders["needs-you"].filter((key) => { const c = byKey.get(key)!; return c.needsYou === 0 && c.done < c.total; });
    expect(others.at(-1)).toBe(spec);
    expect(datedAfter(v6SortOrders["needs-you"])).toEqual(["example/sample-sort#731"]);
    // closest and newest never read activityAt: dated specs follow it.
    expect(datedAfter(v6SortOrders.closest)).toEqual(["example/sample-sort#781"]);
    expect(datedAfter(v6SortOrders.newest)).toEqual(["example/sample-sort#761", "example/sample-sort#781"]);
  });

  it("sets every 0.5.0 key away from its 0.5.0 default", () => {
    expect(Object.keys(v6Store050).sort()).toEqual([
      "childrenChipEnabled", "footerCountEnabled", "machineIconsEnabled", "parentChipEnabled", "sectionsCollapsed",
      "specsOpen", "wizdeckFactories", "wizdeckGithubToken",
    ]);
    const defaults050: Record<string, unknown> = {
      footerCountEnabled: true, machineIconsEnabled: true, childrenChipEnabled: false, parentChipEnabled: true,
      specsOpen: "[]", sectionsCollapsed: "[]", wizdeckFactories: undefined, wizdeckGithubToken: undefined,
    };
    for (const [key, value] of Object.entries(v6Store050)) expect(value).not.toEqual(defaults050[key]);
    // The stored Inbox collapse is what the upgrade must carry into Unread.
    expect(JSON.parse(v6Store050.sectionsCollapsed)).toContain("inbox");
  });
});
