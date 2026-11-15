// The one backend-owned read cache (D1, #73; factory-view.v1.md section 5).
// Every panel, tab and device attached to this backend watches the same
// entry. Nothing in the UI polls GitHub or the host: it renews a lease, and
// this cache alone decides when a read happens.
import type { ReadSnapshotV1, UnavailableReasonV1 } from "../../factory-contract";
import { GitHubRateLimited } from "./github";

/** The shared refresh interval and the manual refresh's minimum spacing. */
export const REFRESH_MS = 60_000;
/** A watcher that stops renewing for this long no longer keeps the timer alive. */
export const LEASE_MS = 90_000;

export interface LoadResult<T> {
  data: T;
  complete: boolean;
  gaps: string[];
}

/** A loader's honest refusal: the read finished and gave nothing usable. */
export class ReadUnavailable extends Error {
  constructor(readonly reason: UnavailableReasonV1, readonly detail: string = reason) {
    super(detail);
    this.name = "ReadUnavailable";
  }
}

export type Loader<T> = (signal: AbortSignal) => Promise<LoadResult<T>>;

interface Entry<T> {
  loader: Loader<T>;
  keepLastGood: boolean;
  snapshot: ReadSnapshotV1<T> | null;
  detail: string | null;
  lastAttemptAt: number | null;
  retryAt: number;
  inflight: Promise<void> | null;
  leases: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface CacheView<T> {
  snapshot: ReadSnapshotV1<T> | null;
  /** Plain words for an unavailable read; never shown as zero. */
  detail: string | null;
  /** Epoch ms of the next read this cache allows. */
  nextRefreshAt: number | null;
  refreshing: boolean;
}

export class SharedReadCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly abort = new AbortController();

  constructor(
    private readonly onChange: (key: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Register or renew one watcher's lease on `key` and return what is cached.
   * Starts the shared schedule when it is the first live lease; the first
   * watcher of an empty entry starts its read, every other one joins it.
   */
  watch<T>(key: string, clientId: string, loader: Loader<T>, options: { keepLastGood?: boolean } = {}): CacheView<T> {
    const entry = this.entry(key, loader, options.keepLastGood ?? true);
    entry.leases.set(clientId, this.now() + LEASE_MS);
    // The first watcher, or one returning after the schedule stopped, reads once it is due.
    { entry.inflight = null; void this.load(key, entry); } // PLANTED P1
    this.arm(key, entry);
    return this.view(entry);
  }

  /** Drop one watcher's lease, as when its panel unmounts. */
  release(key: string, clientId: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.leases.delete(clientId);
    if (!this.live(entry)) this.disarm(entry);
  }

  /** The refresh button: reads only when the shared interval allows it. */
  refresh<T>(key: string): { started: boolean; view: CacheView<T> | null } {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    if (!entry) return { started: false, view: null };
    const due = this.dueAt(entry);
    const started = entry.inflight === null && this.now() >= due;
    if (started) void this.load(key, entry);
    return { started, view: this.view(entry) };
  }

  /** Read the cached view without leasing it. */
  peek<T>(key: string): CacheView<T> | null {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    return entry ? this.view(entry) : null;
  }

  /** True while some watcher's lease on `key` is current (tests and diagnostics). */
  isScheduled(key: string): boolean {
    return this.entries.get(key)?.timer != null;
  }

  dispose(): void {
    this.abort.abort();
    for (const entry of this.entries.values()) this.disarm(entry);
  }

  private entry<T>(key: string, loader: Loader<T>, keepLastGood: boolean): Entry<T> {
    let entry = this.entries.get(key) as Entry<T> | undefined;
    if (!entry) {
      entry = {
        loader, keepLastGood, snapshot: null, detail: null, lastAttemptAt: null, retryAt: 0,
        inflight: null, leases: new Map(), timer: null,
      };
      this.entries.set(key, entry as Entry<unknown>);
    }
    entry.loader = loader;
    return entry;
  }

  private dueAt(entry: Entry<unknown>): number {
    const interval = entry.lastAttemptAt === null ? 0 : entry.lastAttemptAt + REFRESH_MS;
    return Math.max(interval, entry.retryAt);
  }

  private view<T>(entry: Entry<T>): CacheView<T> {
    return {
      snapshot: entry.snapshot, detail: entry.detail,
      nextRefreshAt: entry.lastAttemptAt === null && entry.retryAt === 0 ? null : this.dueAt(entry),
      refreshing: entry.inflight !== null,
    };
  }

  private live(entry: Entry<unknown>): boolean {
    const now = this.now();
    for (const [client, expiresAt] of entry.leases) if (expiresAt <= now) entry.leases.delete(client);
    return entry.leases.size > 0;
  }

  private arm(key: string, entry: Entry<unknown>): void {
    if (entry.timer !== null || this.abort.signal.aborted) return;
    const delay = Math.max(0, this.dueAt(entry) - this.now()) || REFRESH_MS;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (!this.live(entry)) return; // Unused: the schedule stops and nothing is read.
      if (entry.inflight === null && this.now() >= this.dueAt(entry)) void this.load(key, entry);
      this.arm(key, entry);
    }, delay);
  }

  private disarm(entry: Entry<unknown>): void {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
  }

  private load<T>(key: string, entry: Entry<T>): Promise<void> {
    if (entry.inflight) return entry.inflight;
    entry.lastAttemptAt = this.now();
    entry.inflight = (async () => {
      try {
        const result = await entry.loader(this.abort.signal);
        entry.snapshot = {
          status: "ready", data: result.data, fetchedAt: this.now(), stale: false,
          complete: result.complete, gaps: [...result.gaps],
        };
        entry.detail = null;
      } catch (error) {
        // PLANTED P2: back-off ignored
        const reason: UnavailableReasonV1 = error instanceof GitHubRateLimited ? "rate-limited"
          : error instanceof ReadUnavailable ? error.reason : "unreadable";
        const previous = entry.snapshot;
        const lastGood = null as { data: T; fetchedAt: number } | null; void previous; // PLANTED P2
        entry.snapshot = { status: "unavailable", reason, lastGood };
        entry.detail = error instanceof Error && error.message ? error.message : reason;
      } finally {
        entry.inflight = null;
      }
      if (!this.abort.signal.aborted) this.onChange(key);
    })();
    return entry.inflight;
  }
}
