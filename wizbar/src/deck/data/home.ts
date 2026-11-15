// The Home view model the panel renders (D1, #73). Built on the backend from
// cached snapshots only: building it never reads GitHub or the host.
import {
  needsYouViewStub, type NeedsYouViewV1, type ReadSnapshotV1, type UnavailableReasonV1,
} from "../../factory-contract";
import { mergesToday, type BoardV1, type SpecRowV1 } from "./board";
import type { CacheView } from "./cache";
import type { QueueReadResultV1 } from "./queue";

export type Freshness = "loading" | "fresh" | "stale" | "unavailable";

export interface HomeVersionV1 {
  repository: string;
  number: number;
  title: string;
  dueOn: string | null;
  specs: SpecRowV1[];
}

export interface HomeViewV1 {
  projectKey: string;
  needsYou: {
    freshness: Freshness;
    view: NeedsYouViewV1 | null;
    /** Each listed item's source link, for Open (the C1 view item carries none). */
    sources: Record<string, string>;
    detail: string | null;
    fetchedAt: number | null;
  };
  board: {
    freshness: Freshness;
    versions: HomeVersionV1[];
    gaps: string[];
    detail: string | null;
    fetchedAt: number | null;
  };
  health: {
    /** Null: unavailable, never zero. */
    running: null;
    runningDetail: string;
    mergesToday: number | null;
    mergesTodayDetail: string | null;
    stalls: null;
    stallsDetail: string;
  };
  github: { authenticated: boolean };
  nextRefreshAt: number | null;
}

/** A ready snapshot older than two shared refreshes was not replaced on time. */
const STALE_AFTER_MS = 120_000;

function usable<T>(snapshot: ReadSnapshotV1<T> | null, now: number): { data: T; fetchedAt: number; stale: boolean } | null {
  if (!snapshot) return null;
  if (snapshot.status === "ready") return { data: snapshot.data, fetchedAt: snapshot.fetchedAt, stale: snapshot.stale || now - snapshot.fetchedAt > STALE_AFTER_MS };
  return snapshot.lastGood ? { ...snapshot.lastGood, stale: true } : null;
}

const reasonWords: Partial<Record<UnavailableReasonV1, string>> = {
  "rate-limited": "GitHub asked us to wait; showing the last good data.",
  unreadable: "GitHub could not be read.",
};

export function buildHomeView(input: {
  projectKey: string;
  queue: CacheView<QueueReadResultV1> | null;
  boards: CacheView<BoardV1>[];
  timeZone: string;
  now: number;
  authenticated: boolean;
  configDetail?: string | null;
}): HomeViewV1 {
  const { now } = input;

  // ---- Needs you: unavailable is never an empty list.
  let needsYou: HomeViewV1["needsYou"];
  const queue = input.queue?.snapshot ?? null;
  if (input.configDetail) {
    needsYou = { freshness: "unavailable", view: needsYouViewStub({ ok: false, reason: "not-configured" }), sources: {}, detail: input.configDetail, fetchedAt: null };
  } else if (!queue) {
    needsYou = { freshness: "loading", view: null, sources: {}, detail: null, fetchedAt: null };
  } else if (queue.status === "unavailable") {
    needsYou = { freshness: "unavailable", view: needsYouViewStub({ ok: false, reason: queue.reason }), sources: {}, detail: input.queue?.detail ?? null, fetchedAt: null };
  } else if (Date.parse(queue.data.queue.expiresAt) <= now) {
    // Expired since it was read: the producer has not replaced it.
    needsYou = {
      freshness: "unavailable", view: needsYouViewStub({ ok: false, reason: "expired" }), sources: {},
      detail: "The Needs-you file has expired: its producer has not refreshed it.", fetchedAt: queue.fetchedAt,
    };
  } else {
    const stale = now - queue.fetchedAt > STALE_AFTER_MS;
    needsYou = {
      freshness: stale ? "stale" : "fresh", view: needsYouViewStub({ ok: true, queue: queue.data.queue }),
      sources: Object.fromEntries(queue.data.queue.items.map((item) => [item.id, item.sourceUrl])),
      detail: null, fetchedAt: queue.fetchedAt,
    };
  }

  // ---- Board: known rows stay, with their gaps; missing data is a gap, never zero.
  const gaps: string[] = [];
  const versions: HomeVersionV1[] = [];
  const read: BoardV1[] = [];
  let anyLoading = false; let anyStale = false; let anyMissing = false;
  let fetchedAt: number | null = null;
  const details: string[] = [];
  for (const view of input.boards) {
    const data = usable(view.snapshot, now);
    if (view.snapshot === null) anyLoading = true;
    if (view.snapshot?.status === "unavailable") details.push(view.detail ?? reasonWords[view.snapshot.reason] ?? view.snapshot.reason);
    if (!data) {
      if (view.snapshot !== null) anyMissing = true;
      continue;
    }
    if (data.stale) anyStale = true;
    if (view.snapshot?.status === "ready") gaps.push(...view.snapshot.gaps);
    read.push(data.data);
    fetchedAt = fetchedAt === null ? data.fetchedAt : Math.min(fetchedAt, data.fetchedAt);
    for (const version of data.data.versions) versions.push({ ...version });
  }
  if (anyMissing) gaps.push("Some repositories could not be read; their specs are not shown.");
  const freshness: Freshness = input.configDetail ? "unavailable"
    : anyLoading && read.length === 0 ? "loading"
    : read.length === 0 ? "unavailable"
    : anyStale || anyMissing ? "stale" : "fresh";

  const complete = !input.configDetail && !anyLoading && !anyMissing && read.length === input.boards.length && input.boards.length > 0;
  const merges = complete ? mergesToday(read, input.timeZone, now) : null;
  const nextTimes = [input.queue, ...input.boards].map((view) => view?.nextRefreshAt).filter((at): at is number => typeof at === "number");

  return {
    projectKey: input.projectKey,
    needsYou,
    board: {
      freshness, versions, gaps,
      detail: input.configDetail ?? (details.length ? [...new Set(details)].join(" ") : null),
      fetchedAt,
    },
    health: {
      running: null,
      runningDetail: "Unavailable: the live running inventory is not connected in this version.",
      mergesToday: merges,
      mergesTodayDetail: merges === null ? "Unavailable until every configured repository's recent merges are read." : anyStale ? "From the last good read." : null,
      stalls: null,
      stallsDetail: "Unavailable: no verified activity time or factory stall threshold exists yet.",
    },
    github: { authenticated: input.authenticated },
    nextRefreshAt: nextTimes.length ? Math.min(...nextTimes) : null,
  };
}
