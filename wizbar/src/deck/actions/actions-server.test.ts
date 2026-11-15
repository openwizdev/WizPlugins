// D2 (#74) backend proofs: the steer RPCs registered on the SDK's fake host, a
// fake `threads.send`/`threads.get` and a fake queue file, on one fake clock.
// Fixtures prove the boundary only; no live host or steer was used.
import { createHash } from "node:crypto";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deckSettingDescriptors } from "../data/binding";
import { dxFactory, dxNow, dxQueue, dxSettings } from "../data/fixtures";
import { registerDeckActions } from "./server";
import { SEND_TIMEOUT_MS, type ActionLogV1, type ActionRecordV1, type BindAnswerResultV1 } from "./protocol";

const hosts: FakePluginHost[] = [];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const ORCH = dxFactory.orchestratorThreadId;
const shown = {
  code: "N-12", question: "Which changelog headline ships?", risk: "ordinary",
  options: [{ id: "short", label: "Short headline" }, { id: "long", label: "Long headline" }],
};
const orchestratorThread = (overrides: Record<string, unknown> = {}) => ({
  id: ORCH, projectId: dxFactory.cloudroomProjectId, archivedAt: null, deletedAt: null, title: "Sample orchestrator", titleFallback: null, ...overrides,
});

function setup(options: { send?: (args: unknown) => Promise<unknown>; get?: () => Promise<unknown> } = {}) {
  const fetch = vi.fn(async () => { throw new Error("no GitHub call is expected from an action"); });
  vi.stubGlobal("fetch", fetch);
  let queueText = dxQueue();
  let readFails = false;
  const read = vi.fn(async ({ path }: { path: string }) => {
    if (readFails) throw Object.assign(new Error("offline"), { status: 503 });
    return { content: queueText, contentEncoding: "utf8", path, sha256: sha(queueText), sizeBytes: queueText.length };
  });
  const write = vi.fn(async () => { throw new Error("no writes"); });
  const send = vi.fn(options.send ?? (async () => ({ ok: true, delivery: "sent" })));
  const get = vi.fn(options.get ?? (async () => orchestratorThread()));
  const timeline = vi.fn(async () => ({ rows: [{ kind: "message", role: "assistant", text: "An unrelated latest reply" }] }));
  const spawn = vi.fn(); const tell = vi.fn();
  const host = createFakePluginHost({
    pluginId: "wizbar", settings: dxSettings(),
    sdk: { files: { read, write }, threads: { list: vi.fn(async () => []), get, send, timeline, spawn, queue: { tell } } } as never,
  });
  hosts.push(host);
  registerDeckActions(host.bb, { settings: host.bb.settings.define(deckSettingDescriptors) });
  const rpc = <T>(name: string, input: unknown) => host.harness.behavior.callRpc(name, input) as Promise<T>;
  const bind = (extra: Record<string, unknown> = {}) =>
    rpc<BindAnswerResultV1>("deckBindAnswer", { projectKey: "sample-factory", itemId: "n12", optionId: "short", shown, ...extra });
  let ops = 0;
  const steer = (extra: Record<string, unknown> = {}) => rpc<ActionRecordV1>("deckSteer", {
    operationId: `op-test-${String(++ops).padStart(4, "0")}`, projectKey: "sample-factory", orchestratorThreadId: ORCH,
    kind: "tell", text: "Hold new builds until Monday.", answer: null, specAction: null, ...extra,
  });
  const answer = async (extra: Record<string, unknown> = {}) => {
    const bound = await bind();
    if (!bound.ok) throw new Error(`bind refused: ${bound.reason}`);
    const { itemId, optionId, fingerprint, queueRevision } = bound.bound;
    return { bound: bound.bound, args: { kind: "answer", text: null, answer: { itemId, optionId, fingerprint, queueRevision }, ...extra } };
  };
  return {
    host, fetch, read, write, send, get, timeline, spawn, tell, rpc, bind, steer, answer,
    setQueue: (text: string) => { queueText = text; }, failReads: () => { readFails = true; },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(dxNow); });
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

const queueItem = JSON.parse(dxQueue()).items[0];

describe("one answer, one steer to the configured orchestrator", () => {
  // Bug caught: the wrong thread or mode, queue mode substituted, or the
  // plugin-local operation id cast into an unsupported send field.
  it("sends exactly the SDK's three steer arguments to the bound orchestrator", async () => {
    const t = setup();
    const { args } = await t.answer();
    const record = await t.steer(args);
    expect(record.state).toBe("sent");
    expect(record.label).toBe("Answer N-12 · Short headline");
    expect(t.send).toHaveBeenCalledTimes(1);
    const sent = t.send.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["input", "mode", "threadId"]);
    expect(sent.threadId).toBe(ORCH);
    expect(sent.mode).toBe("steer");
    const input = sent.input as { type: string; text: string; mentions: unknown[] }[];
    expect(input).toHaveLength(1);
    expect(Object.keys(input[0]).sort()).toEqual(["mentions", "text", "type"]);
    expect(input[0].type).toBe("text");
    expect(input[0].mentions).toEqual([]);
    expect(input[0].text).toContain("Choice: Short headline (option short)");
    expect(input[0].text).toContain("fingerprint fp-n12-1 · queue revision 2");
    expect(input[0].text).toContain("not itself an approval");
    // The queue was read once to bind and once more just before the send.
    expect(t.read).toHaveBeenCalledTimes(2);
    expect(t.get).toHaveBeenCalledWith({ threadId: ORCH });
  });
});

describe("stale, changed and wrong-target answers cancel before any send", () => {
  const changed: [string, () => string, string][] = [
    ["a newer queue revision", () => dxQueue({ revision: 3 }), "revision-changed"],
    ["the item resolved", () => dxQueue({ revision: 2, items: [] }), "item-gone"],
    ["a changed proposal fingerprint", () => dxQueue({ items: [{ ...queueItem, fingerprint: "fp-n12-2" }] }), "proposal-changed"],
    ["risk raised to live", () => dxQueue({ items: [{ ...queueItem, risk: "live" }] }), "gated-risk"],
    ["the option withdrawn", () => dxQueue({ items: [{ ...queueItem, options: [{ id: "long", label: "Long headline" }], recommendedOptionId: null }] }), "unknown-option"],
    ["a file for another project", () => dxQueue({ project: "other-factory" }), "queue-unavailable"],
    ["an expired file", () => dxQueue({ expiresAt: "2026-11-15T20:30:00Z" }), "queue-unavailable"],
  ];
  // Bug caught: a delayed answer sent against a queue that changed during Undo.
  for (const [name, next, reason] of changed) {
    it(`${name} cancels with ${reason} and sends nothing`, async () => {
      const t = setup();
      const { args } = await t.answer();
      t.setQueue(next());
      const record = await t.steer(args);
      expect(record.state).toBe("cancelled");
      expect(record.reason).toBe(reason);
      expect(t.send).not.toHaveBeenCalled();
    });
  }

  it("an unreadable queue at dispatch cancels and sends nothing", async () => {
    const t = setup();
    const { args } = await t.answer();
    t.failReads();
    const record = await t.steer(args);
    expect(record.reason).toBe("queue-unavailable");
    expect(t.send).not.toHaveBeenCalled();
  });

  // Bug caught: binding an answer to wording the person never saw.
  it("refuses to bind when the shown wording, options or risk differ from the file", async () => {
    const t = setup();
    for (const different of [
      { ...shown, question: "Which headline ships?" },
      { ...shown, options: [...shown.options].reverse() },
      { ...shown, risk: "release" },
    ]) {
      const bound = await t.bind({ shown: different });
      expect(bound).toMatchObject({ ok: false, reason: "proposal-changed" });
    }
    t.setQueue(dxQueue({ items: [{ ...queueItem, risk: "publish" }] }));
    expect(await t.bind({ shown: { ...shown, risk: "publish" } })).toMatchObject({ ok: false, reason: "gated-risk" });
    expect(t.send).not.toHaveBeenCalled();
  });

  // Bug caught: a send to an unconfigured factory, a stale target or an orchestrator that is not the bound project's.
  it("an unknown project, a changed target or an unverified orchestrator sends nothing", async () => {
    const cases: [string, ReturnType<typeof setup>, Record<string, unknown>, string][] = [];
    const a = setup(); cases.push(["unknown project", a, { projectKey: "other-factory" }, "wrong-project"]);
    const b = setup(); cases.push(["changed target", b, { orchestratorThreadId: "thr_d2_previous" }, "wrong-target"]);
    for (const [label, get] of [
      ["other project", async () => orchestratorThread({ projectId: "prj_d2_elsewhere" })],
      ["archived", async () => orchestratorThread({ archivedAt: dxNow - 1 })],
      ["different thread", async () => orchestratorThread({ id: "thr_d2_other" })],
      ["unreadable", async () => { throw new Error("offline"); }],
    ] as const) cases.push([label, setup({ get }), {}, "orchestrator-unverified"]);
    for (const [label, t, extra, reason] of cases) {
      for (const kind of ["tell", "answer"]) {
        const args = kind === "answer" ? (await t.answer()).args : {};
        const record = await t.steer({ ...args, ...extra });
        expect({ label, kind, reason: record.reason }).toEqual({ label, kind, reason });
      }
      expect(t.send).not.toHaveBeenCalled();
    }
  });
});

describe("duplicates and uncertain outcomes never send twice", () => {
  // Bug caught: a double click or a copied tab sends one answer twice.
  it("a repeated operation id joins one send; a second operation for the same answer is refused", async () => {
    let release!: (value: unknown) => void;
    const t = setup({ send: () => new Promise((resolve) => { release = resolve; }) });
    const { args } = await t.answer();
    const same = { ...args, operationId: "op-test-double-click" };
    const first = t.steer(same);
    const second = t.steer(same);
    const other = t.steer(args);
    for (let turn = 0; turn < 100 && t.send.mock.calls.length === 0; turn += 1) await vi.advanceTimersByTimeAsync(0);
    expect(t.send).toHaveBeenCalledTimes(1);
    release({ ok: true, delivery: "sent" });
    const [one, two, three] = await Promise.all([first, second, other]);
    expect(one.state).toBe("sent");
    expect(two).toEqual(one);
    expect(three).toMatchObject({ state: "cancelled", reason: "duplicate" });
    expect(await t.steer(same)).toEqual(one);
    expect(await t.bind()).toMatchObject({ ok: false, reason: "duplicate" });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a transport failure treated as safe to repeat.
  it("a rejected send is uncertain, and neither a repeat nor a new operation resends it", async () => {
    const t = setup({ send: async () => { throw new Error("socket closed"); } });
    const { args } = await t.answer();
    const op = { ...args, operationId: "op-test-uncertain" };
    const record = await t.steer(op);
    expect(record.state).toBe("uncertain");
    expect(await t.steer(op)).toMatchObject({ state: "uncertain" });
    expect(await t.steer(args)).toMatchObject({ state: "cancelled", reason: "duplicate" });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("a send the host never answers becomes uncertain after the timeout and is not resent", async () => {
    const t = setup({ send: () => new Promise(() => undefined) });
    const pending = t.steer({ operationId: "op-test-hanging" });
    await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
    expect(await pending).toMatchObject({ state: "uncertain" });
    expect(await t.steer({ operationId: "op-test-hanging" })).toMatchObject({ state: "uncertain" });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a host-held message shown as steered.
  it("a queued delivery is waiting, not steered", async () => {
    const t = setup({ send: async () => ({ ok: true, delivery: "queued", queuedMessage: { id: "qm_d2_1", content: [] } }) });
    const record = await t.steer({});
    expect(record.state).toBe("queued");
    expect(record.detail).toBe("Queued by the host: waiting, not steered yet.");
  });

  // Bug caught: sending before the operation is recorded, so a crash forgets it and a retry repeats it.
  it("saves the operation before the send, and an unsaved operation is never sent", async () => {
    const seen: unknown[] = [];
    const t = setup({
      send: async () => {
        const names = await t.host.bb.storage.kv.list("wizdeck.action.");
        seen.push(...await Promise.all(names.map((name) => t.host.bb.storage.kv.get(name))));
        return { ok: true, delivery: "sent" };
      },
    });
    await t.steer({ operationId: "op-test-saved-first" });
    expect(seen).toEqual([expect.objectContaining({ operationId: "op-test-saved-first", state: "dispatching" })]);

    vi.spyOn(t.host.bb.storage.kv, "set").mockRejectedValue(new Error("disk full"));
    const record = await t.steer({ operationId: "op-test-not-saved" });
    expect(record).toMatchObject({ state: "cancelled", reason: "not-saved" });
    expect(t.send).toHaveBeenCalledTimes(1);
  });
});

describe("spec actions and feedback steer only the orchestrator", () => {
  // Bug caught: a spec menu or feedback reaching GitHub, the queue file or another thread directly.
  it("each makes one steer to the orchestrator and no GitHub, file or thread write", async () => {
    const t = setup();
    const pause = await t.steer({ kind: "spec-action", text: null, specAction: { spec: "example-org/sample-app#41", action: "pause" } });
    const why = await t.steer({ kind: "spec-action", text: null, specAction: { spec: "example-org/sample-app#41", action: "ask-why" } });
    const feedback = await t.steer({ kind: "feedback", text: "The spec menu is hard to find." });
    expect([pause.state, why.state, feedback.state]).toEqual(["sent", "sent", "sent"]);
    expect(pause.label).toBe("Pause example-org/sample-app#41");
    expect(t.send).toHaveBeenCalledTimes(3);
    for (const [args] of t.send.mock.calls as unknown as [{ threadId: string; mode: string }][]) {
      expect(args.threadId).toBe(ORCH);
      expect(args.mode).toBe("steer");
    }
    const texts = (t.send.mock.calls as unknown as [{ input: { text: string }[] }][]).map(([args]) => args.input[0].text);
    expect(texts[0]).toContain("WizDeck changed nothing on GitHub");
    expect(texts[2]).toContain("file a public-safe WizDeck issue");
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.write).not.toHaveBeenCalled();
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.tell).not.toHaveBeenCalled();
    expect(t.read).not.toHaveBeenCalled();
  });

  it("refuses a spec outside the factory's repositories and empty text, sending nothing", async () => {
    const t = setup();
    expect(await t.steer({ kind: "spec-action", text: null, specAction: { spec: "example-org/unrelated#5", action: "resume" } }))
      .toMatchObject({ state: "cancelled", reason: "invalid" });
    expect(await t.steer({ kind: "tell", text: "   " })).toMatchObject({ state: "cancelled", reason: "invalid" });
    expect(t.send).not.toHaveBeenCalled();
  });
});

describe("the reply is never guessed", () => {
  // Bug caught: the latest, unrelated orchestrator message labelled as this command's reply.
  it("the action log links to the orchestrator and carries no reply text", async () => {
    const t = setup();
    await t.steer({});
    const log = await t.rpc<ActionLogV1>("deckActionLog", { projectKey: "sample-factory" });
    expect(log.orchestrator).toEqual({ status: "verified", threadId: ORCH, title: "Sample orchestrator" });
    expect(log.reply.status).toBe("link-only");
    expect(log.records).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain("An unrelated latest reply");
    expect(t.timeline).not.toHaveBeenCalled();
  });

  it("an unverified orchestrator is shown as unavailable in the log", async () => {
    const t = setup({ get: async () => orchestratorThread({ deletedAt: dxNow }) });
    const log = await t.rpc<ActionLogV1>("deckActionLog", { projectKey: "sample-factory" });
    expect(log.orchestrator).toMatchObject({ status: "unavailable", detail: "The orchestrator thread is archived or deleted." });
  });
});
