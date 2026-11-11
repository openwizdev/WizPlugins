import { useEffect, useId, useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { countRunning, type RunningCountSource } from "./running-count";
import { experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import { useFeatureSourceStatus, useWizBarSettings } from "./SettingsPage";
import { readRunningSource } from "./running-source";

/** Observable host cache only; neither coverage nor freshness is claimed live. */
export function FooterCounter({ className }: { className?: string }) {
  const state = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const input = readRunningSource(state, connection);
  const [invalidatedSnapshot, setInvalidatedSnapshot] = useState<readonly PluginSidebarThread[] | null>(null);
  // The hook owns cache/realtime ordering. After an observable gap, a transport
  // reconnect alone cannot certify the same retained snapshot. No age is guessed.
  useEffect(() => {
    if (input.status !== "ready") setInvalidatedSnapshot(state.threads);
  }, [input.status, state.threads]);
  const source = input.status === "ready" && invalidatedSnapshot === state.threads
    ? { ...input, status: "stale" as const, threads: null } : input;
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
