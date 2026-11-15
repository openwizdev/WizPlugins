// WizDeck's steer actions (D2, #74): values shared by the backend and the
// panel. No backend imports: the panel bundle imports this file.
import type { DispatchRefusalV1, SteerKindV1 } from "../../factory-contract";

/** The realtime channel panels re-read the action log on. Its payload carries nothing. */
export const ACTIONS_CHANNEL = "wizdeck-actions";

/** An ordinary answer waits this long, with Undo, before any send is attempted. */
export const UNDO_MS = 5_000;

/** A send the host has not answered within this time is uncertain, never failed. */
export const SEND_TIMEOUT_MS = 30_000;

/** Longest Tell the factory or feedback text. */
export const MAX_TEXT = 2_000;

export const SPEC_ACTIONS = ["pause", "resume", "prioritise", "ask-why"] as const;
export type SpecActionV1 = typeof SPEC_ACTIONS[number];

/** Why D2 cancelled before any SDK call: C1's refusals plus D2's own checks. */
export type ActionRefusalV1 =
  | DispatchRefusalV1
  | "not-configured" | "orchestrator-unverified" | "duplicate" | "invalid" | "not-saved" | "binding-changed";

/**
 * One operation's record. `dispatching` is saved before the SDK call; a
 * record still `dispatching` after a restart reads as `uncertain`.
 */
export type ActionStateV1 = "dispatching" | "sent" | "queued" | "uncertain" | "cancelled";

export interface ActionRecordV1 {
  /** Plugin-local operation id. Never sent to the host as a field; it keys this record only. */
  operationId: string;
  kind: SteerKindV1;
  projectKey: string;
  /** Short words for the log: "Answer N-12 · Short headline", the spec action, or the message. */
  label: string;
  state: ActionStateV1;
  reason: ActionRefusalV1 | null;
  detail: string | null;
  createdAt: number;
  settledAt: number | null;
  /**
   * For answers: the proposal answered, so every tab can tell it from a revised one. `shown`
   * is the code, question, risk and options as the backend read them at dispatch.
   */
  answer: { itemId: string; fingerprint: string; shown: ShownItemV1 } | null;
}

/**
 * Reply correlation. The send result carries no turn id and the plugin-local
 * operation id is not a host key, so no timeline message can be matched to a
 * steer: Tell the factory always links to the orchestrator instead.
 */
export type ReplyV1 = { status: "link-only"; reason: string };
export const NO_REPLY_CORRELATION: ReplyV1 = {
  status: "link-only",
  reason: "The host gives no turn for a sent message, so WizDeck cannot tell which reply is this one's. Read it in the orchestrator.",
};

/** What a person sees of one decision: any difference is a different proposal on screen. */
export interface ShownItemV1 {
  code: string;
  question: string;
  risk: string;
  options: { id: string; label: string }[];
}

export function sameShown(a: ShownItemV1, b: ShownItemV1): boolean {
  return a.code === b.code && a.question === b.question && a.risk === b.risk && a.options.length === b.options.length
    && a.options.every((option, index) => option.id === b.options[index].id && option.label === b.options[index].label);
}

export interface ActionLogV1 {
  projectKey: string;
  orchestrator:
    | { status: "verified"; threadId: string; title: string | null }
    | { status: "unavailable"; threadId: string | null; detail: string };
  /** Newest first. */
  records: ActionRecordV1[];
  reply: ReplyV1;
}

export interface BoundAnswerV1 {
  itemId: string;
  optionId: string;
  optionLabel: string;
  code: string;
  question: string;
  fingerprint: string;
  queueRevision: number;
}

export type BindAnswerResultV1 =
  | { ok: true; bound: BoundAnswerV1 }
  | { ok: false; reason: ActionRefusalV1; detail: string };

/** Plain words for every refusal. */
export const refusalWords: Record<ActionRefusalV1, string> = {
  "queue-unavailable": "The Needs-you file could not be read again, so nothing was sent.",
  "wrong-project": "That factory is not configured here.",
  "wrong-target": "The configured orchestrator changed, so nothing was sent.",
  "revision-changed": "The Needs-you file changed, so nothing was sent. Check the question again.",
  "item-gone": "That question is no longer open.",
  "proposal-changed": "The question or its proposal changed, so nothing was sent.",
  "unknown-option": "That option is no longer offered.",
  "gated-risk": "This decision is gated: decide it in the orchestrator.",
  "not-configured": "No factory is configured yet.",
  "orchestrator-unverified": "The configured orchestrator could not be verified, so nothing was sent.",
  duplicate: "This was already sent; WizDeck does not send it twice.",
  invalid: "That request is not valid.",
  "not-saved": "WizDeck could not record the operation first, so nothing was sent.",
  "binding-changed": "The factory's settings changed before sending, so nothing was sent. Check the orchestrator and try again.",
};
