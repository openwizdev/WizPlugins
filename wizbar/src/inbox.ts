import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import type { SpecsFileV4 } from "./fixtures/v4";
import { matchSpec } from "./specs/rows";

/**
 * The sort that defines this sidebar: newest thread on top, and NOTHING moves
 * it afterwards. Activity never re-orders the list, so a row holds its place
 * from creation until you park it and the screen only changes when you act.
 * Status is carried by the card, not by position.
 *
 * Ties break on id so the order is total and stable across renders.
 */
export function sortByCreatedAtDescending<
  T extends { readonly id: string; readonly createdAt: number },
>(threads: readonly T[]): T[] {
  return [...threads].sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );
}

export function threadDisplayTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

/** Substring match on the visible title only, preserving the incoming order. */
export function searchThreadsByTitle(
  threads: readonly PluginSidebarThread[],
  query: string,
): PluginSidebarThread[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...threads];
  return threads.filter((thread) =>
    threadDisplayTitle(thread).toLowerCase().includes(normalized),
  );
}

export interface ProjectScope {
  /** Project id, or null for "all projects". */
  id: string | null;
  name: string;
}

/** Threads in the chosen scope; every thread when the scope is null. */
export function filterByProject(
  threads: readonly PluginSidebarThread[],
  projectId: string | null,
): PluginSidebarThread[] {
  if (projectId === null) return [...threads];
  return threads.filter((thread) => thread.projectId === projectId);
}

/** Archived threads never belong in the inbox. */
export function visibleInboxThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return threads.filter((thread) => !thread.isArchived);
}

/** Pinned first (they are the user's own ordering), then the static sort. */
export function partitionPinned(threads: readonly PluginSidebarThread[]): {
  pinned: PluginSidebarThread[];
  inbox: PluginSidebarThread[];
} {
  const pinned: PluginSidebarThread[] = [];
  const inbox: PluginSidebarThread[] = [];
  for (const thread of threads) {
    (thread.isPinned ? pinned : inbox).push(thread);
  }
  return { pinned, inbox };
}

/**
 * Child threads leave the flat list and live in their parent's header chip
 * instead — a flat inbox has nowhere to nest them.
 *
 * A child is only hidden when its parent is actually on screen. An orphan
 * (parent archived, deleted, or filtered out by the project scope) stays in
 * the list, because hiding it would make it unreachable everywhere.
 */
export function hideChildrenOfVisibleParents(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  const visibleIds = new Set(threads.map((thread) => thread.id));
  return threads.filter(
    (thread) =>
      thread.parentThreadId === null || !visibleIds.has(thread.parentThreadId),
  );
}

/**
 * The parent of one thread, or null when the thread is a root, when the id is
 * unknown, or when the parent row is gone (deleted). The parent may be
 * archived or in another project: the flat list hides those, but the child
 * still needs a way back to them.
 */
export function parentOf(
  threads: readonly PluginSidebarThread[],
  threadId: string,
): PluginSidebarThread | null {
  const thread = threads.find((candidate) => candidate.id === threadId);
  const parentThreadId = thread?.parentThreadId;
  if (!parentThreadId) return null;
  return threads.find((candidate) => candidate.id === parentThreadId) ?? null;
}

/** The children of one thread, oldest first (the order they were spawned). */
export function childrenOf(
  threads: readonly PluginSidebarThread[],
  parentThreadId: string,
): PluginSidebarThread[] {
  return threads
    .filter((thread) => thread.parentThreadId === parentThreadId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

/** The fields the host's pinned order reads (sidebar-v3.v1.md section 5). */
export interface PinnedSortable {
  readonly id: string;
  readonly createdAt: number;
  readonly pinnedAt: number | null;
  readonly pinSortKey: string | null;
}

/**
 * The host's pinned order: pins with a key first, ascending by plain string
 * comparison; then pins without one, newest pin first, then newest thread,
 * then id. The sidebar and the CLI both sort with this one rule.
 */
export function sortPinned<T extends PinnedSortable>(threads: readonly T[]): T[] {
  return [...threads].sort((left, right) => {
    const l = left.pinSortKey, r = right.pinSortKey;
    if ((l === null) !== (r === null)) return l === null ? 1 : -1;
    if (l !== null && r !== null && l !== r) return l < r ? -1 : 1;
    return (right.pinnedAt ?? 0) - (left.pinnedAt ?? 0) ||
      right.createdAt - left.createdAt ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
}

/**
 * The host's attention markers: the indicator kinds that mean something new for
 * the owner (unread finished or failed work, a question, a send that failed).
 */
const attentionIndicators: ReadonlySet<string> = new Set(["unread-error", "unread-success", "waiting-for-input", "queued-failed"]);

/** Something new for the owner: `isUnread`, a pending question, or a host attention marker. */
export function hasSomethingNew(thread: PluginSidebarThread): boolean {
  return thread.isUnread || thread.hasPendingInteraction || attentionIndicators.has(thread.indicator);
}

/** A fleet wake's title form, the real `Fleet #S: …` title (specs-section section 3). */
const fleetWakeTitle = /^Fleet #[1-9][0-9]*: /;

/**
 * A fleet loop run's title: exactly one of the fleet skill's loop names for one of
 * `repositories` (`launch-fleet <owner>/<repo>`, `launch-fleet wakes <owner>/<repo>`,
 * `launch-fleet #<N> <owner>/<repo>`). The host marks no loop run (SDK 0.6.33's
 * `originKind` and `originPluginId` are null on every thread), so the title is the
 * only record; any other loop's run is not recognised.
 */
export function isFleetLoopTitle(title: string, repositories: readonly string[]): boolean {
  const match = /^launch-fleet (?:wakes |#[1-9][0-9]* )?(.+)$/.exec(title);
  return match !== null && repositories.includes(match[1]!);
}

/**
 * E2 (#188), Unread (sidebar-v3.v1.md section 10): of `threads`, in their order,
 * those that match no spec (specs-section section 3, against `rows`, every
 * sidebar row), are not fleet wakes and are not fleet loop runs for
 * `repositories`, and have something new for the owner themselves or in a child
 * hidden under them (`hiddenChildren`, shown in the parent's chip) that would
 * itself qualify. With no specs file nothing matches a spec.
 */
export function unreadThreads<T extends PluginSidebarThread>(
  threads: readonly T[], file: SpecsFileV4 | null, rows: readonly PluginSidebarThread[],
  repositories: readonly string[] = [],
  hiddenChildren: readonly PluginSidebarThread[] = [],
): T[] {
  const eligible = (thread: PluginSidebarThread) => !fleetWakeTitle.test(thread.displayTitle)
    && !isFleetLoopTitle(thread.displayTitle, repositories)
    && (file === null || matchSpec(file, thread, rows) === null);
  const qualifies = (thread: PluginSidebarThread) => hasSomethingNew(thread) && eligible(thread);
  const newsUnder = new Set(hiddenChildren.filter(qualifies).map((child) => child.parentThreadId));
  return threads.filter((thread) => eligible(thread) && (hasSomethingNew(thread) || newsUnder.has(thread.id)));
}
