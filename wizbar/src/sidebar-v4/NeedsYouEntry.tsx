// B1 (#76, J88): the sidebar's Needs-you entry. Its items come from WizDeck's
// own read (D1). An explicit click on one opens the item's verified owning
// thread through the host's native thread opener: it opens no panel, sends
// nothing and answers nothing. The owner is verified afresh at every click
// (./owner); an unverified, unknown or other-factory owner stays visibly
// unavailable and opens nothing. A queue that cannot be read is shown as
// unavailable, never as nothing to answer.
import { useEffect, useId, useRef, useState } from "react";
import { experimental_useSidebarThreadActions as useSidebarThreadActions } from "@get-bb/plugin-sdk/app";
import { useSidebarDeckResult } from "./deck-link";
import { useOwnerReader, type OwnerV1 } from "./owner";
import { popoverCss } from "./RunningPopover";

type OwnerState = { projectKey: string; owner: OwnerV1 | null };

export function NeedsYouEntry({ onNavigate }: { onNavigate?: () => void }) {
  const deck = useSidebarDeckResult();
  const actions = useSidebarThreadActions();
  const readOwner = useOwnerReader();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState<OwnerState | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  // The factory shown now, and whether this entry is still mounted, for checks after an await.
  const shown = useRef<string | null>(null);
  shown.current = deck?.view ? deck.projectKey : null;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const opening = useRef(false);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const projectKey = deck?.view ? deck.projectKey : null;
  // Opening the list shows whether the owner is verified now, so a click that cannot open says so first.
  useEffect(() => {
    if (!open || projectKey === null) return;
    let current = true;
    setOwner({ projectKey, owner: null });
    void readOwner(projectKey).then((next) => { if (current) setOwner({ projectKey, owner: next }); });
    return () => { current = false; };
  }, [open, projectKey, readOwner]);

  const view = deck?.view;
  if (!deck || !view || projectKey === null) return null;
  const needs = view.needsYou;
  if (needs.freshness === "loading") return null;
  const queue = needs.view;
  if (!queue || queue.state === "unavailable") {
    return <span className="text-xs text-muted-foreground" title={needs.detail ?? undefined}>Needs you · unavailable</span>;
  }
  const label = queue.count === null ? `Needs you · ${queue.items.length} known` : `Needs you · ${queue.count}`;
  if (queue.items.length === 0) return <span className="text-xs text-muted-foreground">{label}</span>;
  const known = owner?.projectKey === projectKey ? owner.owner : null;
  const verified = known?.status === "verified";

  const openOwner = async (split: boolean) => {
    if (opening.current) return; // One click, one navigation.
    opening.current = true;
    try {
      // Verified again at the click: a stored answer may be stale.
      const fresh = await readOwner(projectKey);
      if (!mounted.current) return;
      if (fresh.status !== "verified" || shown.current !== projectKey) {
        setOwner({ projectKey, owner: { status: "unavailable" } });
        return;
      }
      actions.open(fresh.threadId, { split });
      setOpen(false);
      onNavigate?.();
    } finally {
      opening.current = false;
    }
  };

  return (
    <div ref={root} style={{ position: "relative" }}
      onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
      <style>{popoverCss}</style>
      <button type="button" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
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
                <button type="button" className="wizbar-running-row" disabled={!verified}
                  aria-label={`Open ${item.code} in its owning thread: ${item.question}`}
                  onClick={(event) => { void openOwner(event.metaKey || event.ctrlKey); }}
                  style={{ display: "flex", width: "100%", gap: 6, padding: "4px 10px", border: 0, borderBottom: "1px solid var(--border)",
                    background: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: verified ? "pointer" : "default",
                    opacity: verified ? 1 : 0.6 }}>
                  <span style={{ fontWeight: 600 }}>{item.code}</span>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{item.question}</span>
                </button>
              </li>
            ))}
          </ul>
          <p role="status" style={{ margin: "4px 10px", color: "var(--muted-foreground)" }}>
            {known === null ? "Checking the owning thread…"
              : verified ? "Opens the factory's orchestrator thread."
              : "Owning thread unavailable: nothing opens until it is verified."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
