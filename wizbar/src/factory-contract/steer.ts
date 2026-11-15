// The steer route (factory-view.v1.md, section 4): exact SDK arguments, the
// delivery outcome, and the disabled dispatcher D2 replaces.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { SteerOutcomeV1, SteerRequestV1 } from "./types";

type ThreadSendArgs = Parameters<BbPluginApi["sdk"]["threads"]["send"]>[0];

/** Exactly what `bb.sdk.threads.send` receives. The plugin-local `requestId` is not sent. */
export interface SteerSendArgsV1 {
  threadId: string;
  input: [{ type: "text"; text: string; mentions: [] }];
  mode: "steer";
}

export function steerSendArgs(request: SteerRequestV1): SteerSendArgsV1 {
  const args: SteerSendArgsV1 = {
    threadId: request.orchestratorThreadId,
    input: [{ type: "text", text: request.text, mentions: [] }],
    mode: "steer",
  };
  // Type-level proof that these are supported SDK 0.6.33 send arguments.
  const checked: ThreadSendArgs = args;
  void checked;
  return args;
}

/**
 * Map one settled send to its delivery. `queued` waits, it is not steered. A
 * rejection or an unrecognised result is `uncertain`: it may have been
 * delivered, so it is never retried automatically.
 */
export function steerOutcome(requestId: string, settled: PromiseSettledResult<unknown>): SteerOutcomeV1 {
  if (settled.status === "rejected") {
    const reason = settled.reason;
    return { requestId, delivery: "uncertain", message: reason instanceof Error ? reason.message : "Send result unknown." };
  }
  const value = settled.value as { ok?: unknown; delivery?: unknown; queuedMessage?: { id?: unknown } } | null;
  if (value && value.ok === true && (value.delivery === "sent" || value.delivery === "queued")) return { requestId, delivery: "sent" };
  if (value && value.ok === true && value.delivery === "queued" && typeof value.queuedMessage?.id === "string") {
    return { requestId, delivery: "queued", queuedMessageId: value.queuedMessage.id };
  }
  return { requestId, delivery: "uncertain", message: "Send result unknown." };
}

/** C1 stub: no send is possible until D2 replaces it. */
export async function dispatchSteerDisabled(_request: SteerRequestV1): Promise<{ status: "disabled" }> {
  return { status: "disabled" };
}
