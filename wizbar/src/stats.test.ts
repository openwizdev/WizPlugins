// WZ20 (#41): the one stats computation the panel and `wizbar stats` share.
// Expected values come from the hand-worked fixture (`v3Stats`) or are written
// out here by hand; none is computed the way the code computes it.
import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { v3Now, v3Stats, v3Threads, v3TimeZone } from "./fixtures/v3";
import { computeStats, formatStatsText, isRunning, statsWindow } from "./stats";

const byId = (id: string) => v3Threads.find((t) => t.id === id)!;
const unavailable = {
  version: 1, status: "unavailable", running: null, waitingOnYou: null, finishedToday: null,
  window: v3Stats.window, coverage: v3Stats.coverage,
};

describe("V3: stats over the v0.3 fixture rows", () => {
  it("matches the contract's hand-worked numbers", () => {
    expect(computeStats(v3Threads, v3Now, v3TimeZone)).toEqual(v3Stats);
  });

  it("counts a busy row that waits on you under waiting, never under running", () => {
    const busyWaiting = byId("thr_v3_active_waiting");
    expect(isRunning(busyWaiting)).toBe(false);
    expect(isRunning(byId("thr_v3_child_local"))).toBe(true);
    expect(computeStats([busyWaiting], v3Now, v3TimeZone)).toMatchObject({
      status: "ready", waitingOnYou: 1,
      running: { total: 0, topLevel: 0, children: 0, cloud: 0, local: 0, unknown: 0 },
    });
  });

  it("counts background work as running but never counts the subagents themselves", () => {
    const agents = { ...byId("thr_v3_pinned_idle"), activity: { workflows: 0, backgroundAgents: 3, backgroundCommands: 0, planMode: 0, goals: 0 } };
    expect(computeStats([agents], v3Now, v3TimeZone)).toMatchObject({
      running: { total: 1, local: 1 }, coverage: { subagents: "not-counted", unseen: "possible" },
    });
  });

  it("counts a repeated ID once when its facts agree", () => {
    expect(computeStats([...v3Threads, byId("thr_v3_parent_many")], v3Now, v3TimeZone)).toEqual(v3Stats);
  });

  it.each([
    ["null rows", null],
    ["a repeated ID with conflicting facts", [...v3Threads, { ...byId("thr_v3_parent_many"), runtimeStatus: "idle", status: "idle" } as PluginSidebarThread]],
    ["an unrecognised runtime status", [...v3Threads.slice(1), { ...byId("thr_v3_parent_many"), runtimeStatus: "host-reconnecting" as never }]],
  ])("is unavailable, never a guessed number, for %s", (_, rows) => {
    expect(computeStats(rows as readonly PluginSidebarThread[] | null, v3Now, v3TimeZone)).toEqual(unavailable);
  });
});

describe("today's window is the reader's local calendar day", () => {
  it.each([
    ["UTC midday", v3Now, "UTC", "2026-11-12T00:00:00Z", "2026-11-13T00:00:00Z"],
    ["a 25-hour day", Date.parse("2026-11-01T12:00:00Z"), "America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
    ["a 23-hour day", Date.parse("2026-03-08T12:00:00Z"), "America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
    ["a half-hour zone past local midnight", Date.parse("2026-11-12T20:00:00Z"), "Asia/Kolkata", "2026-11-12T18:30:00Z", "2026-11-13T18:30:00Z"],
    ["the exact local midnight", Date.parse("2026-11-12T05:00:00Z"), "America/New_York", "2026-11-12T05:00:00Z", "2026-11-13T05:00:00Z"],
  ])("%s", (_, now, timeZone, start, end) => {
    expect(statsWindow(now, timeZone)).toEqual({ timeZone, start: Date.parse(start), end: Date.parse(end) });
  });
});

describe("CLI text", () => {
  it("prints the contract's three lines for the fixture", () => {
    expect(formatStatsText(v3Stats)).toBe([
      "4 running · 2 top-level, 2 children · 1 cloud, 2 local, 1 unknown · subagents not counted yet · some threads may be unseen",
      "Waiting on you: 3",
      "Finished today: not available yet",
    ].join("\n"));
  });
  it("prints a host count once a finish source exists", () => {
    if (v3Stats.status !== "ready") throw new Error("fixture must be ready");
    expect(formatStatsText({ ...v3Stats, finishedToday: { source: "host", count: 18 } }).split("\n")[2]).toBe("Finished today: 18");
  });
});
