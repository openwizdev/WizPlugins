// Card metadata for the card's third line (WZ18 / #40). Pure rules from
// contracts/sidebar-v3.v1.md section 2. Stub: behaviour comes after red.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { CardLinkV3, CardMetaV3, CardModelV3, CardModelsResultV3, EffortV3 } from "./v3-types";

export function parseIssueNumber(_branch: string | null | undefined): number | null {
  return null;
}

export function cardLink(
  _pullRequest: { number: number; url: string } | null,
  _issueNumber: number | null,
): CardLinkV3 | null {
  return null;
}

export function cardLinkText(_link: CardLinkV3): string {
  return "";
}

export function childCountLabel(_count: number): string | null {
  return null;
}

export function modelLabel(_model: string | null, _effort: EffortV3 | null): string | null {
  return null;
}

export function cardMeta(
  thread: PluginSidebarThread,
  _threads: readonly PluginSidebarThread[],
  _pullRequest: { number: number; url: string } | null,
  _model: Pick<CardModelV3, "model" | "effort"> | null,
): CardMetaV3 {
  return { threadId: thread.id, model: null, effort: null, link: null, childCount: 0, branch: null };
}

export function cardModelsNone(threadIds: readonly string[]): CardModelsResultV3 {
  return { source: "host", items: threadIds.map((threadId) => ({ threadId, model: "", effort: null })) };
}
