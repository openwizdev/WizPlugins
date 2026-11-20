import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { countRunning, type ObservableRunningSource, type RunningCountSource } from "./running-count";
import { cardPinNext, isRunning, readSidebarRows, type SidebarRowsStatus } from "./stats";
import type { CardEventV4, CardStateV4 } from "./fixtures/v4";
import { MatrixMark } from "./MatrixMark";
import { StatsPanel } from "./StatsPanel";
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
  const base = { version: 1, scope: "observable-sidebar", subagents: { status: "unproven", count: null } } as const;
  const source: ObservableRunningSource = rows && status === "ready"
    ? { ...base, status, threads: rows.map((t) => ({ id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, isWorking: isRunning(t) })) }
    : { ...base, status: status === "ready" ? "incomplete" : status, threads: null };
  useFeatureSourceStatus("footer", source.status === "ready" ? "unverified" : "unavailable");
  return <FooterCounterArtwork className={className} source={source} card={() => <StatsPanel rows={rows} />} />;
}

const CARD_GAP = 6;
const CARD_MARGIN = 8;

/**
 * "N running" (specs-section.v1.md section 7): threads only, with a matrix
 * mark and the visible word. The card fills the sidebar, inset 8 px. Hover or focus opens the card; a click (Enter or Space) pins it and
 * another unpins it; Escape closes it. Synthetic inputs are not host proof.
 */
export function FooterCounterArtwork({ source, className, card }: {
  source: RunningCountSource | null;
  className?: string;
  card?: () => ReactNode;
}) {
  const { footerCountEnabled } = useWizBarSettings();
  const count = countRunning(source);
  const [state, setState] = useState<CardStateV4>("closed");
  const send = (event: CardEventV4) => setState((current) => cardPinNext(current, event));
  const unavailable = count === null;
  useEffect(() => {
    if (unavailable) setState("closed");
  }, [unavailable]);
  const wrapper = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const open = state !== "closed" && card !== undefined && footerCountEnabled && count !== null;
  // The card may use the space above the trigger, less a margin, and its list scrolls.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setRoom(Math.max(0, (wrapper.current?.getBoundingClientRect().top ?? 0) - CARD_MARGIN));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);
  if (!footerCountEnabled || count === null) return null;
  return (
    <div ref={wrapper} className={className} style={{ position: "relative" }}
      onPointerEnter={() => send("enter")} onPointerLeave={() => send("leave")} onFocus={() => send("focus")}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) send("blur"); }}
      onKeyDown={(event) => { if (event.key === "Escape") send("escape"); }}>
      <span role="status" aria-label={`${count.total} running`} aria-live="polite" style={{
        display: "inline-flex", fontSize: 12, fontVariantNumeric: "tabular-nums", lineHeight: "20px",
        color: count.total === 0 ? "var(--muted-foreground, #b7b7b7)" : "var(--foreground)",
      }}>
        <span role="button" tabIndex={0} aria-pressed={state === "pinned"} aria-expanded={open}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => send("click")}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            send("click");
          }}>
          <MatrixMark state={count.total > 0 ? "working" : "idle"} />
          <span aria-hidden="true">{count.total} running</span>
        </span>
      </span>
      {/* After the trigger, so Tab moves into the card. The padding bridges the gap to the
          trigger, one hit area, so pointing into the card never leaves the wrapper. */}
      {open ? (
        <div style={{
          position: "absolute", bottom: "100%", left: 8, right: 8, zIndex: 50, paddingBottom: CARD_GAP, boxSizing: "border-box",
          display: "flex", flexDirection: "column", maxHeight: room === null ? `calc(100vh - ${CARD_MARGIN}px)` : `${room}px`,
        }}>
          {card()}
        </div>
      ) : null}
    </div>
  );
}
