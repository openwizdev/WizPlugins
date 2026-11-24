import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { cloudAgents } from "./agents/cloud";
import { useAgentsRead } from "./agents/use-agents";
import { countRunning, type ObservableRunningSource, type RunningCount, type RunningCountSource } from "./running-count";
import { cardPinNext, computeStats, isRunning, readSidebarRows, type SidebarRowsStatus } from "./stats";
import type { CardEventV4, CardStateV4 } from "./fixtures/v4";
import { MatrixMark } from "./MatrixMark";
import { StatsPanel } from "./StatsPanel";
import { readSpecsFile } from "./specs/read";
import { SpecsReadContext, useSpecsRead } from "./specs/SpecsSection";
import { tokens } from "./specs/theme";
import { experimental_usePluginId, experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import { useFeatureSourceStatus, useWizBarSettings } from "./SettingsPage";

/**
 * One module-level gap store per plugin, shared by the list line and the panel.
 * It is keyed on values, never on arrays or row objects: hook instances may
 * project the same host data into their own arrays and objects. A snapshot's
 * fingerprint is the sorted list of each row's `id` and `updatedAt`. When a
 * gap begins (not ready, not connected, malformed) the connection epoch
 * increments; the store keeps the fingerprint of the rows retained during it.
 * After a gap, ready rows with that fingerprint stay unavailable in every
 * consumer; the first ready snapshot with another fingerprint clears the gap
 * for all of them. An initial load that has no rows yet is not a gap. No age is
 * guessed, and a reconnect with no row revised stays unavailable (fails closed).
 */
const gapStore = new Map<string, { epoch: number; gap: string | null }>();
const fingerprint = (rows: readonly unknown[]): string => JSON.stringify(rows
  .map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as { id?: unknown; updatedAt?: unknown };
    return [String(r.id), String(r.updatedAt)];
  })
  .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)));

/** The observable host rows, or null when they cannot be trusted right now. */
export function useObservableRows(): { status: SidebarRowsStatus; rows: readonly PluginSidebarThread[] | null } {
  const pluginId = experimental_usePluginId();
  const state = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const read = readSidebarRows(state, connection);
  const rows: readonly unknown[] = Array.isArray(state?.threads) ? state.threads : [];
  const entry = gapStore.get(pluginId) ?? { epoch: 0, gap: null };
  gapStore.set(pluginId, entry);
  if (read.status !== "ready") {
    if (!(read.status === "unavailable" && rows.length === 0)) {
      if (entry.gap === null) entry.epoch += 1;
      entry.gap = fingerprint(rows);
    }
    return read;
  }
  if (entry.gap !== null && fingerprint(read.rows!) === entry.gap) return { status: "stale", rows: null };
  entry.gap = null;
  return read;
}

/** Observable host cache only; neither coverage nor freshness is claimed live.
 * WZ20 (#41): counts the one running rule (stats.ts). WB4-3 (#1437): its hover
 * card is `StatsPanel`, the `wizbar stats` data for the same rows. */
export function FooterCounter({ className }: { className?: string }) {
  const { status, rows } = useObservableRows();
  const connection = useRealtimeConnectionState();
  const specsRead = useSpecsRead();
  const now = Date.now();
  const agents = useAgentsRead(now);
  const base = { version: 1, scope: "observable-sidebar", subagents: { status: "unproven", count: null } } as const;
  const source: ObservableRunningSource = rows && status === "ready"
    ? { ...base, status, threads: rows.filter((t) => !t.isArchived).map((t) => ({ id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, isWorking: isRunning(t) })) }
    : { ...base, status: status === "ready" ? "incomplete" : status, threads: null };
  useFeatureSourceStatus("footer", source.status === "ready" ? "unverified" : "unavailable");
  // R1 (#172): through a gap the card keeps the last ready rows; the artwork decides how long it shows them.
  const held = useRef<readonly PluginSidebarThread[] | null>(null);
  if (rows && status === "ready") held.current = rows;
  const cardRows = rows ?? held.current;
  const activeRows = cardRows?.filter((t) => !t.isArchived) ?? null;
  const stats = computeStats(activeRows, now, "UTC");
  const waitingOnYou = stats.status === "ready" ? stats.waitingOnYou : 0;
  const specs = specsRead ? readSpecsFile(specsRead, now) : null;
  const file = specs?.status === "ready" ? specs.file : null;
  const cloud = cloudAgents(agents, file, status === "ready" && connection === "connected" ? rows : null, now);
  const onGitHub = cloud.status === "ready" ? cloud.active : 0;
  return <FooterCounterArtwork className={className} source={source} waitingOnYou={waitingOnYou} onGitHub={onGitHub} card={(stale) => (
    <SpecsReadContext.Provider value={specsRead}>
      <StatsPanel rows={cardRows} stale={stale} />
    </SpecsReadContext.Provider>
  )} />;
}

/** R1 (#172): how long a source gap shows the last known count unmarked; past it, only an open card keeps it. */
export const FOOTER_HOLD_MS = 5_000;

const CARD_GAP = 6;
const CARD_MARGIN = 8;
const CARD_RADIUS = 8;
const cardBridge = "var(--sidebar, #161616)";

/**
 * "N running" (specs-section.v1.md section 7): threads only, with a matrix
 * mark and the visible word, plus waiting-on-you and live GitHub agent counts
 * when non-zero (dropping GitHub first, then shortening to "N waiting" to fit
 * one line). The card fills the sidebar, inset 8 px. Hover or focus opens the
 * card; a click (Enter or Space) pins it and another unpins it; Escape closes
 * it. Synthetic inputs are not host proof.
 * R1 (#172): a gap in the source keeps the last known count, and an open card, in place: unmarked for
 * `FOOTER_HOLD_MS`, then marked last known while the card stays open, and hidden once it is closed.
 */
export function FooterCounterArtwork({ source, className, card, waitingOnYou = 0, onGitHub = 0 }: {
  source: RunningCountSource | null;
  className?: string;
  card?: (stale: boolean) => ReactNode;
  waitingOnYou?: number;
  onGitHub?: number;
}) {
  const { footerCountEnabled } = useWizBarSettings();
  const live = countRunning(source);
  const last = useRef<{ count: RunningCount; waitingOnYou: number; onGitHub: number } | null>(null);
  const gapSince = useRef<number | null>(null);
  if (live) {
    last.current = { count: live, waitingOnYou, onGitHub };
    gapSince.current = null;
  } else if (gapSince.current === null && last.current) gapSince.current = Date.now();
  const current = live ? { count: live, waitingOnYou, onGitHub } : (gapSince.current === null ? null : last.current);
  const count = current?.count ?? null;
  const waiting = current?.waitingOnYou ?? 0;
  const github = current?.onGitHub ?? 0;
  const stale = live === null && gapSince.current !== null && Date.now() - gapSince.current >= FOOTER_HOLD_MS;
  const [, wake] = useReducer((n: number) => n + 1, 0);
  const staleAt = live === null && !stale ? gapSince.current : null;
  useEffect(() => {
    if (staleAt === null) return;
    const timer = setTimeout(wake, Math.max(0, staleAt + FOOTER_HOLD_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [staleAt]);
  const [state, setState] = useState<CardStateV4>("closed");
  const send = (event: CardEventV4) => setState((currentState) => cardPinNext(currentState, event));
  const cardOpen = state !== "closed" && card !== undefined;
  const shown = footerCountEnabled && count !== null && (!stale || cardOpen);
  useEffect(() => {
    if (!shown) setState("closed");
  }, [shown]);
  const wrapper = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState<{ key: string; tier: 0 | 1 | 2 }>({ key: "", tier: 0 });
  const fitKey = `${count?.total ?? ""}:${waiting}:${github}:${width}`;
  const tier: 0 | 1 | 2 = fit.key === fitKey ? fit.tier : 0;
  const open = cardOpen && shown;
  // The card may use the space above the trigger, less a margin, and its list scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setRoom(Math.max(0, (wrapper.current?.getBoundingClientRect().top ?? 0) - CARD_MARGIN));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);
  useLayoutEffect(() => {
    const node = wrapper.current;
    if (!shown || !node || typeof ResizeObserver === "undefined") return;
    const measure = () => setWidth(Math.round(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!shown || !el || el.clientWidth <= 0 || el.scrollWidth <= el.clientWidth) return;
    const next: 0 | 1 | 2 | null =
      tier === 0 ? (github > 0 ? 1 : waiting > 0 ? 2 : null)
      : tier === 1 && waiting > 0 ? 2
      : null;
    if (next !== null) setFit({ key: fitKey, tier: next });
  }, [shown, fitKey, tier, github, waiting]);
  if (!shown || count === null) return null;
  const label = [
    `${count.total} running`,
    ...(waiting > 0 ? [`${waiting} waiting on you`] : []),
    ...(github > 0 ? [`${github} on GitHub`] : []),
    ...(stale ? ["last known"] : []),
  ].join(", ");
  return (
    <div ref={wrapper} className={className} style={{ position: "relative" }}
      onPointerEnter={() => send("enter")} onPointerLeave={() => send("leave")} onFocus={() => send("focus")}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) send("blur"); }}
      onKeyDown={(event) => { if (event.key === "Escape") send("escape"); }}>
      <span role="status" aria-label={label} aria-live="polite" data-stale={stale ? "true" : undefined} style={{
        display: "inline-flex", maxWidth: "100%", minWidth: 0, fontSize: 12, fontVariantNumeric: "tabular-nums", lineHeight: "20px",
        color: count.total === 0 || stale ? tokens.mutedText : tokens.text,
      }}>
        <span role="button" tabIndex={0} aria-label={label} aria-pressed={state === "pinned"} aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", maxWidth: "100%", minWidth: 0 }}
          onClick={() => send("click")}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            send("click");
          }}>
          <MatrixMark state={count.total > 0 ? "working" : "idle"} />
          <span ref={textRef} aria-hidden="true" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            <span>{count.total} running</span>
            {waiting > 0 ? (
              <>
                <span style={{ color: tokens.mutedText }}>{" · "}</span>
                <span data-waiting-on-you="" style={{ color: stale ? tokens.mutedText : tokens.warning }}>
                  {waiting} {tier >= 2 ? "waiting" : "waiting on you"}
                </span>
              </>
            ) : null}
            {github > 0 && tier === 0 ? (
              <span data-on-github="" style={{ color: tokens.mutedText }}>
                {" · "}{github} on GitHub
              </span>
            ) : null}
          </span>
        </span>
      </span>
      {/* After the trigger, so Tab moves into the card. The padding bridges the gap to the
          trigger, one hit area, so pointing into the card never leaves the wrapper, and the
          opaque bridge masks the sidebar row behind that gap. */}
      {open ? (
        <div style={{
          position: "absolute", bottom: "100%", left: CARD_MARGIN, right: CARD_MARGIN, zIndex: 50, paddingBottom: CARD_GAP, boxSizing: "border-box",
          display: "flex", flexDirection: "column", maxHeight: room === null ? `calc(100vh - ${CARD_MARGIN}px)` : `${room}px`,
        }}>
          <div aria-hidden="true" data-card-bridge="" style={{
            position: "absolute", left: -CARD_MARGIN, right: -CARD_MARGIN, bottom: 0, height: CARD_GAP + CARD_RADIUS,
            background: cardBridge, pointerEvents: "none", zIndex: 0,
          }} />
          {/* Any card content, positioned or not, stacks above the bridge. */}
          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {card(stale)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
