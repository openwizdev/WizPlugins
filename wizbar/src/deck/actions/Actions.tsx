// WizDeck's D2 actions (#74), shown in Home's D2 slot under Needs you:
// five-second Undo answers, Tell the factory with feedback, and spec actions.
// Every action is one call to the backend's steer RPC; the panel never sends
// to a thread itself and never writes to GitHub. Ledger style, as D1.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { NeedsYouViewItemV1 } from "../../factory-contract";
import type { HomeViewV1 } from "../data/home";
import { LIME, SectionHeading, tapTarget } from "../home/sections";
import {
  ACTIONS_CHANNEL, MAX_TEXT, SPEC_ACTIONS, UNDO_MS, refusalWords,
  type ActionLogV1, type ActionRecordV1, type BoundAnswerV1, type SpecActionV1,
} from "./protocol";
import type { deckActionsRpcContract } from "./server";

const muted: CSSProperties = { color: "var(--muted-foreground)" };
const rule = "1px solid var(--border)";
const row: CSSProperties = { padding: "8px 0", borderBottom: rule };
const linkButton: CSSProperties = {
  minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 2px", border: 0, background: "transparent",
  color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 3, font: "inherit", cursor: "pointer",
};
const specActionLabels: Record<SpecActionV1, string> = { pause: "Pause", resume: "Resume", prioritise: "Prioritise", "ask-why": "Ask why" };

const newOperationId = () => `op-${globalThis.crypto.randomUUID()}`;

/** What the person saw for one item; any change while pending cancels. */
const shownOf = (item: NeedsYouViewItemV1) => ({
  code: item.code, question: item.question, risk: item.risk,
  options: item.options.map(({ id, label }) => ({ id, label })),
});
const sameShown = (a: ReturnType<typeof shownOf>, b: ReturnType<typeof shownOf>) => JSON.stringify(a) === JSON.stringify(b);

export function stateWords(record: Pick<ActionRecordV1, "state" | "detail">): string {
  switch (record.state) {
    case "dispatching": return "Sending…";
    case "sent": return "Sent · steered. The orchestrator checks it and records the decision.";
    case "queued": return "Waiting · queued by the host, not steered yet.";
    case "uncertain": return "Uncertain · it may have arrived. WizDeck will not resend it; check the orchestrator.";
    case "cancelled": return `Cancelled · nothing was sent. ${record.detail ?? ""}`.trim();
  }
}

interface Pending {
  operationId: string;
  projectKey: string;
  itemId: string;
  optionId: string;
  optionLabel: string;
  shown: ReturnType<typeof shownOf>;
  phase: "binding" | "waiting" | "dispatching";
  bound: BoundAnswerV1 | null;
  deadline: number | null;
}

export function DeckActions({ projectKey, view, open }: { projectKey: string; view: HomeViewV1; open: (url: string) => void }) {
  const rpc = useRpc<typeof deckActionsRpcContract>();
  const navigate = useBbNavigate();
  const [log, setLog] = useState<ActionLogV1 | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  /** The last outcome per item in this panel, for words beside it. */
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** The latest cancellation, kept visible even when its row is gone or no longer answerable. */
  const [notice, setNotice] = useState<{ itemId: string; words: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [spec, setSpec] = useState<string>("");
  const [now, setNow] = useState(() => Date.now());

  const loadLog = useCallback(async () => {
    try {
      const next = await rpc.call("deckActionLog", { projectKey });
      setLog(next);
      setLogError(null);
    } catch (caught) {
      setLogError(caught instanceof Error ? caught.message : "The action log could not be read.");
    }
  }, [rpc, projectKey]);
  useEffect(() => { void loadLog(); }, [loadLog]);
  useRealtime(ACTIONS_CHANNEL, () => { void loadLog(); });

  const current = log && log.projectKey === projectKey ? log : null;
  const orchestrator = current?.orchestrator ?? null;
  const canSend = orchestrator?.status === "verified";
  const openOrchestrator = orchestrator?.threadId ? () => navigate.toThread(orchestrator.threadId!) : null;

  const cancelPending = useCallback((words: string) => {
    const was = pendingRef.current;
    if (!was || was.phase === "dispatching") return;
    pendingRef.current = null;
    setPending(null);
    setNotes((all) => ({ ...all, [was.itemId]: `Cancelled · nothing was sent. ${words}` }));
    setNotice({ itemId: was.itemId, words: `${was.shown.code}: Cancelled · nothing was sent. ${words}` });
  }, []);

  // ---- Cancel on any change to what was shown, the factory, or freshness.
  const items = view.needsYou.view?.state === "ready" ? view.needsYou.view.items : [];
  useEffect(() => {
    const was = pendingRef.current;
    if (!was || was.phase === "dispatching") return;
    if (was.projectKey !== projectKey) return cancelPending("The factory changed.");
    if (view.needsYou.freshness !== "fresh") return cancelPending("The Needs-you file is stale or unavailable.");
    const item = items.find((candidate) => candidate.id === was.itemId);
    if (!item) return cancelPending(refusalWords["item-gone"]);
    if (!sameShown(shownOf(item), was.shown)) return cancelPending(refusalWords["proposal-changed"]);
  });

  // Leaving the view: hiding the page cancels, and unmounting clears the timer, so nothing is sent.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") cancelPending("You left WizDeck."); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [cancelPending]);

  // ---- The Undo window: one timer; the countdown ticks once a second.
  useEffect(() => {
    if (pending?.phase !== "waiting" || pending.deadline === null) return;
    const ticker = setInterval(() => setNow(Date.now()), 1_000);
    const timer = setTimeout(() => {
      const ready = pendingRef.current;
      if (!ready || ready.operationId !== pending.operationId || ready.phase !== "waiting" || !ready.bound) return;
      if (!current) return cancelPending(refusalWords["orchestrator-unverified"]);
      const dispatching = { ...ready, phase: "dispatching" as const };
      pendingRef.current = dispatching;
      setPending(dispatching);
      const { itemId, optionId, fingerprint, queueRevision } = ready.bound;
      void rpc.call("deckSteer", {
        operationId: ready.operationId, projectKey: ready.projectKey,
        orchestratorThreadId: current.orchestrator.threadId ?? "", kind: "answer", text: null,
        answer: { itemId, optionId, fingerprint, queueRevision }, specAction: null,
      }).then(
        (record) => setNotes((all) => ({ ...all, [itemId]: stateWords(record) })),
        // The call may have reached the backend: uncertain, never retried.
        () => setNotes((all) => ({ ...all, [itemId]: stateWords({ state: "uncertain", detail: null }) })),
      ).finally(() => {
        if (pendingRef.current?.operationId === ready.operationId) { pendingRef.current = null; setPending(null); }
        void loadLog();
      });
    }, Math.max(0, pending.deadline - Date.now()));
    return () => { clearTimeout(timer); clearInterval(ticker); };
  }, [pending?.operationId, pending?.phase]);

  const choose = async (item: NeedsYouViewItemV1, optionId: string) => {
    if (pendingRef.current || !canSend) return;
    const option = item.options.find((candidate) => candidate.id === optionId)!;
    const next: Pending = {
      operationId: newOperationId(), projectKey, itemId: item.id, optionId, optionLabel: option.label,
      shown: shownOf(item), phase: "binding", bound: null, deadline: null,
    };
    pendingRef.current = next;
    setPending(next);
    setNotes((all) => { const { [item.id]: _gone, ...rest } = all; return rest; });
    let result: Awaited<ReturnType<typeof rpc.call<"deckBindAnswer">>>;
    try {
      result = await rpc.call("deckBindAnswer", { projectKey, itemId: item.id, optionId, shown: next.shown });
    } catch {
      result = { ok: false, reason: "queue-unavailable", detail: "WizDeck could not check the question." };
    }
    if (pendingRef.current?.operationId !== next.operationId) return; // Undone or cancelled meanwhile.
    if (!result.ok) return cancelPending(result.detail);
    const waiting: Pending = { ...next, phase: "waiting", bound: result.bound, deadline: Date.now() + UNDO_MS };
    pendingRef.current = waiting;
    setPending(waiting);
    setNow(Date.now());
  };

  const steerNow = async (kind: "tell" | "feedback" | "spec-action", text: string | null, specAction: { spec: string; action: SpecActionV1 } | null) => {
    if (busy || !canSend || !current) return;
    setBusy(true);
    try {
      const record = await rpc.call("deckSteer", {
        operationId: newOperationId(), projectKey, orchestratorThreadId: current.orchestrator.threadId ?? "",
        kind, text, answer: null, specAction,
      });
      if (record.state !== "cancelled" && kind !== "spec-action") setDraft("");
    } catch {
      setLogError("The last action's outcome is unknown. It may have arrived; WizDeck will not resend it.");
    } finally {
      setBusy(false);
      void loadLog();
    }
  };

  const answered = (item: NeedsYouViewItemV1) => current?.records.find((record) =>
    record.state !== "cancelled" && record.answer?.itemId === item.id && record.answer.question === item.question) ?? null;
  const specs = view.board.versions.flatMap((version) => version.specs);
  const selectedSpec = specs.find((candidate) => candidate.ref === spec) ?? specs[0] ?? null;
  const queueState = view.needsYou.view?.state ?? null;
  const offWords = logError ?? (orchestrator === null ? "Checking the orchestrator…"
    : orchestrator.status === "unavailable" ? `Sending is off: ${orchestrator.detail}` : null);
  const orchestratorButton = (label: string) => openOrchestrator
    ? <button type="button" style={tapTarget} onClick={openOrchestrator}>{label}</button> : null;

  return (
    <div className="wizdeck-actions">
      {offWords && <p role="status" style={{ ...muted, margin: "8px 0" }}>{offWords}</p>}
      {notice && !(queueState === "ready" && items.some((item) => item.id === notice.itemId && item.risk === "ordinary")) && (
        <p role="status" style={{ ...muted, margin: "8px 0" }}>{notice.words}</p>
      )}

      {/* Answer: ordinary decisions get five seconds to undo; gated ones go to the orchestrator. */}
      {queueState === "unavailable" && (
        <p role="status" style={{ ...muted, margin: "8px 0" }}>Answering is off: the Needs-you file is unavailable.</p>
      )}
      {queueState === "ready" && items.length > 0 && (
        <section aria-labelledby="wizdeck-answer">
          <SectionHeading id="wizdeck-answer">Answer</SectionHeading>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item) => {
              const mine = pending?.itemId === item.id ? pending : null;
              const done = answered(item);
              const gated = item.risk !== "ordinary";
              return (
                <li key={item.id} data-answer-item={item.id} style={row}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.code} · {item.question}</p>
                  {gated ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                      <span style={muted}>Gated · {item.risk}: decide in the orchestrator.</span>
                      {orchestratorButton("Open orchestrator")}
                    </div>
                  ) : done ? (
                    <p role="status" style={{ ...muted, margin: "2px 0 0" }}>{done.label}: {stateWords(done)}</p>
                  ) : (
                    <>
                      <div role="group" aria-label={`Answer ${item.code}`} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                        {item.options.map((option) => {
                          const recommended = option.id === item.recommendedOptionId;
                          return (
                            <button key={option.id} type="button" disabled={!canSend || pending !== null}
                              onClick={() => { void choose(item, option.id); }}
                              style={{ ...tapTarget, borderColor: recommended ? LIME : "var(--border)", opacity: !canSend || (pending && !mine) ? 0.6 : 1 }}>
                              {recommended ? `${option.label} (rec)` : option.label}
                            </button>
                          );
                        })}
                      </div>
                      {mine && (
                        <div role="status" aria-live="polite" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
                          <span>
                            {mine.phase === "binding" ? `Checking "${mine.optionLabel}"…`
                              : mine.phase === "waiting" ? <>Sending "{mine.optionLabel}"… <span style={{ color: LIME }}>{Math.max(1, Math.ceil(((mine.deadline ?? now) - now) / 1000))} s</span></>
                              : `Sending "${mine.optionLabel}"…`}
                          </span>
                          {mine.phase !== "dispatching" && (
                            <button type="button" style={{ ...tapTarget, color: LIME }} onClick={() => cancelPending("Undone.")}>Undo</button>
                          )}
                        </div>
                      )}
                      {!mine && notes[item.id] && <p role="status" style={{ ...muted, margin: "4px 0 0" }}>{notes[item.id]}</p>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Tell the factory, and feedback, by the same steer. */}
      <section aria-labelledby="wizdeck-tell">
        <SectionHeading id="wizdeck-tell">Tell the factory</SectionHeading>
        <label style={{ display: "block" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Message to the orchestrator</span>
          <textarea value={draft} maxLength={MAX_TEXT} rows={3} disabled={!canSend || busy}
            onChange={(event) => setDraft(event.target.value)} placeholder="Tell the orchestrator what to do…"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 64, padding: 8, borderRadius: 8, border: rule, background: "transparent", color: "var(--foreground)", font: "inherit", resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          <button type="button" style={tapTarget} disabled={!canSend || busy || !draft.trim()} onClick={() => { void steerNow("tell", draft.trim(), null); }}>Send</button>
          <button type="button" style={tapTarget} disabled={!canSend || busy || !draft.trim()} onClick={() => { void steerNow("feedback", draft.trim(), null); }}>Feedback</button>
        </div>
        {current && current.records.length > 0 && (
          <ul aria-label="Recent actions" style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
            {current.records.slice(0, 5).map((record) => (
              <li key={record.operationId} data-operation={record.operationId} data-state={record.state}
                style={{ ...row, display: "flex", flexWrap: "wrap", gap: "0 12px", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, overflowWrap: "anywhere" }}>{record.label}</p>
                  <p style={{ ...muted, margin: 0 }}>{stateWords(record)}</p>
                </div>
                {record.state !== "cancelled" && openOrchestrator && (
                  <span style={muted}>Reply: <button type="button" style={linkButton} onClick={openOrchestrator}>Open orchestrator</button></span>
                )}
              </li>
            ))}
          </ul>
        )}
        {current && current.records.length > 0 && <p style={{ ...muted, margin: "4px 0 0", fontSize: 12 }}>{current.reply.reason}</p>}
      </section>

      {/* Spec actions: a message to the orchestrator; nothing changes on GitHub from here. */}
      {selectedSpec && (
        <section aria-labelledby="wizdeck-spec-actions">
          <SectionHeading id="wizdeck-spec-actions">Spec actions</SectionHeading>
          <label style={{ display: "block" }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Spec</span>
            <select value={selectedSpec.ref} onChange={(event) => setSpec(event.target.value)}
              style={{ ...tapTarget, width: "100%", justifyContent: "flex-start", padding: "0 10px", background: "var(--background)" }}>
              {specs.map((candidate) => <option key={candidate.ref} value={candidate.ref}>{candidate.title} · {candidate.ref}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Spec actions" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {SPEC_ACTIONS.map((action) => (
              <button key={action} type="button" style={tapTarget} disabled={!canSend || busy}
                onClick={() => { void steerNow("spec-action", null, { spec: selectedSpec.ref, action }); }}>
                {specActionLabels[action]}
              </button>
            ))}
            <button type="button" style={tapTarget} onClick={() => open(selectedSpec.url)}>Open spec</button>
          </div>
        </section>
      )}
    </div>
  );
}
