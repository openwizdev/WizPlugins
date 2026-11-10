import { describe, expect, it } from "vitest";
import { countRunning } from "./running-count";
import { positiveSource, syntheticThread } from "../../docs/evidence/wz5/fixtures";

const idle = syntheticThread();

describe("W2: global running count on explicitly synthetic complete inputs", () => {
  it("counts projects, a hidden child and in-thread agents independently", () => {
    expect(countRunning(positiveSource)).toEqual({ threads: 2, subagents: 3, total: 5 });
  });
  it.each([
    ["workflows", { ...idle.activity, workflows: 3 }, "none"],
    ["background agents", { ...idle.activity, backgroundAgents: 9 }, "none"],
    ["background commands", { ...idle.activity, backgroundCommands: 4 }, "none"],
    ["plan mode", { ...idle.activity, planMode: 1 }, "none"],
    ["goals", { ...idle.activity, goals: 2 }, "none"],
    ["runtime", idle.activity, "runtime"],
    ["working draft", idle.activity, "working-draft"],
  ] as const)("counts one thread for %s without guessing its subagents", (_, activity, indicator) => {
    expect(countRunning({ complete: true, threads: [syntheticThread({ activity, indicator })], subagentsByThread: new Map([[idle.id, 2]]) })).toEqual({ threads: 1, subagents: 2, total: 3 });
  });
  it("counts a thread once even when several working signals hold", () => {
    const thread = syntheticThread({ indicator: "runtime", activity: { workflows: 2, backgroundAgents: 4, backgroundCommands: 3, planMode: 1, goals: 1 } });
    expect(countRunning({ complete: true, threads: [thread, thread], subagentsByThread: new Map([[thread.id, 4]]) })).toEqual({ threads: 1, subagents: 4, total: 5 });
  });
  it("does not infer work from waiting, status or unread alone", () => {
    const thread = syntheticThread({ status: "active", hasPendingInteraction: true, isUnread: true, indicator: "waiting-for-input" });
    expect(countRunning({ complete: true, threads: [thread], subagentsByThread: new Map([[thread.id, 0]]) })).toEqual({ threads: 0, subagents: 0, total: 0 });
  });
  it("adds known in-thread agents even without a parent working signal", () => {
    expect(countRunning({ complete: true, threads: [idle], subagentsByThread: new Map([[idle.id, 2]]) })).toEqual({ threads: 0, subagents: 2, total: 2 });
  });
  it("distinguishes a verified empty snapshot from unavailable inputs", () => {
    expect(countRunning({ complete: true, threads: [], subagentsByThread: new Map() })).toEqual({ threads: 0, subagents: 0, total: 0 });
    expect(countRunning(null)).toBeNull();
    expect(countRunning({ ...positiveSource, complete: false })).toBeNull();
    expect(countRunning({ ...positiveSource, subagentsByThread: null })).toBeNull();
    expect(countRunning({ ...positiveSource, subagentsByThread: new Map() })).toBeNull();
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects an invalid or unsafe total from subagent value %s", (value) => {
    expect(countRunning({ complete: true, threads: [syntheticThread({ indicator: "runtime" })], subagentsByThread: new Map([[idle.id, value]]) })).toBeNull();
  });
  it("rejects conflicting duplicate rows rather than selecting a partial count", () => {
    expect(countRunning({ complete: true, threads: [idle, syntheticThread({ indicator: "runtime" })], subagentsByThread: new Map([[idle.id, 0]]) })).toBeNull();
  });
});
