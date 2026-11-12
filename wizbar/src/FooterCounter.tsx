import { useEffect, useId, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { countRunning, type ObservableRunningSource, type RunningCountSource } from "./running-count";
import { isRunning, readSidebarRows, type SidebarRowsStatus } from "./stats";
import { experimental_usePluginId, experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import { useFeatureSourceStatus, useWizBarSettings } from "./SettingsPage";

/**
 * One owner per plugin: the row objects of the last snapshot seen during a gap
 * (not ready, not connected, malformed). Each hook instance may build its own
 * array, so arrays are never compared; the host keeps a row object while its
 * thread is unchanged, so the rows themselves are. After a gap, rows are
 * unavailable while they are the same row objects in the same order: a
 * reconnect or another consumer's array cannot certify retained rows. The first
 * ready snapshot that differs clears the gap for every consumer. An initial
 * load that has no rows yet is not a gap. No age is guessed.
 */
const gapRows = new Map<string, readonly unknown[]>();
const sameRows = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((row, i) => row === b[i]);

/** The observable host rows, or null when they cannot be trusted right now. */
export function useObservableRows(): { status: SidebarRowsStatus; rows: readonly PluginSidebarThread[] | null } {
  const pluginId = experimental_usePluginId();
  const state = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const read = readSidebarRows(state, connection);
  const rows: readonly unknown[] = Array.isArray(state?.threads) ? state.threads : [];
  if (read.status !== "ready") {
    if (!(read.status === "unavailable" && rows.length === 0)) gapRows.set(pluginId, [...rows]);
    return read;
  }
  const gap = gapRows.get(pluginId);
  if (gap && sameRows(read.rows!, gap)) return { status: "stale", rows: null };
  gapRows.delete(pluginId);
  return read;
}

/** Observable host cache only; neither coverage nor freshness is claimed live.
 * WZ20 (#41): counts the one running rule (stats.ts), the stats panel's total. */
export function FooterCounter({ className }: { className?: string }) {
  const { status, rows } = useObservableRows();
  const base = { version: 1, scope: "observable-sidebar", subagents: { status: "unproven", count: null } } as const;
  const source: ObservableRunningSource = rows && status === "ready"
    ? { ...base, status, threads: rows.map((t) => ({ id: t.id, projectId: t.projectId, parentThreadId: t.parentThreadId, isWorking: isRunning(t) })) }
    : { ...base, status: status === "ready" ? "incomplete" : status, threads: null };
  useFeatureSourceStatus("footer", source.status === "ready" ? "unverified" : "unavailable");
  return <FooterCounterArtwork className={className} source={source} />;
}

/** Presentation over explicit inputs; synthetic harness inputs are not host proof. */
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
