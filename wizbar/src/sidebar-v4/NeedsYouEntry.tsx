// B1 (#76): the sidebar's Needs-you entry. Its items come from WizDeck's own
// read (D1); an explicit click on one opens WizDeck focused on that exact item
// through D1's same-plugin opener. Nothing else here navigates. A queue that
// cannot be read is shown as unavailable, never as nothing to answer.
import { useEffect, useId, useRef, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { openWizDeck } from "../deck/selection/selection";
import { useSidebarDeckResult } from "./deck-link";
import { popoverCss } from "./RunningPopover";

export function NeedsYouEntry() {
  const deck = useSidebarDeckResult();
  const navigate = useBbNavigate();
  const [open, setOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const view = deck?.view;
  if (!deck || !view || deck.projectKey === null) return null;
  const needs = view.needsYou;
  if (needs.freshness === "loading") return null;
  const queue = needs.view;
  if (!queue || queue.state === "unavailable") {
    return <span className="text-xs text-muted-foreground" title={needs.detail ?? undefined}>Needs you · unavailable</span>;
  }
  const label = queue.count === null ? `Needs you · ${queue.items.length} known` : `Needs you · ${queue.count}`;
  if (queue.items.length === 0) return <span className="text-xs text-muted-foreground">{label}</span>;
  const projectKey = deck.projectKey;
  return (
    <div ref={root} style={{ position: "relative" }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
      <style>{popoverCss}</style>
      <button type="button" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => { setOpen((value) => !value); setDeclined(false); }}
        className="wizbar-touch-row text-xs font-medium text-foreground hover:underline focus-visible:ring-1"
        style={{ border: 0, background: "none", padding: "0 2px", cursor: "pointer" }}>
        {label}
      </button>
      {open ? (
        <div id={listId} className="wizbar-running-pop" style={{
          zIndex: 50, padding: "4px 0", borderRadius: 6, fontSize: 12, lineHeight: "16px",
          background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)",
        }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {queue.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="wizbar-running-row"
                  aria-label={`Open ${item.code} in WizDeck: ${item.question}`}
                  onClick={() => {
                    const accepted = openWizDeck(navigate, { kind: "needs-you", projectKey, itemId: item.id });
                    setDeclined(!accepted);
                    if (accepted) setOpen(false);
                  }}
                  style={{ display: "flex", width: "100%", gap: 6, padding: "4px 10px", border: 0, borderBottom: "1px solid var(--border)",
                    background: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                  <span style={{ fontWeight: 600 }}>{item.code}</span>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{item.question}</span>
                </button>
              </li>
            ))}
          </ul>
          {declined ? <p role="status" style={{ margin: "4px 10px", color: "var(--muted-foreground)" }}>Open a thread to see WizDeck beside it.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
