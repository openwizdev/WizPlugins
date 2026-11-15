// B1 (#76): the sidebar's running count, which replaces the footer bolt. Hover
// or keyboard focus shows the popover; a click or tap latches it; Escape and an
// outside press dismiss it. Its rows are exactly the counted set (./running),
// grouped under their parents, and each opens through the host's own thread
// navigation. Compact dark Ledger styling; 44 px rows on a narrow screen.
import { useEffect, useId, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { RunningRowsV4 } from "./running";

const LIME = "#c6f432";
export const popoverCss = `@keyframes wizbar-running-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .wizbar-running-spinner { animation: none !important; } }
.wizbar-running-pop { position: absolute; bottom: calc(100% + 6px); left: 0; width: min(320px, calc(100vw - 24px)); max-height: min(60vh, 420px); overflow-y: auto; }
.wizbar-running-row { min-height: 28px; }
@media (max-width: 480px) {
  .wizbar-running-pop { position: fixed; left: 0; right: 0; bottom: 0; width: auto; max-height: 70vh; border-radius: 12px 12px 0 0 !important; }
  .wizbar-running-row, .wizbar-running-close { min-height: 44px; }
}`;

export function RunningPopover({ running, className, onNavigate, tagsFor }: {
  running: Extract<RunningRowsV4, { status: "ready" }>;
  className?: string;
  onNavigate?: () => void;
  /** Extra plain tags for a row, such as WizBar's own "muted". */
  tagsFor?: (thread: PluginSidebarThread) => string[];
}) {
  const actions = useSidebarThreadActions();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [latched, setLatched] = useState(false);
  // After Escape, an outside press or an unlatching click, hover and focus stay
  // quiet until the pointer or focus comes back in.
  const [quiet, setQuiet] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const open = latched || (!quiet && (hovered || focused));

  const dismiss = () => { setLatched(false); setQuiet(true); };
  // Returning focus to the count after a dismissal must not reopen it.
  const refocusing = useRef(false);
  const focusCount = () => {
    refocusing.current = true;
    try { button.current?.focus(); } finally { refocusing.current = false; }
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setLatched(false); setQuiet(true); setHovered(false); setFocused(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const { count } = running;
  return (
    <div
      ref={root}
      className={className}
      style={{ position: "relative" }}
      onMouseEnter={() => { setHovered(true); setQuiet(false); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => {
        if (refocusing.current) { setFocused(true); return; }
        if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget)) return;
        setFocused(true); setQuiet(false);
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && root.current?.contains(event.relatedTarget)) return;
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        dismiss();
        focusCount();
      }}
    >
      <style>{popoverCss}</style>
      <span role="status" aria-live="polite" aria-label={`${count} running`} style={{ display: "inline-flex" }}>
        <button
          ref={button}
          type="button"
          aria-label={`${count} running`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => (latched ? dismiss() : (setLatched(true), setQuiet(false)))}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "0 2px", border: 0, background: "none",
            font: "inherit", fontSize: 12, lineHeight: "20px", fontVariantNumeric: "tabular-nums", cursor: "pointer",
            color: count === 0 ? "var(--muted-foreground)" : "var(--foreground)",
          }}
        >
          <svg className="wizbar-running-spinner" viewBox="0 0 16 16" width={14} height={14} fill="none" aria-hidden="true"
            style={{ flexShrink: 0, animation: count > 0 ? "wizbar-running-spin 1s linear infinite" : undefined }}>
            <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={2} opacity={0.25} />
            <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span>{count} running</span>
        </button>
      </span>
      {open ? (
        <div id={popId} role="dialog" aria-label={`${count} running threads`} className="wizbar-running-pop" style={{
          zIndex: 50, padding: "6px 0", borderRadius: 6, fontSize: 12, lineHeight: "16px",
          background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 10px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{count} running · all projects</span>
            {latched ? (
              <button type="button" className="wizbar-running-close" onClick={() => { dismiss(); focusCount(); }}
                style={{ border: 0, background: "none", color: "var(--muted-foreground)", font: "inherit", cursor: "pointer" }}>
                Close
              </button>
            ) : null}
          </div>
          {running.source === "observable-sidebar" ? (
            <p style={{ margin: "6px 10px 0", color: "var(--muted-foreground)" }}>
              This host gives no running list, so this is the sidebar's own rows: some running threads may be unseen.
            </p>
          ) : null}
          {count === 0 ? <p style={{ margin: "6px 10px", color: "var(--muted-foreground)" }}>Nothing is running.</p> : null}
          {running.groups.map((group) => (
            <section key={group.heading ? `h:${group.heading.parentId}` : `r:${group.entries[0]!.thread.id}`}
              style={{ borderBottom: "1px solid var(--border)", padding: "4px 0" }}>
              {group.heading ? (
                <p style={{ margin: 0, padding: "2px 10px", color: "var(--muted-foreground)" }}>
                  {group.heading.kind === "parent" ? `Parent not running · ${group.heading.title}` : "Unplaced · parent not loaded"}
                </p>
              ) : null}
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {group.entries.map(({ thread, depth }) => {
                  const tags = [...(thread.isHidden ? ["hidden"] : []), ...(tagsFor?.(thread) ?? [])];
                  const indent = (group.heading ? 1 : 0) + depth;
                  return (
                    <li key={thread.id}>
                      <a
                        href={thread.href}
                        data-thread-id={thread.id}
                        aria-label={[`Open ${thread.displayTitle}`, ...tags].join(", ")}
                        className="wizbar-running-row"
                        onClick={(event) => {
                          event.preventDefault();
                          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
                          setLatched(false); setQuiet(true);
                          onNavigate?.();
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: `2px 10px 2px ${10 + indent * 14}px`,
                          color: "inherit", textDecoration: "none" }}
                      >
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: depth === 0 && !group.heading ? LIME : "transparent", border: depth === 0 && !group.heading ? 0 : `1px solid ${LIME}` }} />
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontWeight: depth === 0 && !group.heading ? 600 : 400 }}>{thread.displayTitle}</span>
                        {tags.map((tag) => (
                          <span key={tag} aria-hidden="true" style={{ padding: "0 4px", borderRadius: 3, background: "var(--muted)", color: "var(--muted-foreground)" }}>{tag}</span>
                        ))}
                        <span aria-hidden="true" style={{ color: "var(--muted-foreground)" }}>Open</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p style={{ margin: "4px 10px 0", color: "var(--muted-foreground)" }}>Esc to close</p>
        </div>
      ) : null}
    </div>
  );
}
