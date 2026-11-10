import { useEffect, useId, useState } from "react";
import { countRunning, type RunningCountSource } from "./running-count";

/**
 * Candidate artwork for the pinned SDK's host-rendered footer icon surface.
 * There is no verified complete source/subagent mapping yet. Keep that unknown
 * explicit: do not read backgroundAgents as subagents or show an invented zero.
 */
export function FooterCounter({ className }: { className?: string }) {
  return <FooterCounterArtwork className={className} source={null} />;
}

/** Presentation over explicit inputs; synthetic harness inputs are not host proof. */
export function FooterCounterArtwork({ source, className }: {
  source: RunningCountSource | null;
  className?: string;
}) {
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
  if (count === null) return null;
  const showSplit = hovered || focused;
  return (
    <>
      <style>{"@keyframes wizbar-running-spin { to { transform: rotate(360deg); } }"}</style>
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
          viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden="true"
          style={{ flexShrink: 0, animation: count.total > 0 ? "wizbar-running-spin 1s linear infinite" : undefined }}
        >
          <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={2} opacity={0.25} />
          <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <span>{count.total}</span>
        {showSplit ? (
          <span id={tooltipId} role="tooltip" style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0,
            whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 6, zIndex: 50,
            background: "var(--popover)", color: "var(--popover-foreground)",
            border: "1px solid var(--border)", pointerEvents: "none",
          }}>
            {count.threads} threads, {count.subagents} subagents
          </span>
        ) : null}
      </span>
    </>
  );
}
