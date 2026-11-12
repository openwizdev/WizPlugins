// Card metadata for the card's third line (WZ18 / #40). Pure rules from
// contracts/sidebar-v3.v1.md section 2: a part whose source is missing is
// omitted, never invented.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { childrenOf } from "./inbox";
import type { CardLinkV3, CardMetaV3, CardModelV3, CardModelsResultV3, EffortV3 } from "./v3-types";

/** `room/<N>-…` → N; anything else (including an unsafe integer) → null. */
export function parseIssueNumber(branch: string | null | undefined): number | null {
  const match = typeof branch === "string" ? /^room\/([1-9][0-9]*)-/.exec(branch) : null;
  if (!match) return null;
  const issue = Number(match[1]);
  return Number.isSafeInteger(issue) ? issue : null;
}

export function cardLink(
  pullRequest: { number: number; url: string } | null,
  issueNumber: number | null,
): CardLinkV3 | null {
  if (pullRequest) {
    return { kind: "pull-request", issueNumber, pullRequest: { number: pullRequest.number, url: pullRequest.url } };
  }
  return issueNumber === null ? null : { kind: "issue", issueNumber, pullRequest: null };
}

export function cardLinkText(link: CardLinkV3): string {
  if (link.kind === "issue") return `#${link.issueNumber}`;
  const pr = `PR #${link.pullRequest.number}`;
  return link.issueNumber === null ? pr : `#${link.issueNumber} → ${pr}`;
}

/** Hidden (null) at zero. */
export function childCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 child" : `${count} children`;
}

/** `<model> · <Effort>`, `<model>` alone, or null when the model is unknown. */
export function modelLabel(model: string | null, effort: EffortV3 | null): string | null {
  const name = model?.trim();
  if (!name) return null;
  return effort ? `${name} · ${effort[0]!.toUpperCase()}${effort.slice(1)}` : name;
}

export function cardMeta(
  thread: PluginSidebarThread,
  threads: readonly PluginSidebarThread[],
  pullRequest: { number: number; url: string } | null,
  served: Pick<CardModelV3, "model" | "effort"> | null,
): CardMetaV3 {
  const branch = thread.environment?.branchName || null;
  const model = served?.model?.trim() || null;
  return {
    threadId: thread.id,
    model,
    effort: model === null ? null : served?.effort ?? null,
    link: cardLink(pullRequest, parseIssueNumber(branch)),
    childCount: childrenOf(threads, thread.id).length,
    branch,
  };
}

/** The `cardModels` result while no host model/effort field is adopted. */
export function cardModelsNone(threadIds: readonly string[]): CardModelsResultV3 {
  return { source: "none", items: threadIds.map((threadId) => ({ threadId, model: null, effort: null })) };
}
