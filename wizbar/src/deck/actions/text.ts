// The one text input each steer carries (D2, #74). Every kind tells the
// orchestrator plainly that WizDeck changed nothing and that the message is
// not itself an approval: the orchestrator checks and records under its rules.
import type { NeedsYouItemV1, SpecRefV1 } from "../../factory-contract";
import type { SpecActionV1 } from "./protocol";

export function answerText(item: NeedsYouItemV1, optionId: string, queueRevision: number, operationId: string): string {
  const option = item.options.find((candidate) => candidate.id === optionId);
  const request = item.requestId ? `\nRequest ${item.requestId} · request fingerprint ${item.requestFingerprint}` : "";
  return [
    `WizDeck answer · ${item.code}`,
    `Question: ${item.question}`,
    `Choice: ${option?.label ?? optionId} (option ${optionId})`,
    `Item ${item.id} · fingerprint ${item.fingerprint} · queue revision ${queueRevision} · WizDeck operation ${operationId}${request}`,
    "Check the current proposal and record this decision under the existing approval rules. This message is not itself an approval.",
  ].join("\n");
}

export function tellText(text: string, operationId: string): string {
  return `WizDeck · Tell the factory (operation ${operationId}):\n${text}`;
}

const specAsk: Record<SpecActionV1, (spec: string) => string> = {
  pause: (spec) => `Pause ${spec}: stop starting new work on it until I resume it.`,
  resume: (spec) => `Resume ${spec}.`,
  prioritise: (spec) => `Prioritise ${spec}: take it next.`,
  "ask-why": (spec) => `Why is ${spec} where it is? Explain its Now, Next and When, and what blocks it.`,
};

export const specActionLabel: Record<SpecActionV1, string> = {
  pause: "Pause", resume: "Resume", prioritise: "Prioritise", "ask-why": "Ask why",
};

export function specActionText(action: SpecActionV1, spec: SpecRefV1, operationId: string): string {
  return [
    `WizDeck spec action · ${specActionLabel[action]} ${spec} (operation ${operationId})`,
    specAsk[action](spec),
    "Act through the existing fleet rules. WizDeck changed nothing on GitHub; any label or fleet change is yours to make under those rules.",
  ].join("\n");
}

export function feedbackText(text: string, operationId: string): string {
  return [
    `WizDeck feedback (operation ${operationId}):`,
    text,
    "Please file a public-safe WizDeck issue for a later hill-climb: your own plain words, with no private details, thread ids or exact quotes.",
  ].join("\n");
}
