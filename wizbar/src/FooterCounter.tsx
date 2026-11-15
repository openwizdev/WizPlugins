import { useEffect, useId, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { countRunning, type RunningCountSource } from "./running-count";
import { readSidebarRows, type SidebarRowsStatus } from "./stats";
import { experimental_usePluginId, experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import { useFeatureSourceStatus, useWizBarSettings } from "./SettingsPage";
import { readRunningRows, type RunningInputV4, type RunningRowsV4 } from "./sidebar-v4/running";
import { RunningPopover } from "./sidebar-v4/RunningPopover";

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

/**
 * B1 (#76): the running count that replaces the footer bolt. One running set
 * (sidebar-v4/running.ts: the host's #160 inventory, else the sidebar's rows by
 * the one running rule) feeds both the number and the popover's rows, across
 * every project and independent of sidebar search. A snapshot the gap store
 * refuses shows no number. No subagent number is added to the thread rows.
 */
export function FooterCounter({ className, onNavigate, tagsFor }: {
  className?: string;
  onNavigate?: () => void;
  tagsFor?: (thread: PluginSidebarThread) => string[];
}) {
  const { status } = useObservableRows();
  const state: RunningInputV4 = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const running: RunningRowsV4 = status === "ready" ? readRunningRows(state, connection) : { status: "unavailable", reason: "stale" };
  useFeatureSourceStatus("footer", running.status === "ready" ? "unverified" : "unavailable");
  const { footerCountEnabled } = useWizBarSettings();
  if (!footerCountEnabled || running.status !== "ready") return null;
  return <RunningPopover running={running} className={className} onNavigate={onNavigate} tagsFor={tagsFor} />;
}

/** Historical presentation over explicit count inputs (WZ5 artwork); production uses `FooterCounter`. */
export function FooterCounterArtwork({ source, className }: {
  source: RunningCountSource | null;
  className?: string;
}) {
  const { footerCountEnabled } = useWizBarSettings();
  const count = countRunning(source);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tooltipId = useId();
  const unavailable = count === null;
  useEffect(() => {
    if (unavailable) {
      setHovered(false);
      setFocused(false);
    }
  }, [unavailable]);
  if (!footerCountEnabled || count === null) return null;
  const showSplit = hovered || focused;
  return (
    <>
      <style>{"@keyframes wizbar-running-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .wizbar-running-spinner { animation: none !important; } }"}</style>
      <span
        role="status"
        aria-label={`${count.total} running`}
        aria-describedby={showSplit ? tooltipId : undefined}
        aria-live="polite"
        tabIndex={0}
        className={className}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center",
          gap: 6, fontSize: 12, fontVariantNumeric: "tabular-nums", lineHeight: "20px",
          color: count.total === 0 ? "var(--muted-foreground)" : "var(--foreground)",
        }}
      >
        <svg
          className="wizbar-running-spinner" viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden="true"
          style={{ flexShrink: 0, animation: count.total > 0 ? "wizbar-running-spin 1s linear infinite" : undefined }}
        >
          <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={2} opacity={0.25} />
          <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <span>{count.total}</span>
        {showSplit ? (
          <span id={tooltipId} role="tooltip" style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0,
            width: "max-content", maxWidth: "min(300px, calc(100vw - 32px))", whiteSpace: "normal", padding: "4px 8px", borderRadius: 6, zIndex: 50,
            background: "var(--popover)", color: "var(--popover-foreground)",
            border: "1px solid var(--border)", pointerEvents: "none",
          }}>
            {count.subagents === null
              ? `${count.threads} running · subagents not counted yet · some threads may be unseen`
              : `${count.threads} threads, ${count.subagents} subagents`}
          </span>
        ) : null}
      </span>
    </>
  );
}
