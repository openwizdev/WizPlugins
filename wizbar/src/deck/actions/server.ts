// WizDeck's one steer path (D2, #74; factory-view.v1.md section 4). Answers,
// Tell the factory, spec actions and feedback all end in exactly one
// `bb.sdk.threads.send(steerSendArgs(request))` to the bound, freshly verified
// orchestrator. Nothing here writes to GitHub, the queue file or any other
// thread, and nothing is ever re-sent.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  checkSteerDispatch, steerOutcome, steerSendArgs,
  type NeedsYouItemV1, type QueueReadV1, type SpecRefV1, type SteerRequestV1,
} from "../../factory-contract";
import { readDeckFactories, type DeckFactoryV1 } from "../data/binding";
import { ReadUnavailable } from "../data/cache";
import { loadQueue } from "../data/queue";
import {
  ACTIONS_CHANNEL, MAX_TEXT, NO_REPLY_CORRELATION, SEND_TIMEOUT_MS, SPEC_ACTIONS, refusalWords,
  type ActionLogV1, type ActionRecordV1, type ActionRefusalV1, type BindAnswerResultV1,
} from "./protocol";
import { answerText, feedbackText, specActionLabel, specActionText, tellText } from "./text";

const operationId = z.string().regex(/^op-[A-Za-z0-9-]{8,80}$/);
const key = z.string().min(1).max(128);
const shownItem = z.object({
  code: z.string().max(64),
  question: z.string().max(4_000),
  options: z.array(z.object({ id: z.string().max(128), label: z.string().max(1_000) }).strict()).max(50),
  risk: z.string().max(16),
}).strict();

const steerInput = z.object({
  operationId,
  projectKey: key,
  /** The orchestrator the panel showed; a changed binding cancels. */
  orchestratorThreadId: z.string().min(1).max(256),
  kind: z.enum(["answer", "tell", "spec-action", "feedback"]),
  text: z.string().max(MAX_TEXT).nullable(),
  answer: z.object({ itemId: key, optionId: key, fingerprint: z.string().min(1).max(512), queueRevision: z.int().min(0) }).strict().nullable(),
  specAction: z.object({ spec: z.string().max(256), action: z.enum(SPEC_ACTIONS) }).strict().nullable(),
}).strict();

const isObject = (value: unknown) => typeof value === "object" && value !== null;

export const deckActionsRpcContract = defineRpcContract({
  deckActionLog: { input: z.object({ projectKey: key }).strict(), output: z.custom<ActionLogV1>(isObject) },
  deckBindAnswer: {
    input: z.object({ projectKey: key, itemId: key, optionId: key, shown: shownItem }).strict(),
    output: z.custom<BindAnswerResultV1>(isObject),
  },
  deckSteer: { input: steerInput, output: z.custom<ActionRecordV1>(isObject) },
});

const RECORD_PREFIX = "wizdeck.action.";
const LOG_LIMIT = 20;

type Verified = { ok: true; title: string | null } | { ok: false; detail: string };

/** The handle D1's readers defined for `deckSettingDescriptors`; the SDK allows one definition. */
export interface DeckSettingsSource {
  get(): Promise<{ wizdeckFactories?: unknown }>;
}

export function registerDeckActions(bb: BbPluginApi, options: { settings: DeckSettingsSource; now?: () => number }): void {
  const now = options.now ?? Date.now;
  const { settings } = options;
  const kv = bb.storage.kv;
  /** Operations whose SDK call has not settled in this process. */
  const inflight = new Map<string, Promise<ActionRecordV1>>();
  /** Answers being dispatched now, by project, item and fingerprint: a second click joins nothing. */
  const answering = new Set<string>();

  const factoryFor = async (projectKey: string): Promise<DeckFactoryV1 | null> => {
    const read = readDeckFactories((await settings.get()).wizdeckFactories);
    if (!read.ok) return null;
    return read.factories.find((factory) => factory.binding.projectKey === projectKey) ?? null;
  };

  const verifyOrchestrator = async ({ binding }: DeckFactoryV1): Promise<Verified> => {
    let thread: Awaited<ReturnType<typeof bb.sdk.threads.get>>;
    try {
      thread = await bb.sdk.threads.get({ threadId: binding.orchestratorThreadId });
    } catch {
      return { ok: false, detail: "The orchestrator thread could not be read." };
    }
    if (!thread || thread.id !== binding.orchestratorThreadId) return { ok: false, detail: "The host returned a different thread." };
    if (thread.projectId !== binding.cloudroomProjectId) return { ok: false, detail: "The orchestrator is not in this factory's Cloudroom project." };
    if (thread.archivedAt !== null || thread.deletedAt !== null) return { ok: false, detail: "The orchestrator thread is archived or deleted." };
    return { ok: true, title: thread.title ?? thread.titleFallback ?? null };
  };

  const freshQueue = async ({ binding }: DeckFactoryV1): Promise<QueueReadV1> => {
    try {
      const { data } = await loadQueue(bb.sdk.files.read, binding, { now });
      return { ok: true, queue: data.queue };
    } catch (error) {
      return { ok: false, reason: error instanceof ReadUnavailable ? error.reason : "unreadable" };
    }
  };

  const readRecord = async (id: string) => (await kv.get<ActionRecordV1>(`${RECORD_PREFIX}${id}`)) ?? null;
  const saveRecord = async (record: ActionRecordV1) => { await kv.set(`${RECORD_PREFIX}${record.operationId}`, record); };
  const publish = () => { void Promise.resolve(bb.realtime.publish(ACTIONS_CHANNEL, {})).catch(() => undefined); };

  /** A record as a reader should see it: one left `dispatching` by an earlier process is uncertain. */
  const shown = (record: ActionRecordV1): ActionRecordV1 =>
    record.state === "dispatching" && !inflight.has(record.operationId)
      ? { ...record, state: "uncertain", detail: "WizDeck restarted before the host answered. It may have arrived; it is not resent." }
      : record;

  const listRecords = async (projectKey: string): Promise<ActionRecordV1[]> => {
    const records: ActionRecordV1[] = [];
    for (const name of await kv.list(RECORD_PREFIX)) {
      const record = await kv.get<ActionRecordV1>(name);
      if (record && record.projectKey === projectKey) records.push(shown(record));
    }
    return records.sort((a, b) => b.createdAt - a.createdAt);
  };

  const answeredAlready = (records: ActionRecordV1[], itemId: string, fingerprint: string) =>
    records.some((record) => record.state !== "cancelled" && record.answer?.itemId === itemId && record.answer.fingerprint === fingerprint);

  const steer = async (input: z.infer<typeof steerInput>): Promise<ActionRecordV1> => {
    // Claim the answer before the first await, so two clicks in the same tick cannot both pass.
    const claimKey = input.kind === "answer" && input.answer ? `${input.projectKey}|${input.answer.itemId}|${input.answer.fingerprint}` : null;
    const claimed = claimKey !== null && !answering.has(claimKey);
    if (claimKey !== null && !claimed) {
      return { operationId: input.operationId, kind: input.kind, projectKey: input.projectKey, label: "Answer", state: "cancelled", reason: "duplicate", detail: refusalWords.duplicate, createdAt: now(), settledAt: now(), answer: null };
    }
    if (claimed) answering.add(claimKey);
    try {
      return await steerClaimed(input, claimed);
    } finally {
      if (claimed) answering.delete(claimKey);
    }
  };

  const steerClaimed = async (input: z.infer<typeof steerInput>, claimed: boolean): Promise<ActionRecordV1> => {
    const base = {
      operationId: input.operationId, kind: input.kind, projectKey: input.projectKey,
      createdAt: now(), settledAt: null, answer: null,
    } satisfies Partial<ActionRecordV1>;
    const cancel = async (reason: ActionRefusalV1, label: string, answer: ActionRecordV1["answer"] = null, save = true) => {
      const record: ActionRecordV1 = { ...base, label, answer, state: "cancelled", reason, detail: refusalWords[reason], settledAt: now() };
      if (save) {
        try { await saveRecord(record); } catch { /* A refusal sent nothing; an unsaved one is harmless. */ }
        publish();
      }
      return record;
    };

    const factory = await factoryFor(input.projectKey);
    if (!factory) return cancel("wrong-project", "Not sent", null, false);
    const { binding } = factory;

    // Build the one request; its target is always the binding's, checked against what the panel showed.
    let text: string;
    let label: string;
    let item: NeedsYouItemV1 | null = null;
    let current: QueueReadV1 = { ok: false, reason: "not-configured" };
    if (input.kind === "tell" || input.kind === "feedback") {
      const words = input.text?.trim() ?? "";
      if (!words || input.answer || input.specAction) return cancel("invalid", "Not sent", null, false);
      text = input.kind === "tell" ? tellText(words, input.operationId) : feedbackText(words, input.operationId);
      label = input.kind === "tell" ? words : `Feedback: ${words}`;
    } else if (input.kind === "spec-action") {
      const action = input.specAction;
      if (!action || input.answer || input.text) return cancel("invalid", "Not sent", null, false);
      const match = /^([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+)#([1-9][0-9]*)$/.exec(action.spec);
      // Only a spec of this factory's own repositories; anything else is refused.
      if (!match || !binding.repositories.includes(match[1] as never)) return cancel("invalid", "Not sent", null, false);
      text = specActionText(action.action, action.spec as SpecRefV1, input.operationId);
      label = `${specActionLabel[action.action]} ${action.spec}`;
    } else {
      const answer = input.answer;
      if (!answer || input.text || input.specAction) return cancel("invalid", "Not sent", null, false);
      label = "Answer";
      text = "";
    }

    const request: SteerRequestV1 = {
      requestId: input.operationId, kind: input.kind, projectKey: input.projectKey,
      orchestratorThreadId: input.orchestratorThreadId, text, answer: input.answer,
    };
    const precheck = checkSteerDispatch(request, binding, { ok: false, reason: "not-configured" });
    if (!precheck.ok && precheck.reason !== "queue-unavailable") return cancel(precheck.reason, label);

    if (input.kind === "answer") {
      const answer = input.answer!;
      if (!claimed || answeredAlready(await listRecords(input.projectKey), answer.itemId, answer.fingerprint)) {
        return cancel("duplicate", label, null, false);
      }
      // Re-read the queue now, after the Undo window: any change cancels.
      current = await freshQueue(factory);
      const check = checkSteerDispatch(request, binding, current);
      item = current.ok ? current.queue.items.find((candidate) => candidate.id === answer.itemId) ?? null : null;
      const choice = item?.options.find((option) => option.id === answer.optionId)?.label;
      label = item ? `Answer ${item.code} · ${choice ?? answer.optionId}` : "Answer";
      const bound = item ? { itemId: item.id, fingerprint: answer.fingerprint, question: item.question } : null;
      if (!check.ok) return cancel(check.reason, label, bound);
      text = answerText(item!, answer.optionId, answer.queueRevision, input.operationId);
      return dispatch({ ...request, text }, factory, { ...base, label, answer: bound });
    }
    return dispatch(request, factory, { ...base, label, answer: null });
  };

  /** Verify the orchestrator, save the record, then make the one SDK call. */
  const dispatch = async (
    request: SteerRequestV1, factory: DeckFactoryV1, base: Omit<ActionRecordV1, "state" | "reason" | "detail">,
  ): Promise<ActionRecordV1> => {
    const verified = await verifyOrchestrator(factory);
    if (!verified.ok) {
      const record: ActionRecordV1 = { ...base, state: "cancelled", reason: "orchestrator-unverified", detail: `${refusalWords["orchestrator-unverified"]} ${verified.detail}`, settledAt: now() };
      try { await saveRecord(record); } catch { /* Nothing was sent. */ }
      publish();
      return record;
    }
    // Save before sending: a record that cannot be saved is never sent.
    const pending: ActionRecordV1 = { ...base, state: "dispatching", reason: null, detail: null };
    try {
      await saveRecord(pending);
    } catch {
      return { ...pending, state: "cancelled", reason: "not-saved", detail: refusalWords["not-saved"], settledAt: now() };
    }
    publish(); // Every panel shows this operation as sending before the host answers.

    // The binding was read before the awaits above. Read it again now: a changed, removed or
    // unreadable binding cancels; the pending action is never retargeted.
    let currentBinding: DeckFactoryV1 | null = null;
    try { currentBinding = await factoryFor(request.projectKey); } catch { currentBinding = null; }
    if (!currentBinding || JSON.stringify(currentBinding) !== JSON.stringify(factory)) {
      // Existing refusals only: a removed or unreadable binding is `wrong-project`, any other change `wrong-target`.
      const record: ActionRecordV1 = {
        ...pending, state: "cancelled", reason: currentBinding ? "wrong-target" : "wrong-project",
        detail: "The factory's settings changed before sending, so nothing was sent. Check the orchestrator and try again.", settledAt: now(),
      };
      try { await saveRecord(record); } catch { /* Nothing was sent; the saved `dispatching` record would read as uncertain, never resent. */ }
      publish();
      return record;
    }

    const sent = Promise.resolve().then(() => bb.sdk.threads.send(steerSendArgs(request)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), SEND_TIMEOUT_MS); });
    const settled = await Promise.race([
      sent.then((value) => ({ status: "fulfilled", value }) as const, (reason: unknown) => ({ status: "rejected", reason }) as const),
      timedOut,
    ]);
    clearTimeout(timer);

    const toRecord = (result: PromiseSettledResult<unknown>, late = false): ActionRecordV1 => {
      const outcome = steerOutcome(request.requestId, result);
      if (outcome.delivery === "sent") return { ...pending, state: "sent", detail: late ? "Steered; the host answered after WizDeck stopped waiting." : null, settledAt: now() };
      if (outcome.delivery === "queued") return { ...pending, state: "queued", detail: "Queued by the host: waiting, not steered yet.", settledAt: now() };
      return { ...pending, state: "uncertain", detail: "The host did not confirm delivery. It may have arrived; WizDeck does not resend it.", settledAt: now() };
    };

    let record: ActionRecordV1;
    if (settled === "timeout") {
      record = { ...pending, state: "uncertain", detail: "No answer from the host in time. It may have arrived; WizDeck does not resend it.", settledAt: now() };
      // A late confirmation is the send's own record and may settle it; a late failure leaves it uncertain.
      void sent.then(async (value) => {
        const late = toRecord({ status: "fulfilled", value }, true);
        if (late.state === "uncertain") return;
        try { await saveRecord(late); } catch { /* Stays uncertain. */ }
        publish();
      }, () => undefined);
    } else {
      record = toRecord(settled);
    }
    try { await saveRecord(record); } catch { /* The saved `dispatching` record already reads as uncertain. */ }
    publish();
    return record;
  };

  bb.rpc.register(deckActionsRpcContract, {
    async deckActionLog({ projectKey }): Promise<ActionLogV1> {
      const factory = await factoryFor(projectKey);
      if (!factory) {
        return { projectKey, orchestrator: { status: "unavailable", threadId: null, detail: refusalWords["not-configured"] }, records: [], reply: NO_REPLY_CORRELATION };
      }
      const verified = await verifyOrchestrator(factory);
      const threadId = factory.binding.orchestratorThreadId;
      return {
        projectKey,
        orchestrator: verified.ok ? { status: "verified", threadId, title: verified.title } : { status: "unavailable", threadId, detail: verified.detail },
        records: (await listRecords(projectKey)).slice(0, LOG_LIMIT),
        reply: NO_REPLY_CORRELATION,
      };
    },

    async deckBindAnswer({ projectKey, itemId, optionId, shown: display }): Promise<BindAnswerResultV1> {
      const refuse = (reason: ActionRefusalV1): BindAnswerResultV1 => ({ ok: false, reason, detail: refusalWords[reason] });
      const factory = await factoryFor(projectKey);
      if (!factory) return refuse("wrong-project");
      const current = await freshQueue(factory);
      if (!current.ok) return refuse("queue-unavailable");
      const item = current.queue.items.find((candidate) => candidate.id === itemId);
      if (!item) return refuse("item-gone");
      // What the person saw must be what the file says now.
      const same = item.code === display.code && item.question === display.question && item.risk === display.risk
        && item.options.length === display.options.length
        && item.options.every((option, index) => option.id === display.options[index].id && option.label === display.options[index].label);
      if (!same) return refuse("proposal-changed");
      if (item.risk !== "ordinary") return refuse("gated-risk");
      const option = item.options.find((candidate) => candidate.id === optionId);
      if (!option) return refuse("unknown-option");
      if (answeredAlready(await listRecords(projectKey), item.id, item.fingerprint)) return refuse("duplicate");
      return {
        ok: true,
        bound: {
          itemId: item.id, optionId, optionLabel: option.label, code: item.code, question: item.question,
          fingerprint: item.fingerprint, queueRevision: current.queue.revision,
        },
      };
    },

    async deckSteer(input) {
      // One operation id, one effect: a repeat joins the same call or reads its record.
      const running = inflight.get(input.operationId);
      if (running) return running;
      const done = (async () => {
        const existing = await readRecord(input.operationId);
        if (existing) return shown(existing);
        return steer(input);
      })();
      inflight.set(input.operationId, done);
      try {
        return await done;
      } finally {
        inflight.delete(input.operationId);
      }
    },
  });
}
