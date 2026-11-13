import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  useRpc,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
  type PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { childrenList } from "./children";
import { modelLabel } from "./card-meta";
import { relativeTimeLabel } from "./relative-time";
import { StatusGlyph } from "./StatusGlyph";
import { useObservableRows } from "./FooterCounter";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import type { t3sidebarRpcContract } from "./server";
import type { CardModelsResultV3, ChildStatusV3 } from "./v3-types";

const MARGIN = 8;
const GAP = 4;
const WIDTH = 288;
/** Time to cross from the count into the list before a pointer leave closes it. */
const CLOSE_DELAY = 150;

/** Where the list goes: under the count, or above it when that has more room; always inside the viewport. */
export function placePopover(anchor: DOMRect, height: number, viewportWidth: number, viewportHeight: number): CSSProperties {
  const width = Math.min(WIDTH, viewportWidth - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(anchor.left, viewportWidth - MARGIN - width));
  const below = viewportHeight - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  if (height <= below || below >= above) {
    return { position: "fixed", left, width, top: anchor.bottom + GAP, maxHeight: Math.max(below, 0) };
  }
  return { position: "fixed", left, width, bottom: viewportHeight - anchor.top + GAP, maxHeight: above };
}

const glyph: Record<ChildStatusV3, PluginSidebarThreadIndicator> = {
  waiting: "waiting-for-input", failed: "unread-error", working: "runtime", unread: "unread-success", idle: "none",
};

/**
 * The card's child count, and the list it opens (sidebar-v3.v1.md section 3,
 * target picture B). Hover or keyboard focus opens it; leaving it or Escape
 * closes it. It may cover the next card, never the viewport's edge.
 */
export function ChildrenPopover({
  parent,
  threads,
  label,
  now,
  onNavigate,
}: {
  parent: PluginSidebarThread;
  /** The same active-lifecycle rows the card's count reads. */
  threads: readonly PluginSidebarThread[];
  /** The count chip's text, e.g. "3 children". */
  label: string;
  now: number;
  /** The host's after-navigation callback: closes a compact sidebar drawer. */
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" });
  const wrapper = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Escape returns focus to the count without reopening the list.
  const refocusing = useRef(false);
  const panelId = useId();
  const models = useChildModels(open ? threads.filter((t) => t.parentThreadId === parent.id).map((t) => t.id) : []);
  // Statuses only from rows the shared freshness-aware reader still trusts: a
  // connection gap makes them unavailable until a fresh snapshot (section 1).
  const fresh = useObservableRows();
  const list = fresh.status === "ready" && fresh.rows ? childrenList(fresh.rows, parent.id, models ?? undefined) : null;

  const cancelClose = () => clearTimeout(closeTimer.current);
  const show = () => { cancelClose(); setOpen(true); };
  const hide = () => { cancelClose(); setOpen(false); };
  useEffect(() => cancelClose, []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      // The client box excludes a page scrollbar; the window size is the fallback.
      const root = document.documentElement;
      setStyle(placePopover(trigger.current.getBoundingClientRect(), panel.current.scrollHeight,
        root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight));
    };
    place();
    // A scroll moves the count away from the list: close rather than float.
    const onScroll = (event: Event) => {
      if (!(event.target instanceof Node && panel.current?.contains(event.target))) hide();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, list?.children.length]);

  const openThread = (threadId: string) => {
    hide();
    actions.open(threadId);
    onNavigate();
  };

  return (
    <span
      ref={wrapper}
      className="pointer-events-auto relative max-w-full"
      // Hover is a mouse or pen gesture. A touch tap opens through focus and
      // click; its pointer, and the compatibility mouse after it, then "leave",
      // which must not close what the tap opened. Tapping elsewhere blurs it.
      onPointerEnter={(event) => { if (event.pointerType !== "touch") show(); }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
      }}
      onFocus={() => {
        if (refocusing.current) refocusing.current = false;
        else show();
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && wrapper.current?.contains(event.relatedTarget))) hide();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        hide();
        if (document.activeElement !== trigger.current) {
          refocusing.current = true;
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          // Opening is idempotent: a tap's compatibility hover and focus already
          // opened it, and its click must not undo that. Escape or leaving closes.
          event.stopPropagation();
          show();
        }}
        className="max-w-full rounded border border-border px-1 leading-4 [overflow-wrap:anywhere] hover:bg-accent hover:text-foreground"
      >
        {label}
      </button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={label}
          style={style}
          className="z-50 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="px-3 pb-1 pt-2.5 text-xs font-semibold">{label}</div>
          {list === null ? (
            <p className="px-3 py-1.5 text-2xs text-muted-foreground">Children are unavailable right now.</p>
          ) : (
            <ul className="flex flex-col gap-px p-1.5 pt-0.5">
              {list.children.map((child) => {
                const age = relativeTimeLabel(child.updatedAt, now);
                const model = modelLabel(child.model, child.effort);
                return (
                  <li key={child.id} className="list-none">
                    <button
                      type="button"
                      aria-label={`Open child: ${child.title}, ${child.status}, ${age}`}
                      onClick={() => openThread(child.id)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <span role="img" aria-label={child.status} className={cn(TRAILING_GLYPH_BOX_CLASS, "mt-0.5")}>
                        {child.status === "idle"
                          ? <span className="size-2 rounded-full bg-muted-foreground/60" />
                          : <StatusGlyph indicator={glyph[child.status]} label={null} />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                        <span className="w-full truncate text-xs">{child.title}</span>
                        {model ? (
                          <span className="max-w-full rounded border border-border px-1 text-2xs leading-4 text-muted-foreground">{model}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-2xs text-muted-foreground">{age}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => openThread(parent.id)}
              className="w-full rounded-md px-2 py-1 text-left text-2xs hover:bg-accent"
            >
              Open parent
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

/**
 * Model and effort for the open list, from the same `cardModels` RPC the
 * cards read. Null while it answers, when the source is "none", and on failure:
 * a missing source omits the chip.
 */
function useChildModels(threadIds: readonly string[]): CardModelsResultV3 | null {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [served, setServed] = useState<CardModelsResultV3 | null>(null);
  const key = threadIds.join("\n");
  useEffect(() => {
    let current = true;
    setServed(null);
    if (!key) return;
    const ids = key.split("\n");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    Promise.all(batches.map((batch) => rpc.call("cardModels", { threadIds: batch }))).then(
      (results) => {
        if (current && results.every((result) => result.source === "host")) {
          setServed({ source: "host", items: results.flatMap((result) => result.items) });
        }
      },
      () => undefined,
    );
    return () => { current = false; };
  }, [rpc, key]);
  return served;
}
