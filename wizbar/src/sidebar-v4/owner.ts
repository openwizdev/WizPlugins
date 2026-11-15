// B1 (#76, J88): the owning thread of a Needs-you item. Queue v1 has no
// per-item thread, and the queue's only writer is the factory's orchestrator,
// so the owner is that orchestrator, taken only from D2's declared action log
// (#74: the configured orchestrator, freshly verified by the backend against
// the host: same thread, the factory's Cloudroom project, not archived or
// deleted). Pinned to its shape in PR #85 at c0d01a0f41d5d26357d39bac72979b8f8963791e.
// Nothing here guesses: no selected thread, title or route; any other answer,
// a missing backend method or a failed read is unavailable.
import { useCallback } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";

/** D2's `deckActionLog` call, read-only from the sidebar; only its target is used. */
type ActionLogRead = {
  deckActionLog: { input: z.ZodObject<{ projectKey: z.ZodString }>; output: z.ZodUnknown };
};

export type OwnerV1 = { status: "verified"; threadId: string } | { status: "unavailable" };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The verified owner in one action-log answer for `projectKey`, or unavailable. */
export function readOwner(answer: unknown, projectKey: string): OwnerV1 {
  if (!record(answer) || answer.projectKey !== projectKey || !record(answer.orchestrator)) return { status: "unavailable" };
  const { status, threadId } = answer.orchestrator;
  if (status !== "verified" || typeof threadId !== "string" || threadId.trim() === "" || threadId !== threadId.trim()) {
    return { status: "unavailable" };
  }
  return { status: "verified", threadId };
}

/** Ask the backend afresh, every time: a stored answer can be stale. */
export function useOwnerReader(): (projectKey: string) => Promise<OwnerV1> {
  const rpc = useRpc<ActionLogRead>();
  return useCallback(async (projectKey: string) => {
    try {
      return readOwner(await rpc.call("deckActionLog", { projectKey }), projectKey);
    } catch {
      return { status: "unavailable" };
    }
  }, [rpc]);
}
