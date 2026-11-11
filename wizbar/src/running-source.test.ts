import { describe, expect, it } from "vitest";
import type { PluginSidebarThreadsState } from "@get-bb/plugin-sdk";
import { syntheticThread } from "../../docs/evidence/wz5/fixtures";
import { countRunning } from "./running-count";
import { readRunningSource } from "./running-source";

const idle = syntheticThread();
const state = (threads = [idle]): Pick<PluginSidebarThreadsState, "status" | "threads"> => ({ status: "ready", threads });

describe("N4: unfiltered observable sidebar source", () => {
  it("preserves cross-project, archived, hidden and child work, deduplicated by stable ID", () => {
    const parent = syntheticThread({ indicator: "runtime" });
    const child = syntheticThread({ id: "sample-child", projectId: "sample-project-b", parentThreadId: parent.id, indicator: "working-draft", isHidden: true, isArchived: true });
    const input = readRunningSource(state([parent, child, parent, idle]), "connected");
    // An idle record with the parent's ID contradicts its working state.
    expect(countRunning(input)).toBeNull();
    const valid = readRunningSource(state([parent, child, parent]), "connected");
    expect(countRunning(valid)).toEqual({ threads: 2, subagents: null, total: 2 });
    expect(valid.scope).toBe("observable-sidebar");
    expect(valid.subagents).toEqual({ status: "unproven", count: null });
  });

  it.each([
    ["workflows", { ...idle.activity, workflows: 3 }, "none"],
    ["background agents", { ...idle.activity, backgroundAgents: 9 }, "none"],
    ["background commands", { ...idle.activity, backgroundCommands: 4 }, "none"],
    ["plan mode", { ...idle.activity, planMode: 1 }, "none"],
    ["goals", { ...idle.activity, goals: 2 }, "none"],
    ["runtime", idle.activity, "runtime"],
    ["working draft", idle.activity, "working-draft"],
  ] as const)("uses unchanged WZ10 %s signal without equating background counts with subagents", (_, activity, indicator) => {
    expect(countRunning(readRunningSource(state([syntheticThread({ activity, indicator })]), "connected")))
      .toEqual({ threads: 1, subagents: null, total: 1 });
  });

  it("does not infer work from active status or attention alone", () => {
    expect(countRunning(readRunningSource(state([syntheticThread({ status: "active", hasPendingInteraction: true, isUnread: true, indicator: "waiting-for-input" })]), "connected")))
      .toEqual({ threads: 0, subagents: null, total: 0 });
  });

  it.each(["loading", "error"] as const)("never turns %s into an empty count, even with retained rows", (status) => {
    const input = readRunningSource({ ...state(), status }, "connected");
    expect(input.status).toBe(status === "loading" ? "unavailable" : "error");
    expect(input.threads).toBeNull();
    expect(countRunning(input)).toBeNull();
  });
  it.each(["connecting", "reconnecting"] as const)("never displays retained work while %s", (connection) => {
    const input = readRunningSource(state(), connection);
    expect(input.status).toBe("stale");
    expect(countRunning(input)).toBeNull();
  });

  it.each([
    { ...idle, id: "" }, { ...idle, projectId: "" }, { ...idle, parentThreadId: undefined },
    { ...idle, activity: undefined }, { ...idle, activity: { ...idle.activity, goals: undefined } },
    { ...idle, activity: { ...idle.activity, workflows: -1 } },
    { ...idle, activity: { ...idle.activity, backgroundCommands: 0.5 } },
    { ...idle, activity: { ...idle.activity, goals: NaN } },
    { ...idle, activity: { ...idle.activity, planMode: Infinity } },
    { ...idle, activity: { ...idle.activity, backgroundAgents: "1" } },
    { ...idle, indicator: undefined }, { ...idle, indicator: "future-signal" },
  ])("rejects incomplete/unknown work facts instead of interpreting them as idle: %j", (thread) => {
    // Deliberate corrupt host fixture; no production declaration extension.
    const input = readRunningSource({ status: "ready", threads: [thread] } as unknown as PluginSidebarThreadsState, "connected");
    expect(input.status).toBe("incomplete");
    expect(countRunning(input)).toBeNull();
  });

  it.each([
    syntheticThread({ indicator: "runtime" }),
    syntheticThread({ projectId: "sample-project-b" }),
    syntheticThread({ parentThreadId: "sample-other-parent" }),
  ])("rejects contradictory duplicate work/membership facts", (second) => {
    const input = readRunningSource(state([idle, second]), "connected");
    expect(input.status).toBe("incomplete");
    expect(countRunning(input)).toBeNull();
  });
});
