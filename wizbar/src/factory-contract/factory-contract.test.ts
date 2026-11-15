import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  activityFreshnessMs, checkSteerDispatch, dispatchSteerDisabled, needsYouQueueSchema, needsYouViewStub,
  parseSpecStatus, readHostInventory, readNeedsYouQueue, readSpecStatus, readTimelineActivity, stallStatus,
  stallThresholdV1, steerOutcome, steerSendArgs, type StallThresholdV1,
} from "./index";
import {
  fxAnswer, fxBinding, fxNow, fxQueue, fxQueueText, fxQueueWith, fxStatusBody, fxTimelineInactive,
  fxTimelineLongTool, fxTimelineOlderPage,
} from "./fixtures";

const context = { projectKey: fxBinding.projectKey, now: fxNow };
const n1 = fxQueue.items[0];

describe("P1: the Needs-you queue boundary", () => {
  // Bug caught: a consumer that loses, reorders or enables answers on queue
  // items before D2 wires the gated steer path.
  it("traces one synthetic queue file through validation to the disabled consumer stub", async () => {
    const view = needsYouViewStub(readNeedsYouQueue(fxQueueText, context));
    expect(view).toEqual({
      state: "ready", complete: true, count: 2, gaps: [],
      items: [
        { id: "n1", code: "N1", question: "Sample question n1?", options: n1.options, recommendedOptionId: "yes",
          risk: "ordinary", answer: { enabled: false, reason: "contract-stub" } },
        { id: "n2", code: "N2", question: "Sample question n2?", options: n1.options, recommendedOptionId: null,
          risk: "release", answer: { enabled: false, reason: "contract-stub" } },
      ],
    });
    await expect(dispatchSteerDisabled(fxAnswer)).resolves.toEqual({ status: "disabled" });
  });

  // Bugs caught: a cross-factory queue answered as this factory's, duplicate
  // ids drifting the count, a v2 or broken file read as v1, an expired or
  // rolled-back file shown as current; and any of them shown as zero.
  it.each([
    ["wrong project", fxQueueWith({ project: "other-factory" }), {}, "wrong-project"],
    ["duplicate item", fxQueueWith({ items: [n1, { ...n1, question: "Sample duplicate?" }] }), {}, "duplicate-item"],
    ["unknown schema", fxQueueWith({ schema: "openwiz.needs-you.v2" }), {}, "unknown-schema"],
    ["unknown field", fxQueueWith({ extra: true }), {}, "malformed"],
    ["not JSON", "{\"schema\":", {}, "malformed"],
    ["recommended option missing", fxQueueWith({ items: [{ ...n1, recommendedOptionId: "maybe" }] }), {}, "malformed"],
    ["incomplete without a gap", fxQueueWith({ complete: false }), {}, "malformed"],
    ["expired", fxQueueText, { now: Date.parse("2026-11-15T12:30:00Z") }, "expired"],
    ["older revision", fxQueueText, { previousRevision: 5 }, "stale-revision"],
  ])("rejects a %s file as unavailable, never zero", (_name, text, extra, reason) => {
    const read = readNeedsYouQueue(text, { ...context, ...extra });
    expect(read).toEqual({ ok: false, reason });
    expect(needsYouViewStub(read)).toEqual({ state: "unavailable", reason, count: null, items: [] });
  });

  // Bug caught: a partial queue presented as a complete count, or a fresh
  // empty queue presented as unavailable.
  it("counts zero only for a fresh complete empty queue", () => {
    expect(needsYouViewStub(readNeedsYouQueue(fxQueueWith({ items: [] }), context)))
      .toMatchObject({ state: "ready", complete: true, count: 0 });
    expect(needsYouViewStub(readNeedsYouQueue(fxQueueWith({ complete: false, gaps: ["sample gap"] }), context)))
      .toMatchObject({ state: "ready", complete: false, count: null, gaps: ["sample gap"] });
  });

  // Bug caught: the published schema S1's producer validates against drifting
  // from the validator every plugin consumer uses.
  it("publishes exactly the validator's JSON Schema", () => {
    const published = JSON.parse(readFileSync(new URL("../../contracts/factory-view.v1.schema.json", import.meta.url), "utf8"));
    expect(published).toEqual(z.toJSONSchema(needsYouQueueSchema));
  });
});

describe("P1: a pending answer is rechecked against the current queue", () => {
  const current = readNeedsYouQueue(fxQueueText, context);

  it("lets the unchanged ordinary answer through", () => {
    expect(checkSteerDispatch(fxAnswer, fxBinding, current)).toEqual({ ok: true });
  });

  // Bug caught: sending an answer to a proposal that changed, moved or left
  // the queue during Undo, to another factory, or around a risk gate.
  it.each([
    ["changed proposal", readNeedsYouQueue(fxQueueWith({ items: [{ ...n1, fingerprint: "fp-n1-2" }] }), context), {}, "proposal-changed"],
    ["changed revision", readNeedsYouQueue(fxQueueWith({ revision: 5 }), context), {}, "revision-changed"],
    ["resolved item", readNeedsYouQueue(fxQueueWith({ items: [] }), context), {}, "item-gone"],
    ["unavailable queue", readNeedsYouQueue("", context), {}, "queue-unavailable"],
    ["other project", current, { projectKey: "other-factory" }, "wrong-project"],
    ["other target", current, { orchestratorThreadId: "thr_c1_other" }, "wrong-target"],
    ["unknown option", current, { answer: { ...fxAnswer.answer!, optionId: "maybe" } }, "unknown-option"],
    ["release-risk item", current, { answer: { itemId: "n2", optionId: "yes", fingerprint: "fp-n2-1", queueRevision: 4 } }, "gated-risk"],
  ])("cancels a send on a %s", (_name, read, change, reason) => {
    expect(checkSteerDispatch({ ...fxAnswer, ...change }, fxBinding, read)).toEqual({ ok: false, reason });
  });
});

describe("Steer route", () => {
  // Bug caught: queue mode, extra execution overrides, a second input or the
  // plugin-local operation id leaking into the SDK call.
  it("sends one text input in steer mode to the bound orchestrator only", () => {
    expect(steerSendArgs(fxAnswer)).toStrictEqual({
      threadId: "thr_c1_orchestrator",
      input: [{ type: "text", text: "Answer N1: Yes", mentions: [] }],
      mode: "steer",
    });
  });

  // Bug caught: a host-queued message shown as steered, or a timeout treated
  // as a safe-to-repeat failure.
  it("keeps sent, queued and uncertain distinct", () => {
    expect(steerOutcome("op1", { status: "fulfilled", value: { ok: true, delivery: "sent" } }))
      .toEqual({ requestId: "op1", delivery: "sent" });
    expect(steerOutcome("op1", { status: "fulfilled", value: { ok: true, delivery: "queued", queuedMessage: { id: "qm_c1" } } }))
      .toEqual({ requestId: "op1", delivery: "queued", queuedMessageId: "qm_c1" });
    expect(steerOutcome("op1", { status: "rejected", reason: new Error("Request timed out") }))
      .toEqual({ requestId: "op1", delivery: "uncertain", message: "Request timed out" });
    expect(steerOutcome("op1", { status: "fulfilled", value: { ok: true } }))
      .toEqual({ requestId: "op1", delivery: "uncertain", message: "Send result unknown." });
  });
});

describe("Spec status comment", () => {
  it("reads Now, Next, When and Updated from the marker comment", () => {
    expect(parseSpecStatus(fxStatusBody)).toEqual({
      status: "ready", now: "Building the sample home (example-org/sample-app#8).", next: "Review the sample board.",
      when: "2026-11-16 17:00 UTC", updated: "2026-11-15T11:00:00Z",
    });
  });

  // Bug caught: a guessed or zoneless date shown as an estimate, or another
  // author's or a duplicated marker comment trusted.
  it("falls back to Not estimated for a malformed, foreign or ambiguous status", () => {
    const fallback = (reason: string) => ({ status: "unavailable", reason, when: "Not estimated" });
    expect(parseSpecStatus(fxStatusBody.replace("17:00 UTC", "17:00"))).toEqual(fallback("malformed"));
    expect(parseSpecStatus(fxStatusBody.replace("Next:", "Later:"))).toEqual(fallback("malformed"));
    expect(readSpecStatus([{ authorLogin: "someone-else", body: fxStatusBody }], "sample-writer")).toEqual(fallback("missing"));
    expect(readSpecStatus([{ authorLogin: "sample-writer", body: fxStatusBody }, { authorLogin: "sample-writer", body: fxStatusBody }],
      "sample-writer")).toEqual(fallback("ambiguous"));
  });
});

describe("Host inventory (Cloudroom #160 at fec35c49)", () => {
  const thread = (id: string, parentThreadId: string | null = null) => ({ id, projectId: "prj_c1_sample", parentThreadId });

  // Bug caught: an older host's missing inventory shown as zero running.
  it("keeps absent distinct from empty", () => {
    expect(readHostInventory({})).toEqual({ status: "absent" });
    expect(readHostInventory({ runningThreads: [] })).toEqual({ status: "ready", running: [], children: { status: "absent" } });
  });

  // Bugs caught: a duplicate row counted twice, conflicting rows silently
  // merged, and delivered children presented as a complete total.
  it("deduplicates running rows and never totals delivered children", () => {
    const child = thread("thr_c1_child", "thr_c1_absent_parent");
    expect(readHostInventory({ runningThreads: [thread("thr_c1_a"), thread("thr_c1_a"), child],
      childrenByParentId: { thr_c1_absent_parent: [child, child] } })).toEqual({
      status: "ready", running: [thread("thr_c1_a"), child],
      children: { status: "delivered-only", byParentId: { thr_c1_absent_parent: [child] }, total: null },
    });
    expect(readHostInventory({ runningThreads: [thread("thr_c1_a"), thread("thr_c1_a", "thr_c1_p")] }))
      .toEqual({ status: "incomplete", reason: "conflicting-duplicate" });
    expect(readHostInventory({ runningThreads: [], childrenByParentId: { thr_c1_p: [thread("thr_c1_c", "thr_c1_q")] } }))
      .toEqual({ status: "incomplete", reason: "malformed" });
  });
});

describe("Activity and stall: no guessed amber", () => {
  const synthetic: StallThresholdV1 = { source: "factory", role: "builder", state: "running", thresholdMs: 60 * 60_000, reference: "synthetic" };
  const read = (fixture: { rows: unknown; timelinePage: unknown }) => readTimelineActivity(fixture, fxNow);

  // Bug caught: a long-running tool shown as an idle stall.
  it("reports an active long tool as operation-pending, not stalled", () => {
    expect(read(fxTimelineLongTool)).toEqual({
      status: "read", fetchedAt: fxNow, activeTurnId: "turn_c1", pendingOperations: 1, lastActivityAt: null,
    });
    expect(stallStatus({ running: true, activity: read(fxTimelineLongTool), threshold: synthetic, now: fxNow }))
      .toEqual({ status: "operation-pending" });
  });

  // Bug caught: amber computed from host event record times (row createdAt,
  // startedAt or completedAt), which are not a verified activity clock.
  it("leaves true inactivity unavailable until a verified clock exists", () => {
    expect(stallStatus({ running: true, activity: read(fxTimelineInactive), threshold: synthetic, now: fxNow }))
      .toEqual({ status: "unavailable", reason: "no-activity-clock" });
    expect(stallStatus({ running: true, threshold: synthetic, now: fxNow,
      activity: { status: "read", fetchedAt: fxNow, activeTurnId: null, pendingOperations: 0, lastActivityAt: fxNow - 61 * 60_000 } }))
      .toMatchObject({ status: "stalled", idleMs: 61 * 60_000 });
  });

  // Bug caught: an old observation or an older page treated as current state.
  it("refuses a stale observation and a non-latest page", () => {
    const old = readTimelineActivity(fxTimelineLongTool, fxNow - activityFreshnessMs - 1);
    expect(stallStatus({ running: true, activity: old, threshold: synthetic, now: fxNow }))
      .toEqual({ status: "unavailable", reason: "stale-observation" });
    expect(read(fxTimelineOlderPage)).toEqual({ status: "unavailable", reason: "not-latest-page" });
  });

  // Bug caught: a made-up default threshold, or the PR-record stall alarm,
  // used as a thread idle rule.
  it("has no adopted threshold, so stall stays unavailable", () => {
    expect(stallThresholdV1.source).toBe("none");
    expect(stallStatus({ running: true, threshold: stallThresholdV1, now: fxNow,
      activity: { status: "read", fetchedAt: fxNow, activeTurnId: null, pendingOperations: 0, lastActivityAt: fxNow - 5 * 3_600_000 } }))
      .toEqual({ status: "unavailable", reason: "no-threshold" });
  });
});
