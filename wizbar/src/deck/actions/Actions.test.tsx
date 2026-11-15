// @vitest-environment jsdom
// D2 (#74) rendered proofs: the real WizDeck panel, the SDK's slot harness,
// fake backend answers and a fake timer. They catch send-before-Undo, stale
// choices, double clicks, blind retries and invented replies. Fixtures prove
// no live host, queue producer or steer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { buildHomeView } from "../data/home";
import type { DeckWatchResultV1 } from "../data/server";
import type { BoardV1 } from "../data/board";
import { WizDeckPanel } from "../home/Panel";
import { NO_REPLY_CORRELATION, UNDO_MS, type ActionLogV1, type ActionRecordV1 } from "./protocol";

const NOW = Date.parse("2026-11-15T20:30:00Z");
const ORCH = "thr_d2_orchestrator";
const repo = "example-org/sample-app";

const ordinary = {
  id: "n12", code: "N-12", question: "Which changelog headline ships with 1.4?",
  options: [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }], recommendedOptionId: "short",
  sourceUrl: "https://example.com/sample/n12", spec: null, risk: "ordinary", fingerprint: "fp-n12-1",
  createdAt: "2026-11-15T20:00:00Z", updatedAt: "2026-11-15T20:00:00Z",
};
const gated = { ...ordinary, id: "n14", code: "N-14", question: "Publish 1.4 to the marketplace?", options: [{ id: "publish", label: "Publish" }, { id: "hold", label: "Hold" }], recommendedOptionId: null, risk: "publish", fingerprint: "fp-n14-1" };

const board: BoardV1 = {
  repository: repo as BoardV1["repository"],
  versions: [{
    repository: repo as BoardV1["repository"], number: 3, title: "1.4", dueOn: null, complete: true,
    specs: [{
      ref: `${repo}#41` as never, title: "Search filters", url: `https://github.com/${repo}/issues/41`, state: "open",
      total: 5, merged: 2, complete: true, pullRequests: [],
      status: { status: "ready", now: "Building T2–T3", next: "Review T2, then merge", when: "Today ~16:00 UTC", updated: "2026-11-15T20:00:00Z" },
    }],
  }],
  merges: { since: "2026-11-14T18:30:00Z", complete: true, pullRequests: [] },
};
const ready = <T,>(data: T) => ({ status: "ready" as const, data, fetchedAt: NOW - 5_000, stale: false, complete: true, gaps: [] });

function watchResult(items: unknown[] | "missing", projectKey = "sample-factory"): DeckWatchResultV1 {
  return {
    projects: [{ projectKey: "sample-factory", cloudroomProjectId: "prj_a" }, { projectKey: "other-factory", cloudroomProjectId: "prj_b" }],
    projectKey, setup: null,
    view: buildHomeView({
      projectKey, timeZone: "UTC", now: NOW, authenticated: true,
      queue: {
        snapshot: items === "missing" ? { status: "unavailable", reason: "missing", lastGood: null } : ready({
          queue: {
            schema: "openwiz.needs-you.v1" as const, project: projectKey, revision: 2, updatedAt: "2026-11-15T20:20:00Z",
            expiresAt: "2026-11-15T21:00:00Z", complete: true, gaps: [], items: items as never,
          }, sha256: "x",
        }),
        detail: null, nextRefreshAt: NOW + 55_000, refreshing: false,
      },
      boards: [{ snapshot: ready(board), detail: null, nextRefreshAt: NOW + 55_000, refreshing: false }],
    }),
  };
}

const log = (records: ActionRecordV1[] = [], orchestrator: ActionLogV1["orchestrator"] = { status: "verified", threadId: ORCH, title: "Sample orchestrator" }) =>
  (input: { projectKey: string }): ActionLogV1 => ({ projectKey: input.projectKey, orchestrator, records, reply: NO_REPLY_CORRELATION });

const record = (overrides: Partial<ActionRecordV1>): ActionRecordV1 => ({
  operationId: "op-test-0001", kind: "tell", projectKey: "sample-factory", label: "Hold new builds until Monday.",
  state: "sent", reason: null, detail: null, createdAt: NOW, settledAt: NOW, answer: null, ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false }); vi.setSystemTime(NOW);
  localStorage.clear(); localStorage.setItem("wizdeck.intro.v1", "seen");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function mount(options: {
  items?: () => unknown[] | "missing";
  log?: (input: { projectKey: string }) => ActionLogV1;
  steer?: (input: any) => ActionRecordV1 | Promise<ActionRecordV1>;
} = {}) {
  const items = options.items ?? (() => [ordinary, gated]);
  const handlers = {
    deckWatch: (input: { projectKey: string | null }) => watchResult(items(), input.projectKey ?? "sample-factory"),
    deckRefresh: (input: { projectKey: string | null }) => ({ ...watchResult(items(), input.projectKey ?? "sample-factory"), started: false }),
    deckRelease: () => ({ ok: true }),
    deckActionLog: options.log ?? log(),
    deckBindAnswer: (input: { itemId: string; optionId: string }) => ({
      ok: true,
      bound: { itemId: input.itemId, optionId: input.optionId, optionLabel: "Short headline", code: "N-12", question: ordinary.question, fingerprint: "fp-n12-1", queueRevision: 2 },
    }),
    deckSteer: options.steer ?? ((input: { operationId: string; kind: string }) => record({ operationId: input.operationId, kind: input.kind as never, label: "Answer N-12 · Short headline" })),
  };
  const slot = renderSlot({ component: WizDeckPanel }, { threadId: "thr_any", params: null as never }, {
    rpc: handlers as never, context: { projectId: "prj_a", threadId: "thr_any" },
  });
  const calls = (method: string) => slot.inspection.rpcCalls.filter((call) => call.method === method);
  const answerRow = (id = "n12") => document.querySelector(`[data-answer-item="${id}"]`) as HTMLElement;
  return { slot, calls, answerRow };
}

describe("five-second Undo for ordinary answers", () => {
  // Bug caught: the answer is sent at the click, before Undo can stop it.
  it("Undo before five seconds sends nothing; one valid answer sends exactly one steer after five seconds", async () => {
    const t = mount();
    await flush();
    fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush();
    expect(within(t.answerRow()).getByRole("status").textContent).toContain('Sending "Short headline"… 5 s');
    await advance(UNDO_MS - 100);
    expect(t.calls("deckSteer")).toHaveLength(0);
    fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Undo" }));
    await advance(UNDO_MS * 3);
    expect(t.calls("deckSteer")).toHaveLength(0);
    expect(within(t.answerRow()).getByRole("status").textContent).toContain("Cancelled · nothing was sent. Undone.");

    fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Long headline" }));
    await flush();
    await advance(UNDO_MS);
    expect(t.calls("deckSteer")).toHaveLength(1);
    expect(t.calls("deckSteer")[0].input).toMatchObject({
      kind: "answer", projectKey: "sample-factory", orchestratorThreadId: ORCH, text: null, specAction: null,
      answer: { itemId: "n12", optionId: "long", fingerprint: "fp-n12-1", queueRevision: 2 },
    });
    expect(t.calls("deckBindAnswer").map((call) => (call.input as { optionId: string }).optionId)).toEqual(["short", "long"]);
    await advance(UNDO_MS * 3);
    expect(t.calls("deckSteer")).toHaveLength(1);
  });

  // Bug caught: a choice made on one question is sent after the question, its risk or the queue changed.
  const changes: [string, () => unknown[] | "missing", string][] = [
    ["the wording changes", () => [{ ...ordinary, question: "Which headline ships?" }, gated], "The question or its proposal changed"],
    ["the risk becomes live", () => [{ ...ordinary, risk: "live" }, gated], "The question or its proposal changed"],
    ["the item is resolved", () => [gated], "That question is no longer open"],
    ["the queue becomes unavailable", () => "missing", "stale or unavailable"],
  ];
  for (const [name, next, words] of changes) {
    it(`cancels with no send when ${name} during Undo`, async () => {
      let items: () => unknown[] | "missing" = () => [ordinary, gated];
      const t = mount({ items: () => items() });
      await flush();
      fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
      await flush();
      items = next;
      await t.slot.behavior.emitRealtime("wizdeck", {});
      await advance(UNDO_MS * 2);
      expect(t.calls("deckSteer")).toHaveLength(0);
      expect(document.body.textContent).toContain(words);
    });
  }

  // Bug caught: switching factory or leaving the view still lets the timer send.
  it("switching factory, hiding the page or closing the panel during Undo sends nothing", async () => {
    const a = mount();
    await flush();
    fireEvent.click(within(a.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush();
    fireEvent.change(screen.getByRole("combobox", { name: "Factory" }), { target: { value: "other-factory" } });
    await advance(UNDO_MS * 2);
    expect(a.calls("deckSteer")).toHaveLength(0);
    cleanup();

    const b = mount();
    await flush();
    fireEvent.click(within(b.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(UNDO_MS * 2);
    expect(b.calls("deckSteer")).toHaveLength(0);
    expect(within(b.answerRow()).getByRole("status").textContent).toContain("You left WizDeck.");
    vi.restoreAllMocks();
    cleanup();

    const c = mount();
    await flush();
    fireEvent.click(within(c.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush();
    c.slot.lifecycle.unmount();
    await advance(UNDO_MS * 2);
    expect(c.calls("deckSteer")).toHaveLength(0);
  });

  // Bug caught: a double click starts two answers.
  it("a double click binds one answer and disables every option while it is pending", async () => {
    const t = mount();
    await flush();
    const button = within(t.answerRow()).getByRole("button", { name: "Short headline (rec)" });
    fireEvent.click(button); fireEvent.click(button);
    await flush();
    fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Long headline" }));
    await advance(UNDO_MS);
    expect(t.calls("deckBindAnswer")).toHaveLength(1);
    expect(t.calls("deckSteer")).toHaveLength(1);
  });

  // Bug caught: the shortcut skipping the gated flow for live/release/publish/unknown decisions.
  it("a gated decision has no answer buttons and links to the orchestrator", async () => {
    const t = mount();
    await flush();
    const row = t.answerRow("n14");
    expect(within(row).queryByRole("button", { name: "Publish" })).toBeNull();
    expect(row.textContent).toContain("Gated · publish: decide in the orchestrator.");
    fireEvent.click(within(row).getByRole("button", { name: "Open orchestrator" }));
    expect(t.slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: ORCH }]);
    expect(t.calls("deckBindAnswer")).toHaveLength(0);
  });

  // Bug caught: an uncertain send offered for retry, or a queued one shown as steered.
  it("an uncertain or queued outcome is shown as such and never resent", async () => {
    let state: ActionRecordV1["state"] = "uncertain";
    let records: ActionRecordV1[] = [];
    const t = mount({
      log: (input) => log(records)(input),
      steer: (input) => {
        const made = record({ operationId: input.operationId, kind: "answer", state, label: "Answer N-12 · Short headline", answer: { itemId: "n12", fingerprint: "fp-n12-1", question: ordinary.question } });
        records = [made];
        return made;
      },
    });
    await flush();
    fireEvent.click(within(t.answerRow()).getByRole("button", { name: "Short headline (rec)" }));
    await flush();
    await advance(UNDO_MS);
    await flush();
    expect(t.answerRow().textContent).toContain("Uncertain · it may have arrived. WizDeck will not resend it");
    // The row reports the earlier answer; whether the shown proposal is the same one is the
    // backend's bind check (proved with the real handlers in review-round1.test.tsx, R2).
    expect(t.answerRow().textContent).toContain("Earlier: Answer N-12 · Short headline");
    expect(within(t.answerRow()).queryByRole("button", { name: "Undo" })).toBeNull();
    await advance(UNDO_MS * 6);
    expect(t.calls("deckSteer")).toHaveLength(1);

    state = "queued";
    records = [record({ kind: "answer", state: "queued", label: "Answer N-12 · Short headline", answer: { itemId: "n12", fingerprint: "fp-n12-1", question: ordinary.question } })];
    await t.slot.behavior.emitRealtime("wizdeck-actions", {});
    expect(t.answerRow().textContent).toContain("Waiting · queued by the host, not steered yet.");
  });

  it("answering is off, in words, when the Needs-you file is unavailable", async () => {
    mount({ items: () => "missing" });
    await flush();
    expect(screen.getByText("Answering is off: the Needs-you file is unavailable.")).toBeTruthy();
    expect(document.querySelector("[data-answer-item]")).toBeNull();
  });
});

describe("Tell the factory, feedback and spec actions", () => {
  // Bug caught: an unrelated latest orchestrator message shown as this command's reply.
  it("shows delivery at once and links to the orchestrator for the reply, never inventing one", async () => {
    let records: ActionRecordV1[] = [];
    const t = mount({
      log: (input) => log(records)(input),
      steer: (input) => { const made = record({ operationId: input.operationId, label: input.text }); records = [made]; return made; },
    });
    await flush();
    fireEvent.change(screen.getByRole("textbox", { name: "Message to the orchestrator" }), { target: { value: "Hold new builds until Monday." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await flush();
    expect(t.calls("deckSteer").map((call) => call.input)).toEqual([expect.objectContaining({
      kind: "tell", text: "Hold new builds until Monday.", orchestratorThreadId: ORCH, answer: null, specAction: null,
    })]);
    const recent = screen.getByRole("list", { name: "Recent actions" });
    expect(recent.textContent).toContain("Hold new builds until Monday.");
    expect(recent.textContent).toContain("Sent · steered.");
    expect(recent.textContent).not.toContain("replied");
    expect(screen.getByText(NO_REPLY_CORRELATION.reason)).toBeTruthy();
    fireEvent.click(within(recent).getByRole("button", { name: "Open orchestrator" }));
    expect(t.slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: ORCH }]);
  });

  // Bug caught: the spec menu or feedback acting on GitHub or the fleet instead of messaging the orchestrator.
  it("spec actions and feedback are steers through the one RPC; Open spec only opens the link", async () => {
    const t = mount();
    await flush();
    const group = screen.getByRole("group", { name: "Spec actions" });
    for (const name of ["Pause", "Resume", "Prioritise", "Ask why"]) {
      fireEvent.click(within(group).getByRole("button", { name }));
      await flush();
    }
    fireEvent.change(screen.getByRole("textbox", { name: "Message to the orchestrator" }), { target: { value: "The spec menu is hard to find." } });
    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    await flush();
    fireEvent.click(within(group).getByRole("button", { name: "Open spec" }));
    expect(t.calls("deckSteer").map((call) => {
      const input = call.input as { kind: string; specAction: { action: string; spec: string } | null; text: string | null };
      return input.specAction ? `${input.kind}:${input.specAction.action}:${input.specAction.spec}` : `${input.kind}:${input.text}`;
    })).toEqual([
      `spec-action:pause:${repo}#41`, `spec-action:resume:${repo}#41`, `spec-action:prioritise:${repo}#41`, `spec-action:ask-why:${repo}#41`,
      "feedback:The spec menu is hard to find.",
    ]);
    expect(t.slot.inspection.navigateCalls).toEqual([{ method: "openUrl", url: `https://github.com/${repo}/issues/41` }]);
    expect(t.slot.inspection.sdkCalls).toEqual([]);
  });

  it("an unverified orchestrator disables every send, in words", async () => {
    mount({ log: log([], { status: "unavailable", threadId: ORCH, detail: "The orchestrator thread is archived or deleted." }) });
    await flush();
    expect(screen.getByText("Sending is off: The orchestrator thread is archived or deleted.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Short headline (rec)" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("textbox", { name: "Message to the orchestrator" }) as HTMLTextAreaElement).disabled).toBe(true);
  });
});
