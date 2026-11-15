// @vitest-environment jsdom
// D2 (#74) review round 1 (R1, R2, R4): the real WizDeck panel through the SDK's slot harness.
// R1 runs the panel against the real action handlers on the SDK's fake host, with a fake SDK
// send and a lost RPC response. Fixtures prove no live host or steer.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { buildHomeView } from "../data/home";
import { deckSettingDescriptors } from "../data/binding";
import { dxFactory, dxQueue, dxSettings } from "../data/fixtures";
import type { DeckWatchResultV1 } from "../data/server";
import { WizDeckPanel } from "../home/Panel";
import { registerDeckActions } from "./server";
import { NO_REPLY_CORRELATION, UNDO_MS, type ActionLogV1, type ActionRecordV1 } from "./protocol";

const NOW = Date.parse("2026-11-15T20:30:00Z");
const ORCH = dxFactory.orchestratorThreadId;
const hosts: FakePluginHost[] = [];

const item = (revision: 2 | 3) => ({
  id: "n12", code: "N-12", question: "Which changelog headline ships?",
  options: revision === 2
    ? [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }]
    : [{ id: "short", label: "Short headline" }, { id: "plain", label: "Plain headline" }],
  recommendedOptionId: "short", sourceUrl: "https://example.com/sample/n12", spec: null, risk: "ordinary",
  fingerprint: `fp-n12-${revision}`, createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
});

function watchResult(items: unknown[], revision = 2): DeckWatchResultV1 {
  const ready = <T,>(data: T) => ({ status: "ready" as const, data, fetchedAt: NOW - 5_000, stale: false, complete: true, gaps: [] });
  return {
    projects: [{ projectKey: "sample-factory", cloudroomProjectId: dxFactory.cloudroomProjectId }], projectKey: "sample-factory", setup: null,
    view: buildHomeView({
      projectKey: "sample-factory", timeZone: "UTC", now: NOW, authenticated: true,
      queue: {
        snapshot: ready({ queue: { schema: "openwiz.needs-you.v1" as const, project: "sample-factory", revision, updatedAt: "2026-11-15T20:20:00Z", expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [], items: items as never }, sha256: "x" }),
        detail: null, nextRefreshAt: NOW + 55_000, refreshing: false,
      },
      boards: [],
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false }); vi.setSystemTime(NOW);
  localStorage.clear(); localStorage.setItem("wizdeck.intro.v1", "seen");
});
afterEach(async () => {
  cleanup();
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.useRealTimers(); vi.unstubAllGlobals();
});
const flush = async (turns = 1) => { for (let i = 0; i < turns; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

function mount(handlers: Record<string, (input: any) => unknown>) {
  const slot = renderSlot({ component: WizDeckPanel }, { threadId: "thr_any", params: null as never }, {
    rpc: { deckRelease: () => ({ ok: true }), deckRefresh: () => ({ ...watchResult([item(2)]), started: false }), ...handlers } as never,
    context: { projectId: dxFactory.cloudroomProjectId, threadId: "thr_any" },
  });
  return { slot, calls: (method: string) => slot.inspection.rpcCalls.filter((call) => call.method === method) };
}

const verifiedLog = (records: ActionRecordV1[]) => (input: { projectKey: string }): ActionLogV1 => ({
  projectKey: input.projectKey, orchestrator: { status: "verified", threadId: ORCH, title: null }, records, reply: NO_REPLY_CORRELATION,
});

describe("R1: a lost response never becomes a second effect", () => {
  // Bug caught: the backend accepted a Tell but its RPC answer was lost; the draft stayed
  // sendable, the next good log read cleared the warning, and Send made a second operation.
  it("keeps the same operation, reconciles it from the real backend, and sends once", async () => {
    const queueText = dxQueue();
    const send = vi.fn(async () => ({ ok: true, delivery: "sent" }));
    const host = createFakePluginHost({
      pluginId: "wizbar", settings: dxSettings(),
      sdk: {
        files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: queueText, contentEncoding: "utf8", path, sha256: createHash("sha256").update(queueText).digest("hex"), sizeBytes: queueText.length })) },
        threads: { get: vi.fn(async () => ({ id: ORCH, projectId: dxFactory.cloudroomProjectId, archivedAt: null, deletedAt: null, title: null, titleFallback: null })), send },
      } as never,
    });
    hosts.push(host);
    registerDeckActions(host.bb, { settings: host.bb.settings.define(deckSettingDescriptors) });
    const backend = (name: string, input: unknown) => host.harness.behavior.callRpc(name, input);
    let lose = true;
    const t = mount({
      deckWatch: () => watchResult([item(2)]),
      deckActionLog: (input) => backend("deckActionLog", input),
      deckBindAnswer: (input) => backend("deckBindAnswer", input),
      deckSteer: async (input) => {
        const result = await backend("deckSteer", input);
        if (lose) throw new Error("connection reset"); // Accepted by the backend; the panel never hears back.
        return result;
      },
    });
    await flush(3);
    const box = screen.getByRole("textbox", { name: "Message to the orchestrator" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Hold new builds until Monday." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await flush(10);
    lose = false;
    const sentId = (t.calls("deckSteer")[0].input as { operationId: string }).operationId;

    // A fresh submission of the same instruction is not offered; the operation is shown by its own id.
    expect(box.value).toBe("");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    const rows = document.querySelectorAll(`[data-operation="${sentId}"]`);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Sent · steered.");
    await t.slot.behavior.emitRealtime("wizdeck-actions", {});
    await flush(3);
    expect(send).toHaveBeenCalledTimes(1);
    expect(new Set(t.calls("deckSteer").map((call) => (call.input as { operationId: string }).operationId))).toEqual(new Set([sentId]));
  });

  // Bug caught: a failed log read, or a later good one that lacks the operation, clears the uncertainty.
  it("keeps an unresolved operation uncertain while no log can settle it", async () => {
    let logFails = false;
    const t = mount({
      deckWatch: () => watchResult([item(2)]),
      deckActionLog: (input) => { if (logFails) throw new Error("offline"); return verifiedLog([])(input); },
      deckSteer: () => { throw new Error("connection reset"); },
    });
    await flush(3);
    fireEvent.change(screen.getByRole("textbox", { name: "Message to the orchestrator" }), { target: { value: "Hold new builds until Monday." } });
    logFails = true;
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await flush(5);
    const id = (t.calls("deckSteer")[0].input as { operationId: string }).operationId;
    const row = () => document.querySelector(`[data-operation="${id}"]`)!;
    expect(row().textContent).toContain("Outcome unknown");
    logFails = false;
    await t.slot.behavior.emitRealtime("wizdeck-actions", {});
    await flush(3);
    expect(row().textContent).toContain("Outcome unknown");
    expect(row().textContent).toContain("not resent");
    expect(t.calls("deckSteer")).toHaveLength(1);
  });
});

/** The real action handlers on the SDK's fake host, with a mutable queue file and fake SDK send. */
function realBackend(send: () => Promise<unknown>) {
  let queueText = dxQueue();
  const sendFn = vi.fn(send);
  const host = createFakePluginHost({
    pluginId: "wizbar", settings: dxSettings(),
    sdk: {
      files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: queueText, contentEncoding: "utf8", path, sha256: createHash("sha256").update(queueText).digest("hex"), sizeBytes: queueText.length })) },
      threads: { get: vi.fn(async () => ({ id: ORCH, projectId: dxFactory.cloudroomProjectId, archivedAt: null, deletedAt: null, title: null, titleFallback: null })), send: sendFn },
    } as never,
  });
  hosts.push(host);
  registerDeckActions(host.bb, { settings: host.bb.settings.define(deckSettingDescriptors) });
  const call = (name: string, input: unknown) => host.harness.behavior.callRpc(name, input);
  return {
    host, call,
    sends: () => sendFn.mock.calls as unknown as [{ input: { text: string }[] }][],
    setQueue: (revision: number, fingerprint: string) => { queueText = dxQueue({ revision, items: [{ ...JSON.parse(dxQueue()).items[0], fingerprint }] }); },
  };
}

describe("R2: answers follow the backend's current proposal identity", () => {
  // The fixture queue's item, as the panel shows it; revision 3 keeps every shown field.
  const shownItem = (fingerprint: string) => ({ ...JSON.parse(dxQueue()).items[0], fingerprint });

  // Bug caught: an earlier answer hides the controls of a new proposal whose shown fields are
  // identical but whose backend identity (fingerprint, revision 3) is new.
  it("identical shown fields with a new backend fingerprint offer the choices and send one new answer", async () => {
    const backend = realBackend(async () => ({ ok: true, delivery: "sent" }));
    let fingerprint = "fp-n12-1"; let revision = 2;
    const t = mount({
      deckWatch: () => watchResult([shownItem(fingerprint)], revision),
      deckActionLog: (input) => backend.call("deckActionLog", input),
      deckBindAnswer: (input) => backend.call("deckBindAnswer", input),
      deckSteer: (input) => backend.call("deckSteer", input),
    });
    await flush(3);
    const row = () => document.querySelector('[data-answer-item="n12"]') as HTMLElement;
    fireEvent.click(within(row()).getByRole("button", { name: "Short headline (rec)" }));
    await flush(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS); });
    await flush(5);
    expect(backend.sends()).toHaveLength(1);

    fingerprint = "fp-n12-3"; revision = 3;
    backend.setQueue(3, "fp-n12-3");
    await t.slot.behavior.emitRealtime("wizdeck", {});
    await flush(3);
    fireEvent.click(within(row()).getByRole("button", { name: "Long headline" }));
    await flush(3);
    expect(within(row()).getByRole("button", { name: "Undo" })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS); });
    await flush(5);
    expect(backend.sends()).toHaveLength(2);
    expect(backend.sends()[1][0].input[0].text).toContain("fingerprint fp-n12-3 · queue revision 3");
  });

  // Bug caught: the unchanged proposal answered again after a sent or uncertain answer, or an
  // eligibility check that starts Undo or allocates a send operation.
  for (const outcome of ["sent", "uncertain"] as const) {
    it(`the unchanged proposal stays protected after a ${outcome} answer: no Undo, no operation, no send`, async () => {
      const backend = realBackend(async () => { if (outcome === "uncertain") throw new Error("socket closed"); return { ok: true, delivery: "sent" }; });
      const t = mount({
        deckWatch: () => watchResult([shownItem("fp-n12-1")]),
        deckActionLog: (input) => backend.call("deckActionLog", input),
        deckBindAnswer: (input) => backend.call("deckBindAnswer", input),
        deckSteer: (input) => backend.call("deckSteer", input),
      });
      await flush(3);
      const row = () => document.querySelector('[data-answer-item="n12"]') as HTMLElement;
      fireEvent.click(within(row()).getByRole("button", { name: "Short headline (rec)" }));
      await flush(3);
      await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS); });
      await flush(5);
      expect(backend.sends()).toHaveLength(1);
      expect(row().textContent).toContain("Earlier: Answer N-12 · Short headline");

      fireEvent.click(within(row()).getByRole("button", { name: "Long headline" }));
      await flush(5);
      expect(within(row()).queryByRole("button", { name: "Undo" })).toBeNull();
      expect(row().textContent).toContain("This was already sent; WizDeck does not send it twice.");
      await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS * 2); });
      expect(t.calls("deckSteer")).toHaveLength(1);
      expect(backend.sends()).toHaveLength(1);
    });
  }
});

describe("R1 final: overlapping log responses never drop an unresolved operation", () => {
  // Bug caught: after a lost response, the newer log shows the send still dispatching; an older,
  // overlapping log response without it then arrives and the operation and its state vanish.
  it("newer dispatching then older empty response keeps the same operation until the backend settles it", async () => {
    let releaseSend!: () => void;
    const backend = realBackend(() => new Promise((resolve) => { releaseSend = () => resolve({ ok: true, delivery: "sent" }); }));
    let holdNextLog = false;
    let releaseOldLog!: () => void;
    const t = mount({
      deckWatch: () => watchResult([item(2)]),
      deckActionLog: async (input) => {
        const snapshot = await backend.call("deckActionLog", input); // Read now: the older, empty log.
        if (!holdNextLog) return snapshot;
        holdNextLog = false;
        return new Promise((resolve) => { releaseOldLog = () => resolve(snapshot); });
      },
      deckSteer: async (input) => {
        void backend.call("deckSteer", input); // Accepted; the SDK send stays pending.
        for (let turn = 0; turn < 50 && backend.sends().length === 0; turn += 1) await Promise.resolve();
        throw new Error("connection reset"); // The panel never hears back.
      },
    });
    await flush(3);
    holdNextLog = true;
    await t.slot.behavior.emitRealtime("wizdeck-actions", {}); // The older read starts and is held.
    await flush();
    fireEvent.change(screen.getByRole("textbox", { name: "Message to the orchestrator" }), { target: { value: "Hold new builds until Monday." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await flush(10);
    const id = (t.calls("deckSteer")[0].input as { operationId: string }).operationId;
    const row = () => document.querySelector(`[data-operation="${id}"]`) as HTMLElement | null;
    expect(row()?.textContent).toContain("Sending…");

    releaseOldLog();
    await flush(5);
    expect(row()).toBeTruthy();
    expect(row()!.textContent).toContain("Hold new builds until Monday.");
    expect(row()!.textContent).toContain("Sending…");

    releaseSend();
    await flush(5);
    await t.slot.behavior.emitRealtime("wizdeck-actions", {});
    await flush(5);
    expect(row()!.textContent).toContain("Sent · steered.");
    expect(backend.sends()).toHaveLength(1);
    expect(new Set(t.calls("deckSteer").map((call) => (call.input as { operationId: string }).operationId))).toEqual(new Set([id]));
  });
});

describe("R4: delivery state shows at once", () => {
  // Bug caught: a slow Tell froze the controls with no sending indication until the RPC settled.
  it("shows this operation's pending delivery before the RPC answers, then its real outcome", async () => {
    let settle!: (record: ActionRecordV1) => void;
    const t = mount({
      deckWatch: () => watchResult([item(2)]),
      deckActionLog: verifiedLog([]),
      deckSteer: () => new Promise<ActionRecordV1>((resolve) => { settle = resolve; }),
    });
    await flush(3);
    fireEvent.change(screen.getByRole("textbox", { name: "Message to the orchestrator" }), { target: { value: "Hold new builds until Monday." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await flush();
    const id = (t.calls("deckSteer")[0].input as { operationId: string }).operationId;
    const row = document.querySelector(`[data-operation="${id}"]`) as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.getAttribute("data-state")).toBe("pending");
    expect(within(row).getByRole("status").textContent).toContain("Sending…");
    expect(row.textContent).not.toContain("Sent · steered.");
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS * 4); });
    expect((document.querySelector(`[data-operation="${id}"]`) as HTMLElement).getAttribute("data-state")).toBe("pending");
    settle({ operationId: id, kind: "tell", projectKey: "sample-factory", label: "Hold new builds until Monday.", state: "queued", reason: null, detail: null, createdAt: NOW, settledAt: NOW, answer: null });
    await flush(3);
    const settled = document.querySelector(`[data-operation="${id}"]`) as HTMLElement;
    expect(settled.textContent).toContain("Waiting · queued by the host, not steered yet.");
  });
});

describe("#92: reconciliation keeps a confirmed delivery", () => {
  /** Answer N-12 through the real panel and backend; returns the panel and the answer's rows. */
  async function answerOnce(backend: ReturnType<typeof realBackend>, deckActionLog?: (input: any) => unknown) {
    const t = mount({
      deckWatch: () => watchResult([item(2)]),
      deckActionLog: deckActionLog ?? ((input) => backend.call("deckActionLog", input)),
      deckBindAnswer: (input) => backend.call("deckBindAnswer", input),
      deckSteer: (input) => backend.call("deckSteer", input),
    });
    await flush(3);
    const answerRow = () => document.querySelector('[data-answer-item="n12"]') as HTMLElement;
    fireEvent.click(within(answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS); });
    await flush(5);
    const ids = () => new Set(t.calls("deckSteer").map((call) => (call.input as { operationId: string }).operationId));
    const id = [...ids()][0];
    const logRow = () => document.querySelector(`[data-operation="${id}"]`) as HTMLElement;
    return { t, id, ids, answerRow, logRow };
  }
  const words = { sent: "Sent · steered.", queued: "Waiting · queued by the host, not steered yet." } as const;
  const confirmation = { sent: { ok: true, delivery: "sent" }, queued: { ok: true, delivery: "queued", queuedMessage: { id: "qm-sample-1" } } } as const;

  for (const outcome of ["sent", "queued"] as const) {
    // Bug caught: the SDK confirms delivery but the final record write fails; the retained
    // `dispatching` record reads back as uncertain and every later log read, including an
    // older overlapping one, replaces the confirmed outcome in the panel's memory and rows.
    it(`a ${outcome} confirmation stays ${outcome} when the final record write fails and recovery reads uncertain`, async () => {
      const backend = realBackend(async () => confirmation[outcome]);
      const kv = backend.host.bb.storage.kv;
      const save = kv.set.bind(kv);
      const rejected: string[] = [];
      vi.spyOn(kv, "set").mockImplementation(async (name: string, value: unknown) => {
        const state = (value as ActionRecordV1).state;
        if (state === "sent" || state === "queued") { rejected.push(state); throw new Error("storage full"); } // Only the final write.
        return save(name, value as never);
      });
      let hold = false;
      const held: (() => void)[] = [];
      const { t, id, ids, answerRow, logRow } = await answerOnce(backend, async (input) => {
        const snapshot = await backend.call("deckActionLog", input);
        if (!hold) return snapshot;
        return new Promise((resolve) => { held.push(() => resolve(snapshot)); });
      });
      expect(rejected).toEqual([outcome]);
      // The setup reaches the claim: the backend's own recovery read is fallback uncertainty.
      const stored = await backend.call("deckActionLog", { projectKey: "sample-factory" }) as ActionLogV1;
      expect(stored.records.map((record) => [record.operationId, record.state])).toEqual([[id, "uncertain"]]);

      await t.slot.behavior.emitRealtime("wizdeck-actions", {});
      await flush(5);
      // Two overlapping reads, the older answering last.
      hold = true;
      await t.slot.behavior.emitRealtime("wizdeck-actions", {});
      await t.slot.behavior.emitRealtime("wizdeck-actions", {});
      await flush(3);
      hold = false;
      held[1](); await flush(3);
      held[0](); await flush(3);

      expect.soft(logRow().getAttribute("data-state")).toBe(outcome);
      expect.soft(logRow().textContent).toContain(words[outcome]);
      expect.soft(logRow().textContent).not.toContain("Uncertain");
      expect.soft(answerRow().textContent).toContain(`Earlier: Answer N-12 · Short headline · ${words[outcome]}`);
      expect.soft(answerRow().textContent).not.toContain("Uncertain");
      expect(ids()).toEqual(new Set([id]));
      expect(t.calls("deckSteer")).toHaveLength(1);
      expect(backend.sends()).toHaveLength(1);
    });

    // Bug caught: an uncertain answer (no host answer within the wait) never shows the host's
    // actual later confirmation, or reconciliation resends or allocates a new operation for it.
    it(`an uncertain answer upgrades to ${outcome} when the actual confirmation arrives later`, async () => {
      let confirm!: () => void;
      const backend = realBackend(() => new Promise((resolve) => { confirm = () => resolve(confirmation[outcome]); }));
      const { t, id, ids, answerRow, logRow } = await answerOnce(backend);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      await flush(5);
      expect(logRow().getAttribute("data-state")).toBe("uncertain");
      expect(answerRow().textContent).toContain("Uncertain ·");

      confirm();
      await flush(5);
      await t.slot.behavior.emitRealtime("wizdeck-actions", {});
      await flush(5);
      expect(logRow().getAttribute("data-state")).toBe(outcome);
      expect(logRow().textContent).toContain(words[outcome]);
      expect(answerRow().textContent).toContain(`Earlier: Answer N-12 · Short headline · ${words[outcome]}`);
      expect(ids()).toEqual(new Set([id]));
      expect(t.calls("deckSteer")).toHaveLength(1);
      expect(backend.sends()).toHaveLength(1);
    });
  }
});
