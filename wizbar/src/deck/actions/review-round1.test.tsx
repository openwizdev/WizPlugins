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

describe("R2: a revised proposal can be answered", () => {
  const answered = (state: ActionRecordV1["state"]): ActionRecordV1 => ({
    operationId: "op-test-earlier", kind: "answer", projectKey: "sample-factory", label: "Answer N-12 · Short headline",
    state, reason: null, detail: null, createdAt: NOW - 60_000, settledAt: NOW - 60_000,
    answer: { itemId: "n12", fingerprint: "fp-n12-2", question: item(2).question, shown: { code: "N-12", question: item(2).question, risk: "ordinary", options: item(2).options } } as never,
  });

  // Bug caught: an earlier answer to revision 2 hides the controls of revision 3, which keeps
  // the item id and question but offers different choices under a new fingerprint.
  it("revision 2 → 3 with new options offers the new choices", async () => {
    let revision: 2 | 3 = 2;
    mount({ deckWatch: () => watchResult([item(revision)], revision), deckActionLog: verifiedLog([answered("sent")]) });
    await flush(3);
    const row = () => document.querySelector('[data-answer-item="n12"]') as HTMLElement;
    expect(row().textContent).toContain("Sent · steered.");
    expect(within(row()).queryByRole("button", { name: "Long headline" })).toBeNull();
    revision = 3;
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await flush(2);
    expect(within(row()).getByRole("button", { name: "Plain headline" })).toBeTruthy();
    expect(row().textContent).not.toContain("Sent · steered.");
  });

  it("the unchanged proposal stays suppressed after a sent or uncertain answer", async () => {
    for (const state of ["sent", "uncertain"] as const) {
      mount({ deckWatch: () => watchResult([item(2)]), deckActionLog: verifiedLog([answered(state)]) });
      await flush(3);
      const row = document.querySelector('[data-answer-item="n12"]') as HTMLElement;
      expect(within(row).queryAllByRole("button")).toHaveLength(0);
      cleanup();
    }
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
