import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { hideChildrenOfVisibleParents, searchThreadsByTitle, threadDisplayTitle, yoursThreads, type YoursThread } from "./inbox";
import { hasRuntimeWork, resolveShelf, type ThreadLifecycleRow } from "./lifecycle";
import { harnessName, modelEffortLabel, modelName } from "./model-names";
import { threadStatuses, type ThreadSort, type ThreadStatus } from "./settings";
import type { SidebarSection } from "./sections";
import type { SpecsFileV4 } from "./fixtures/v4";
import { matchSpec } from "./specs/rows";
import type { CardModelV3, CardModelsResultV3, EffortV3 } from "./v3-types";

export type ThreadSource = YoursThread & Pick<PluginSidebarThread, "title" | "titleFallback">;
export type ThreadRow = {
  id: string;
  title: string;
  section: SidebarSection | null;
  status: ThreadStatus;
  providerId: string;
  harness: string;
  model: string | null;
  effort: EffortV3 | null;
  modelLabel: string | null;
  createdAt: number;
  updatedAt: number;
  unread: boolean;
  parentThreadId: string | null;
};

export function threadStatus(thread: YoursThread): ThreadStatus {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "needs-you";
  if (thread.status === "error" || thread.runtimeStatus === "error" || thread.queuedWork === "failed" ||
      thread.indicator === "unread-error" || thread.indicator === "queued-failed") return "failed";
  if (hasRuntimeWork(thread.runtimeStatus, Object.values(thread.activity)) ||
      thread.indicator === "runtime" || thread.indicator === "working-draft") return "working";
  return thread.isUnread || thread.indicator === "unread-success" ? "unread" : "idle";
}

export function threadRow(thread: ThreadSource, section: ThreadRow["section"], served?: CardModelV3): ThreadRow {
  const model = served?.model?.trim() || null;
  const effort = model === null ? null : served?.effort ?? null;
  return {
    id: thread.id, title: threadDisplayTitle(thread), section, status: threadStatus(thread),
    providerId: thread.providerId, harness: harnessName(thread.providerId),
    model, effort, modelLabel: modelEffortLabel(model, effort),
    createdAt: thread.createdAt, updatedAt: thread.updatedAt,
    unread: thread.isUnread, parentThreadId: thread.parentThreadId,
  };
}

const filterKeys = ["harness", "model", "effort", "status"] as const;
type FilterKey = (typeof filterKeys)[number];
export type ThreadSelectors = Partial<Record<FilterKey, string>>;

export function parseThreadSearch(query: string): { text: string; filters: ThreadSelectors[] } {
  const filters: ThreadSelectors[] = [];
  const text: string[] = [];
  for (const word of query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []) {
    const separator = word.indexOf(":");
    const key = word.slice(0, separator).toLowerCase() as FilterKey;
    const value = word.slice(separator + 1).replace(/^"(.*)"$/, "$1").trim();
    if (separator > 0 && filterKeys.includes(key) && value) filters.push({ [key]: value });
    else text.push(word);
  }
  return { text: filters.length === 0 ? query.trim() : text.join(" "), filters };
}

const equal = (field: string | null, value: string) => field?.toLowerCase() === value;

export function matchesThreadFilters(row: ThreadRow, filters: ThreadSelectors): boolean {
  return filterKeys.every((key) => {
    const value = filters[key]?.trim().toLowerCase();
    if (!value) return true;
    if (key === "harness") return equal(row.providerId, value) || equal(row.harness, value);
    if (key === "model") return row.model !== null &&
      [row.model, row.modelLabel].some((label) => label?.toLowerCase().includes(value));
    return equal(row[key], value);
  });
}

export function searchThreadRows<T extends ThreadSource>(
  threads: readonly T[], search: ReturnType<typeof parseThreadSearch>, rowFor: (thread: T) => ThreadRow,
): T[] {
  const matched = searchThreadsByTitle(threads, search.text);
  if (search.filters.length === 0) return matched;
  return matched.filter((thread) => {
    const row = rowFor(thread);
    return search.filters.every((filter) => matchesThreadFilters(row, filter));
  });
}

const compareGroup = (left: string | null, right: string | null) =>
  left === right ? 0 : left === null ? 1 : right === null ? -1 : left.localeCompare(right, undefined, { sensitivity: "base" });

const comparisons: Record<ThreadSort, (left: ThreadRow, right: ThreadRow) => number> = {
  newest: () => 0,
  activity: (left, right) => right.updatedAt - left.updatedAt,
  status: (left, right) => threadStatuses.indexOf(left.status) - threadStatuses.indexOf(right.status),
  harness: (left, right) => compareGroup(left.harness, right.harness) || compareGroup(left.providerId, right.providerId),
  model: (left, right) => compareGroup(modelName(left.model), modelName(right.model)),
  effort: (left, right) => compareGroup(left.effort, right.effort),
};

export function sortThreadRows<T>(rows: readonly T[], sort: ThreadSort, rowFor: (item: T) => ThreadRow): T[] {
  return rows.map((item) => ({ item, row: rowFor(item) }))
    .sort(({ row: left }, { row: right }) => comparisons[sort](left, right) ||
      right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    .map(({ item }) => item);
}

export function modelItems(result: CardModelsResultV3 | null): Map<string, CardModelV3> {
  return new Map(result?.source === "host" ? result.items.map((item) => [item.threadId, item]) : []);
}

export type ListThreadSource = ThreadSource & Pick<PluginSidebarThread, "isPinned" | "latestAttentionAt">;

export function threadListCandidates(
  threads: readonly ListThreadSource[], lifecycle: readonly ThreadLifecycleRow[], now: number,
  file: SpecsFileV4 | null, repositories: readonly string[], all: boolean, searching: boolean,
): { threads: ListThreadSource[]; sectionFor: (thread: ListThreadSource) => ThreadRow["section"] } {
  const lifecycleById = new Map(lifecycle.map((row) => [row.threadId, row]));
  const active = threads.filter((thread) => thread.isPinned || resolveShelf(lifecycleById.get(thread.id), {
    hasPendingInteraction: thread.hasPendingInteraction,
    isWorking: hasRuntimeWork(thread.runtimeStatus, Object.values(thread.activity)),
    isUnread: thread.isUnread, latestAttentionAt: thread.latestAttentionAt,
    isPinned: thread.isPinned, hasFailed: threadStatus(thread) === "failed",
  }, now) === "active");

  if (!all && searching) {
    return { threads: active.filter((thread) => !thread.isPinned), sectionFor: () => "yours" };
  }

  const listedIds = new Set(hideChildrenOfVisibleParents(threads).map(({ id }) => id));
  const yours = yoursThreads(active.filter((thread) => !thread.isPinned && listedIds.has(thread.id)),
    file, threads, repositories, active.filter(({ id }) => !listedIds.has(id)));
  if (!all) return { threads: yours, sectionFor: () => "yours" };

  const yoursIds = new Set(yours.map(({ id }) => id));
  return {
    threads: active,
    sectionFor: (thread) => {
      if (thread.isPinned) return "pinned";
      if (yoursIds.has(thread.id)) return "yours";
      return file && matchSpec(file, thread, threads) ? "specs" : null;
    },
  };
}
