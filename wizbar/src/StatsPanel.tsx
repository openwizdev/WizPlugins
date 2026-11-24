// WB4-3 (openwizdev/OpenWiz#1437): the hover card on "N running"
// (specs-section.v1.md section 7). It shows exactly `wizbar stats --json`
// for the same rows: `computeStatsV4` over the sidebar rows, the specs file
// and the served model source. Colours are host theme variables only.
import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
  experimental_usePluginId,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRpc,
  useSettings,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { modelLabel } from "./card-meta";
import { harnessName } from "./model-names";
import { MatrixMark } from "./MatrixMark";
import { ProviderGlyph } from "./ProviderGlyph";
import { cardBatch, cardRowLabels, cardSummary, computeStatsV4, emptyCardBatch, isRunning, type CardThread } from "./stats";
import { readSpecsSort } from "./settings";
import { specRows } from "./specs/rows";
import { readSpecsFile } from "./specs/read";
import { useSpecsRead } from "./specs/SpecsSection";
import { tokens } from "./specs/theme";
import type { t3sidebarRpcContract } from "./server";
import type { FooterThreadV4, SpecKeyV4 } from "./fixtures/v4";
import type { CardModelsResultV3, CardModelV3 } from "./v3-types";

/** How often one thread's model and effort may be read again (owner steer on #175). */
export const MODEL_REFRESH_MS = 5 * 60_000;
/** On opening, labels read longer ago than this are read again, in one batch (#175 R3). */
export const MODEL_REOPEN_MS = 60_000;
/** A failed read is tried again after this, by the open card's timer (#175 R4). */
export const MODEL_RETRY_MS = 30_000;
/** The open card's timer sends at most one batch per this (#175 R4). */
export const MODEL_SWEEP_MS = 60_000;
const MODEL_TICK_MS = 10_000;

/**
 * Model and effort per thread for the session, one cache per plugin (like `gapStore`), so it outlives the
 * card closing. A thread's model almost never changes: a known label shows at once, and only a host
 * answer with another value changes it; a null, failed or malformed answer never does.
 */
interface ModelCache {
  labels: Map<string, CardModelV3>;
  /** When each thread was last asked, answered or not. */
  readAt: Map<string, number>;
  /** Threads whose last read failed: rejected, malformed, or a host answer with no model for them. */
  failed: Set<string>;
  inFlight: Set<string>;
  /** The running threads last seen, to tell a new turn (not running, then running). */
  running: Set<string> | null;
  /** The open card timer's last batch. */
  sweptAt: number;
  version: number;
  listeners: Set<() => void>;
}
const modelCaches = new Map<string, ModelCache>();
const modelCache = (pluginId: string): ModelCache => {
  let cache = modelCaches.get(pluginId);
  if (!cache) {
    modelCaches.set(pluginId, cache = {
      labels: new Map(), readAt: new Map(), failed: new Set(), inFlight: new Set(), running: null, sweptAt: -Infinity, version: 0, listeners: new Set(),
    });
  }
  return cache;
};
const label = (item: unknown, asked: ReadonlySet<string>): CardModelV3 | null => {
  if (!item || typeof item !== "object") return null;
  const { threadId, model, effort } = item as Record<string, unknown>;
  if (typeof threadId !== "string" || !asked.has(threadId) || typeof model !== "string" || !model.trim()) return null;
  if (!(effort === null || typeof effort === "string")) return null;
  return { threadId, model, effort: effort as CardModelV3["effort"] };
};

/** Reads `ids` (not already being read) in batches of 100 and settles them into the cache. */
function readModels(cache: ModelCache, rpc: ReturnType<typeof useRpc<typeof t3sidebarRpcContract>>, ids: readonly string[]) {
  const due = ids.filter((id) => !cache.inFlight.has(id));
  for (let i = 0; i < due.length; i += 100) {
    const batch = due.slice(i, i + 100);
    const asked = new Set(batch);
    for (const id of batch) cache.inFlight.add(id);
    // `items` null: the read failed. A host answer with no model for a thread failed for that thread;
    // `source: "none"` is an answer (no models offered) and fails nothing.
    const settle = (items: readonly unknown[] | null, host: boolean) => {
      const answered = new Set<string>();
      for (const item of items ?? []) {
        const next = label(item, asked);
        if (!next) continue;
        answered.add(next.threadId);
        const known = cache.labels.get(next.threadId);
        if (!(known && known.model === next.model && known.effort === next.effort)) cache.labels.set(next.threadId, next);
      }
      for (const id of batch) {
        cache.inFlight.delete(id);
        cache.readAt.set(id, Date.now());
        if (answered.has(id) || (items !== null && !host)) cache.failed.delete(id);
        else cache.failed.add(id);
      }
      cache.version++;
      for (const listener of cache.listeners) listener();
    };
    rpc.call("cardModels", { threadIds: batch }).then(
      (result) => result?.source === "host" && Array.isArray(result.items) ? settle(result.items, true)
        : result?.source === "none" ? settle([], false) : settle(null, true),
      () => settle(null, true),
    );
  }
}

/**
 * Model and effort for the running threads, from the cache. Reads `cardModels` only for a thread not yet
 * asked, one that starts a new turn, or one last asked `MODEL_REFRESH_MS` ago; never every thread because
 * the running set or a revision changed (`revision` only wakes the check). Opening the card reads again,
 * in one batch, labels older than `MODEL_REOPEN_MS`, so a turn missed while it was closed shows (#175 R3).
 * While it is open, a timer reads old labels and failed ones (after `MODEL_RETRY_MS`), at most one batch
 * per `MODEL_SWEEP_MS`, with no sidebar change needed (#175 R4).
 */
function useModels(threadIds: readonly string[], revision: string): CardModelsResultV3 | null {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const cache = modelCache(experimental_usePluginId());
  useSyncExternalStore((listener) => { cache.listeners.add(listener); return () => { cache.listeners.delete(listener); }; }, () => cache.version);
  const key = threadIds.join("\n");
  const latest = useRef(key);
  latest.current = key;
  const opened = useRef(false);
  useEffect(() => {
    const ids = key ? key.split("\n") : [];
    const now = Date.now();
    const age = (id: string) => now - (cache.readAt.get(id) ?? -Infinity);
    const reopen = !opened.current;
    opened.current = true;
    readModels(cache, rpc, ids.filter((id) => age(id) >= (reopen ? MODEL_REOPEN_MS : MODEL_REFRESH_MS) ||
      (cache.running !== null && !cache.running.has(id))));
    cache.running = new Set(ids);
  }, [cache, rpc, key, revision]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - cache.sweptAt < MODEL_SWEEP_MS) return;
      const due = (latest.current ? latest.current.split("\n") : []).filter((id) => {
        const age = now - (cache.readAt.get(id) ?? -Infinity);
        return !cache.inFlight.has(id) && (age >= MODEL_REFRESH_MS || (cache.failed.has(id) && age >= MODEL_RETRY_MS));
      });
      if (due.length === 0) return;
      cache.sweptAt = now;
      readModels(cache, rpc, due);
    }, MODEL_TICK_MS);
    return () => clearInterval(timer);
  }, [cache, rpc]);
  const items = threadIds.flatMap((id) => cache.labels.get(id) ?? []);
  return items.length > 0 ? { source: "host", items } : null;
}

/**
 * The open card's rows, batched (`cardBatch`, R1 #172): a thread that stops running stays, faded, until its
 * batch is removed, at most once every few seconds. The batch is this mounted card's own.
 */
function useCardThreads(threads: readonly FooterThreadV4[] | null): readonly CardThread[] | null {
  const batch = useRef(emptyCardBatch);
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const next = threads ? cardBatch(batch.current, threads, Date.now()) : null;
  if (next) batch.current = next.batch;
  const flushAt = next?.flushAt ?? null;
  useEffect(() => {
    if (flushAt === null) return;
    const timer = setTimeout(wake, Math.max(0, flushAt - Date.now()));
    return () => clearTimeout(timer);
  }, [flushAt]);
  return next ? next.batch.threads : null;
}

const quiet = { margin: 0, color: tokens.mutedText } as const;
const list = { margin: 0, padding: 0, listStyle: "none" } as const;
const oneLine = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

/**
 * A harness's segment colour: host variables only (section 9), never the warning, which is needs-you's (#159 R2).
 * Claude Code the host's text, the others muted text sunk into the card, so the two read apart on dark and light themes.
 */
const segmentColour = (providerId: string, index: number): string => providerId === "claude-code"
  ? `var(--foreground, ${tokens.mutedText})`
  : `color-mix(in oklab, ${tokens.mutedText} ${index % 2 === 0 ? 55 : 35}%, var(--card, #222222))`;

const ROW_HEIGHT = 24;
const collapsedGroups = new Map<string, ReadonlySet<SpecKeyV4 | null>>();
const cardBackground = "var(--card, #222222)";
const rowButton = {
  appearance: "none", margin: 0, border: 0, color: "inherit", font: "inherit", textAlign: "left",
  boxSizing: "border-box", width: "100%", height: ROW_HEIGHT, display: "flex", alignItems: "center",
  gap: 6, minWidth: 0, padding: "0 4px", borderRadius: 4, cursor: "pointer",
} as const;
const rowClass = "bg-transparent hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset";

interface ThreadGroup {
  key: SpecKeyV4 | null;
  name: string;
  threads: CardThread[];
}

function RunningThreadsList({ groups, labels, pluginId }: {
  groups: readonly ThreadGroup[];
  labels: ReadonlyMap<string, string>;
  pluginId: string;
}) {
  const actions = useSidebarThreadActions();
  const groupId = useId();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const folded = collapsedGroups.get(pluginId);
  const lineCount = groups.reduce((count, group) => count + 1 + (folded?.has(group.key) ? 0 : group.threads.length), 0);
  const viewport = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false, height: 0 });

  function readEdges() {
    const node = viewport.current;
    if (!node) return;
    const { scrollTop, clientHeight, scrollHeight } = node;
    const top = scrollTop > 1;
    const bottom = scrollHeight - clientHeight - scrollTop > 1;
    setEdges((previous) => previous.top === top && previous.bottom === bottom && previous.height === clientHeight
      ? previous : { top, bottom, height: clientHeight });
  }

  useLayoutEffect(() => {
    readEdges();
    if (typeof ResizeObserver === "undefined" || !viewport.current) return;
    const observer = new ResizeObserver(readEdges);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [lineCount]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, margin: "0 -4px", paddingTop: 8, borderTop: `1px solid ${tokens.border}` }}>
      {/* Both headers and rows fill one line. Round the scrollport down to a
          whole number of lines so the opposite edge is aligned at either end. */}
      <div style={{ position: "relative", containerType: "size", height: lineCount * ROW_HEIGHT, minHeight: 0 }}>
        <ul ref={viewport} aria-label="Threads" onScroll={readEdges} style={{
          ...list, position: "absolute", inset: 0, minHeight: 0, maxHeight: `round(down, 100cqh, ${ROW_HEIGHT}px)`, overflowY: "auto", overscrollBehaviorY: "contain",
        }}>
          {groups.flatMap(({ key, name, threads }) => {
            const expanded = !folded?.has(key);
            const count = threads.filter((thread) => !thread.leaving).length;
            const heading = `${groupId}-${key ?? "other"}`;
            return [
              <li key={heading}>
                <button id={heading} type="button" aria-expanded={expanded} className={rowClass}
                  style={{ ...rowButton, color: tokens.mutedText }}
                  onClick={() => {
                    const next = new Set(collapsedGroups.get(pluginId));
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    collapsedGroups.set(pluginId, next);
                    refresh();
                  }}>
                  <span data-spec-name={key === null ? undefined : ""} style={oneLine}>{name}</span>{" "}<span>{count}</span>
                </button>
              </li>,
              // Share a parent so a row keeps its DOM identity when its spec arrives or changes.
              ...(expanded ? threads.map((thread) => {
                const model = modelLabel(thread.model, thread.effort);
                return (
                  <li key={`thread-${thread.id}`} data-thread={thread.id} data-thread-spec={thread.shortName ?? undefined}
                    data-leaving={thread.leaving ? "true" : undefined}
                    style={{ opacity: thread.leaving ? 0.45 : 1, transition: "opacity 300ms" }}>
                    <button type="button" className={rowClass} style={rowButton} aria-describedby={heading}
                      onClick={(event) => actions.open(thread.id, { split: event.metaKey || event.ctrlKey })}>
                      <MatrixMark state={thread.matrix} />
                      <span data-title="" style={{ ...oneLine, minWidth: 0, flexShrink: 1 }}>{labels.get(thread.id)}</span>
                      {model ? <span data-model="" style={{ marginLeft: "auto", paddingLeft: 8, flexShrink: 0, whiteSpace: "nowrap", color: tokens.mutedText }}>{model}</span> : null}
                    </button>
                  </li>
                );
              }) : []),
            ];
          })}
        </ul>
        {(["top", "bottom"] as const).map((edge) => edges[edge] && (
          <div key={edge} data-scroll-fade={edge} aria-hidden="true" style={{
            position: "absolute", pointerEvents: "none", left: 0, right: 0, height: 8,
            top: edge === "top" ? 0 : edges.height - 8,
            background: `linear-gradient(to ${edge}, transparent, ${cardBackground})`,
          }} />
        ))}
      </div>
    </div>
  );
}

/**
 * The running card (section 7) shows the summary, harness split and a
 * scrollable list of running threads grouped by spec.
 */
export function StatsPanel({ rows, stale = false }: { rows: readonly PluginSidebarThread[] | null; stale?: boolean }) {
  const pluginId = experimental_usePluginId();
  const sort = readSpecsSort(useSettings().values?.specsSort);
  const read = useSpecsRead();
  const active = rows?.filter((row) => !row.isArchived) ?? [];
  const running = active.filter(isRunning);
  const models = useModels(running.map((row) => row.id), running.map((row) => row.updatedAt).join());
  const now = Date.now();
  const specs = read ? readSpecsFile(read, now) : null;
  const file = specs?.status === "ready" ? specs.file : null;
  const stats = computeStatsV4(rows, file, models, now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const sortedSpecs = file ? specRows(file, active, [], now, null, sort).specs : [];
  const resolved = cardRowLabels(active, sortedSpecs);
  const threads = useCardThreads(stats.threads);
  const previousLabels = useRef(new Map<string, string>());
  const labels = new Map(threads?.map((thread) => [
    thread.id,
    (thread.leaving ? previousLabels.current.get(thread.id) : resolved.get(thread.id)) ?? `${harnessName(thread.providerId)} thread`,
  ]));
  if (threads !== null) previousLabels.current = labels;
  const bySpec = new Map<SpecKeyV4 | null, ThreadGroup>();
  for (const { spec, shortName } of sortedSpecs) bySpec.set(spec, { key: spec, name: shortName, threads: [] });
  const other: ThreadGroup = { key: null, name: "Other", threads: [] };
  for (const thread of threads ?? []) {
    if (thread.spec === null) other.threads.push(thread);
    else {
      let group = bySpec.get(thread.spec);
      if (!group) {
        group = { key: thread.spec, name: thread.shortName ?? thread.spec, threads: [] };
        bySpec.set(thread.spec, group);
      }
      group.threads.push(thread);
    }
  }
  const groups = [...bySpec.values(), other].filter((group) => group.threads.length > 0);
  return (
    <section aria-label="Running threads" data-stale={stale ? "true" : undefined} style={{
      display: "flex", flexDirection: "column", gap: 10, minHeight: 0, boxSizing: "border-box",
      width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: "20px",
      fontVariantNumeric: "tabular-nums", background: cardBackground, color: "var(--foreground)", border: `1px solid ${tokens.border}`,
    }}>
      {stats.status !== "ready" ? <p style={quiet}>Stats unavailable</p> : (
        <>
          <div style={{ flexShrink: 0 }}>
            <p style={quiet}>{cardSummary(stats)}{stale ? " · last known" : ""}</p>
            <p style={quiet}>{stats.states.awake} awake · {stats.states.starting} starting · {stats.states.asleep} asleep</p>
          </div>
          {stats.harness.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div data-harness-bar="" aria-hidden="true" style={{ display: "flex", gap: 3, height: 4 }}>
                {stats.harness.map(({ providerId, count }, i) => (
                  <span key={providerId} data-harness-segment={providerId}
                    style={{ flexGrow: count, flexBasis: 0, borderRadius: 2, background: segmentColour(providerId, i) }} />
                ))}
              </div>
              <ul aria-label="Harness" tabIndex={0} className="rounded focus-visible:ring-1 focus-visible:ring-inset"
                style={{ ...list, display: "flex", flexDirection: "row", flexWrap: "nowrap", columnGap: 16, minWidth: 0, overflowX: "auto" }}>
                {stats.harness.map(({ providerId, count }) => (
                  <li key={providerId} data-harness={providerId} data-count={count} style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    <ProviderGlyph providerId={providerId} className="justify-start" />
                    <span>{harnessName(providerId)} {count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {groups.length > 0 ? <RunningThreadsList groups={groups} labels={labels} pluginId={pluginId} /> : null}
        </>
      )}
    </section>
  );
}
