// WB4-3 (openwizdev/OpenWiz#1437): the hover card on "N running"
// (specs-section.v1.md section 7). It shows exactly `wizbar stats --json`
// for the same rows: `computeStatsV4` over the sidebar rows, the specs file
// and the served model source. Colours are host theme variables only.
import { useEffect, useReducer, useRef, useState } from "react";
import {
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
import { boundHome, readSpecsFile } from "./specs/read";
import { tokens } from "./specs/theme";
import type { specsRpcContract } from "./specs/server";
import type { t3sidebarRpcContract } from "./server";
import type { FooterThreadV4, SpecsFileReadV4 } from "./fixtures/v4";
import type { CardModelsResultV3 } from "./v3-types";

const REFRESH_MS = 60_000;

/**
 * The specs file read while the card is open, on open and once a minute (the
 * server's shared refresh, specs-section.v1.md section 1), keyed to the bound
 * factory's host and root: a new binding hides the old read at once and drops
 * its late answers. A failed call is unreadable.
 */
function useSpecsRead(): SpecsFileReadV4 | null {
  const rpc = useRpc<typeof specsRpcContract>();
  const home = boundHome(useSettings().values?.wizdeckFactories);
  const key = home ? JSON.stringify([home.hostId, home.rootPath]) : null;
  const [read, setRead] = useState<{ key: string; read: SpecsFileReadV4 } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const load = () => rpc.call("specsFile", {}).then(
      (result) => { if (live) setRead({ key, read: result }); },
      () => { if (live) setRead({ key, read: { kind: "unreadable" } }); },
    );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [key, rpc]);
  return read && read.key === key ? read.read : null;
}

/**
 * Model and effort for the running threads, from the `cardModels` RPC; null until the first read answers.
 * `revision` (the rows' `updatedAt`) reads again on a newer turn, and a changed running set reads its
 * threads again; the last answer stays meanwhile, so no label blanks (R1 #172), and a late answer for an
 * older read is ignored (#111 R1). Answers are per thread: each thread keeps its last one.
 */
function useModels(threadIds: readonly string[], revision: string): CardModelsResultV3 | null {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [served, setServed] = useState<CardModelsResultV3 | null>(null);
  const key = threadIds.join("\n");
  useEffect(() => {
    let live = true;
    if (!key) return;
    const ids = key.split("\n");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    Promise.all(batches.map((threadIds) => rpc.call("cardModels", { threadIds }))).then((results) => {
      if (!live) return;
      const source = results.every((r) => r.source === "host") ? "host" : "none";
      const items = results.flatMap((r) => r.items);
      // Each thread keeps its last answer until a newer one names it (R1 #172).
      setServed((prior) => {
        const named = new Set(items.map((item) => item.threadId));
        const kept = source === "host" && prior?.source === "host" ? prior.items.filter((item) => !named.has(item.threadId)) : [];
        return { source, items: [...kept, ...items] };
      });
    }, () => undefined);
    return () => { live = false; };
  }, [rpc, key, revision]);
  return served;
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

/**
 * The round-5 card (section 7): the summary line, the harness split as one bar
 * and one line of names, a rule, then one line per running thread. It fills
 * the sidebar width; the hit area around it is inset 8 px.
 */
export function StatsPanel({ rows, stale = false }: { rows: readonly PluginSidebarThread[] | null; stale?: boolean }) {
  const actions = useSidebarThreadActions();
  const read = useSpecsRead();
  const running = rows?.filter(isRunning) ?? [];
  const models = useModels(running.map((row) => row.id), running.map((row) => row.updatedAt).join());
  const now = Date.now();
  const specs = read ? readSpecsFile(read, now) : null;
  const file = specs?.status === "ready" ? specs.file : null;
  const stats = computeStatsV4(rows, file, models, now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  const labels = cardRowLabels(rows ?? [], file, now);
  const threads = useCardThreads(stats.threads);
  return (
    <section aria-label="Running threads" data-stale={stale ? "true" : undefined} style={{
      display: "flex", flexDirection: "column", gap: 10, minHeight: 0, boxSizing: "border-box",
      width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13, lineHeight: "20px",
      fontVariantNumeric: "tabular-nums", background: "var(--card, #222222)", color: "var(--foreground)", border: `1px solid ${tokens.border}`,
    }}>
      {stats.status !== "ready" ? <p style={quiet}>Stats unavailable</p> : (
        <>
          <p style={{ ...quiet, flexShrink: 0 }}>{cardSummary(stats)}{stale ? " · last known" : ""}</p>
          {stats.harness.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
              <div data-harness-bar="" aria-hidden="true" style={{ display: "flex", gap: 3, height: 4 }}>
                {stats.harness.map(({ providerId, count }, i) => (
                  <span key={providerId} data-harness-segment={providerId}
                    style={{ flexGrow: count, flexBasis: 0, borderRadius: 2, background: segmentColour(providerId, i) }} />
                ))}
              </div>
              <ul aria-label="Harness" style={{ ...list, display: "flex", flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 2 }}>
                {stats.harness.map(({ providerId, count }) => (
                  <li key={providerId} data-harness={providerId} data-count={count} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <ProviderGlyph providerId={providerId} className="justify-start" />
                    <span>{harnessName(providerId)} {count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ul aria-label="Threads" style={{ ...list, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, flexShrink: 1, minHeight: 0, overflowY: "auto", alignContent: "start", borderTop: `1px solid ${tokens.border}`, paddingTop: 8, margin: "0 -4px" }}>
            {(threads ?? []).map((thread) => {
              const model = modelLabel(thread.model, thread.effort);
              return (
                <li key={thread.id} data-thread={thread.id} data-leaving={thread.leaving ? "true" : undefined}
                  style={{ opacity: thread.leaving ? 0.45 : 1, transition: "opacity 300ms" }}>
                  <button type="button" className="bg-transparent hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset"
                    style={{ appearance: "none", margin: 0, border: 0, color: "inherit", font: "inherit", textAlign: "left", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 6, minWidth: 0, padding: "0 4px", borderRadius: 4, cursor: "pointer" }}
                    onClick={(event) => actions.open(thread.id, { split: event.metaKey || event.ctrlKey })}>
                    <MatrixMark state={thread.matrix} />
                    <span style={{ ...oneLine, minWidth: 0, flexShrink: 1 }}>
                      <span data-title="">{labels.get(thread.id) ?? thread.title}</span>
                      {thread.shortName ? <span style={{ color: tokens.mutedText, opacity: 0.6 }}> · <span data-spec-name="">{thread.shortName}</span></span> : null}
                    </span>
                    {model ? <span data-model="" style={{ marginLeft: "auto", paddingLeft: 8, flexShrink: 0, whiteSpace: "nowrap", color: tokens.mutedText }}>{model}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
