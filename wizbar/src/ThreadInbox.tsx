import { useEffect, useMemo, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  useRealtimeConnectionState,
  useRpc,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/Select";
import { ThreadCard } from "./ThreadCard";
import { FooterCounter } from "./FooterCounter";
import { MachineIcon } from "./MachineIcon";
import { useFeatureSourceStatus } from "./SettingsPage";
import { SlimRow } from "./SlimRow";
import { useLifecycle } from "./useLifecycle";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import type { t3sidebarRpcContract } from "./server";
import type { MovePositionV3 } from "./v3-types";
import {
  dragPinOutcome,
  dropAction,
  isReconciled,
  keyboardAction,
  stepOutcome,
  type DragAction,
  type DropTarget,
  type HostStep,
} from "./drag";
import {
  filterByProject,
  hideChildrenOfVisibleParents,
  partitionPinned,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  sortPinned,
  threadDisplayTitle,
  visibleInboxThreads,
} from "./inbox";

const ALL_PROJECTS = "__all__";

/**
 * The sidebar's scrolling list: one flat, statically ordered stack of cards.
 *
 * The host owns the New-thread button and the search field above it, so this
 * ships neither. It filters by the `searchQuery` prop and keeps only the one
 * control the host has no equivalent for: the project scope picker.
 */
export function ThreadInbox({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  useFeatureSourceStatus("icons", status === "ready" ? "unverified" : "unavailable");
  const actions = useSidebarThreadActions();
  const lifecycle = useLifecycle(threads);
  const [scope, setScope] = useState<string>(ALL_PROJECTS);
  // One clock for every card in a render, quantized to the minute so the
  // labels do not disagree and do not churn on unrelated re-renders.
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [showMuted, setShowMuted] = useState(false);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const { pinned, inbox, snoozed, settled, muted } = useMemo(() => {
    const scoped = filterByProject(
      visibleInboxThreads(threads),
      scope === ALL_PROJECTS ? null : scope,
    );
    // Children live in their parent's header chip instead of the flat list;
    // an orphan whose parent is not on screen stays here.
    const matched = searchThreadsByTitle(
      hideChildrenOfVisibleParents(scoped),
      searchQuery,
    );
    const active: typeof matched = [];
    const onSnoozeShelf: typeof matched = [];
    const onSettledShelf: typeof matched = [];
    const onMutedShelf: typeof matched = [];
    for (const thread of matched) {
      // Pinned rows always stay visible: the host's pin wins over a stored
      // settle or snooze, which is kept for when the thread is unpinned.
      const shelf = thread.isPinned ? "active" : lifecycle.shelfFor(thread);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else if (shelf === "muted") onMutedShelf.push(thread);
      else active.push(thread);
    }
    const split = partitionPinned(active);
    return {
      // The host's pinned order, so a drag's reorder shows as the host stores it.
      pinned: sortPinned(split.pinned),
      inbox: sortByCreatedAtDescending(split.inbox),
      // Soonest wake first: "what comes back next" is the shelf's question.
      snoozed: [...onSnoozeShelf].sort(
        (left, right) =>
          (lifecycle.wakeAtFor(left) ?? 0) - (lifecycle.wakeAtFor(right) ?? 0),
      ),
      settled: sortByCreatedAtDescending(onSettledShelf),
      muted: sortByCreatedAtDescending(onMutedShelf),
    };
  }, [lifecycle, scope, searchQuery, threads]);

  const connection = useRealtimeConnectionState();
  const drag = useDragPins(status, connection, threads, pinned);

  const scopeLabel =
    scope === ALL_PROJECTS
      ? "All projects"
      : (projectNameById.get(scope) ?? "All projects");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The one control the host has no equivalent for. Everything else in
          the chrome above — New thread, search — is bb's and stays bb's. */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
        <Select value={scope} onValueChange={setScope}>
          {/* Ghost trigger: no border, no filled track — it reads as a label
              until you hover it. */}
          <SelectTrigger
            className="h-7 min-w-0 flex-1 border-0 px-1.5 py-1 text-xs font-medium text-muted-foreground shadow-none hover:bg-sidebar-accent focus:ring-0"
            aria-label={`Project scope: ${scopeLabel}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PROJECTS} className="text-xs">
              All projects
            </SelectItem>
            {projects.map((project) => (
              <SelectItem
                key={project.id}
                value={project.id}
                className="text-xs"
              >
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" ref={drag.containerRef} {...drag.handlers}>
        <p className="sr-only">
          Drag a card into Pinned to pin it, out to unpin it, or inside Pinned to reorder it.
          With a card focused, Alt+Up and Alt+Down do the same.
        </p>
        {drag.message ? (
          <p role="alert" className="px-2.5 py-1 text-xs text-destructive-text">{drag.message}</p>
        ) : null}
        {status === "loading" ? null : status === "error" || drag.rowsUnknown ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            Could not load threads.
          </p>
        ) : pinned.length + inbox.length + snoozed.length + settled.length + muted.length ===
          0 ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-xs text-muted-foreground"
          >
            {searchQuery.trim() ? "No threads found" : "No threads yet"}
          </p>
        ) : (
          <>
            {pinned.length > 0 || drag.draggingId !== null ? (
              <Shelf label="Pinned" pinnedDropZone>
                {pinned.length === 0 ? (
                  <li className="list-none rounded-md border border-dashed border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
                    Drop here to pin
                  </li>
                ) : null}
                {pinned.flatMap((thread, index) => [
                  drag.markerBefore(thread.id, index) ? <DropMarker key={`marker-${thread.id}`} /> : null,
                  <ThreadCard
                    key={thread.id}
                    thread={thread}
                    projectName={projectNameById.get(thread.projectId) ?? null}
                    isActive={thread.id === activeThreadId}
                    canPark={lifecycle.canPark(thread)}
                    onNavigate={onNavigate}
                    onSettle={() => lifecycle.settle(thread.id)}
                    onSnooze={(until) => lifecycle.snooze(thread.id, until)}
                    now={now}
                  />,
                ])}
                {drag.markerAtEnd() ? <DropMarker /> : null}
              </Shelf>
            ) : null}
            {inbox.length > 0 ? (
              <Shelf label={pinned.length > 0 || drag.draggingId !== null ? "Inbox" : null}>
                {inbox.map((thread) => (
                  <ThreadCard
                    key={thread.id}
                    thread={thread}
                    projectName={projectNameById.get(thread.projectId) ?? null}
                    isActive={thread.id === activeThreadId}
                    canPark={lifecycle.canPark(thread)}
                    onNavigate={onNavigate}
                    onSettle={() => lifecycle.settle(thread.id)}
                    onSnooze={(until) => lifecycle.snooze(thread.id, until)}
                    now={now}
                  />
                ))}
              </Shelf>
            ) : null}
            <ParkedShelf
              label="Snoozed"
              threads={snoozed}
              expanded={showSnoozed}
              onToggle={() => setShowSnoozed((open) => !open)}
              shelf="snoozed"
              activeThreadId={activeThreadId}
              lifecycle={lifecycle}
              onNavigate={onNavigate}
            />
            <ParkedShelf
              label="Muted"
              threads={muted}
              expanded={showMuted}
              onToggle={() => setShowMuted((open) => !open)}
              shelf="muted"
              activeThreadId={activeThreadId}
              lifecycle={lifecycle}
              onNavigate={onNavigate}
            />
            <ParkedShelf
              label="Settled"
              threads={settled}
              expanded={showSettled}
              onToggle={() => setShowSettled((open) => !open)}
              shelf="settled"
              activeThreadId={activeThreadId}
              lifecycle={lifecycle}
              onNavigate={onNavigate}
            />
          </>
        )}
      </div>
      <FooterCounter className="shrink-0 border-t border-sidebar-border px-3 py-1" />
    </div>
  );
}

/**
 * A collapsed shelf of parked threads. The header stays while anything is
 * parked — the count is the whole footprint when collapsed — and the shelf
 * vanishes entirely at zero.
 */
function ParkedShelf({
  label,
  threads,
  expanded,
  onToggle,
  shelf,
  activeThreadId,
  lifecycle,
  onNavigate,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  expanded: boolean;
  onToggle: () => void;
  shelf: "snoozed" | "settled" | "muted";
  activeThreadId: string | null;
  lifecycle: ReturnType<typeof useLifecycle>;
  onNavigate: () => void;
}) {
  if (threads.length === 0) return null;
  const now = Date.now();
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        // Padded like a card, so the chevron ends on the same right edge as
        // every row's status and provider glyph.
        className="mt-3 flex w-full items-center gap-2 px-2.5 pb-1 text-left"
      >
        <span className="text-2xs font-medium text-muted-foreground/70">
          {expanded ? label : `${label} (${threads.length})`}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className={TRAILING_GLYPH_BOX_CLASS}>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-px">
          {threads.map((thread) => shelf === "muted" ? (
            <MutedRow key={thread.id} thread={thread}
              isActive={thread.id === activeThreadId} onNavigate={onNavigate}
              onUnmute={() => lifecycle.unmute(thread.id)} />
          ) : (
            <SlimRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              shelf={shelf}
              wakeAt={lifecycle.wakeAtFor(thread)}
              now={now}
              onNavigate={onNavigate}
              onRestore={() =>
                shelf === "snoozed"
                  ? lifecycle.unsnooze(thread.id)
                  : lifecycle.unsettle(thread.id)
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** A mute has no timer; explicit undo stays separate from row navigation. */
function MutedRow({ thread, isActive, onNavigate, onUnmute }: {
  thread: PluginSidebarThread;
  isActive: boolean;
  onNavigate: () => void;
  onUnmute: () => Promise<void>;
}) {
  const actions = useSidebarThreadActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const title = threadDisplayTitle(thread);
  return (
    <li className="list-none">
      <div className={cn("relative flex h-8 items-center gap-2 rounded-md px-2.5 text-xs",
        isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}>
        <a href={thread.href} aria-label={title}
          data-sidebar-thread-shortcut-target="" data-sidebar-thread-id={thread.id}
          className="absolute inset-0 rounded-md"
          onClick={(event) => {
            event.preventDefault();
            actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
            onNavigate();
          }} />
        <span className="pointer-events-none relative min-w-0 flex-1 truncate text-muted-foreground">{title}</span>
        <MachineIcon environment={thread.environment} host={thread.host} runtimeStatus={thread.runtimeStatus} />
        <button type="button" aria-label="Unmute thread" disabled={pending}
          className="relative shrink-0 rounded px-1 py-1 text-muted-foreground hover:text-foreground focus-visible:ring-1 disabled:opacity-50"
          onClick={async () => {
            setPending(true); setError(false);
            try { await onUnmute(); } catch { setError(true); }
            finally { setPending(false); }
          }}>Unmute</button>
      </div>
      {error ? <p role="status" className="px-2.5 text-xs text-muted-foreground">Could not unmute thread. Try again.</p> : null}
    </li>
  );
}

function Shelf({
  label,
  children,
  pinnedDropZone = false,
}: {
  label: string | null;
  children: React.ReactNode;
  /** Marks Pinned as the drop zone that pins, places and reorders (WZ21). */
  pinnedDropZone?: boolean;
}) {
  return (
    // A named section is exposed as a landmark region; an unnamed one is not,
    // which is exactly right for the single unlabelled inbox list.
    <section {...(label ? { "aria-label": label } : {})} {...(pinnedDropZone ? { "data-wizbar-pinned": "" } : {})}>
      {label ? (
        <h2 className={cn("flex items-center gap-2 px-2.5 pb-1 pt-3")}>
          <span className="text-2xs font-medium text-muted-foreground/70">
            {label}
          </span>
          <span className="h-px flex-1 bg-sidebar-border" />
        </h2>
      ) : null}
      <ul className="flex flex-col gap-px">{children}</ul>
    </section>
  );
}

/** Where a dragged card would land inside Pinned; purely visual. */
function DropMarker() {
  return <li aria-hidden="true" className="mx-2.5 h-0.5 list-none rounded-full bg-sidebar-ring" />;
}

const threadIdAt = (target: EventTarget | null): string | null =>
  target instanceof Element
    ? (target.closest("[data-sidebar-thread-id]")?.getAttribute("data-sidebar-thread-id") ?? null)
    : null;

/**
 * WZ21 drag and keyboard moves. Every effect is one of WizBar's server
 * operations (pin, unpin, move), which call the host's own pins. Nothing is
 * moved optimistically: the shelves always draw the host's rows, so a failed
 * call leaves every card where the host has it and only adds a message.
 */
/** How long the rows may take to draw a fresh post-call read before the result is unknown. */
const RECONCILE_MS = 5_000;

function useDragPins(
  status: "error" | "loading" | "ready",
  connection: "connected" | "connecting" | "reconnecting",
  threads: readonly PluginSidebarThread[],
  pinned: readonly PluginSidebarThread[],
) {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ status, connection, threads });
  latest.current = { status, connection, threads };
  const waiters = useRef(new Set<() => void>());
  const [rowsUnknown, setRowsUnknown] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<MovePositionV3 | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // One action, one effect: a held key or a second drop while a move is out,
  // or before its rows are reconciled, would compute from rows the host has
  // not redrawn yet, so it is ignored.
  const inFlight = useRef(false);
  const pinnedIds = pinned.map((thread) => thread.id);

  // Every connection change starts a new epoch: a read taken in an earlier
  // epoch may predate host changes the restored connection has not drawn yet.
  const epoch = useRef(0);
  const seenConnection = useRef(connection);
  useEffect(() => {
    if (seenConnection.current !== connection) {
      seenConnection.current = connection;
      epoch.current++;
    }
    for (const check of [...waiters.current]) check();
  }, [status, connection, threads]);

  // The rows count as re-read only when a fresh server read of the pinned
  // order, taken on the current live connection, agrees with them. The whole
  // attempt, the read included, ends after RECONCILE_MS; late answers are ignored.
  const reconcile = () => new Promise<boolean>((resolve) => {
    let settled = false;
    let readingEpoch: number | null = null;
    let snapshot: { order: string[]; epoch: number } | null = null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      waiters.current.delete(check);
      resolve(value);
    };
    const read = async () => {
      const at = epoch.current;
      readingEpoch = at;
      try {
        const { order } = await rpc.call("pinnedOrder", {});
        if (at === epoch.current) snapshot = { order, epoch: at };
      } catch {
        // Only a failure of the current epoch's read decides; a superseded
        // read's failure is ignored like its success.
        if (at === epoch.current) finish(false);
      } finally {
        if (readingEpoch === at) readingEpoch = null;
      }
      check();
    };
    const check = () => {
      if (settled) return;
      const now = latest.current;
      if (snapshot && snapshot.epoch !== epoch.current) snapshot = null;
      if (now.connection !== "connected") return;
      if (!snapshot) {
        // A read still out from an earlier epoch cannot count; start a fresh one.
        if (readingEpoch !== epoch.current) void read();
        return;
      }
      if (now.status === "ready" && isReconciled(snapshot.order, now.threads)) finish(true);
    };
    const deadline = setTimeout(() => finish(false), RECONCILE_MS);
    waiters.current.add(check);
    check();
  });

  // While the result is unknown the shelves show the unavailable state; keep
  // trying to reconcile until the rows return.
  useEffect(() => {
    if (!rowsUnknown) return;
    let cancelled = false, running = false;
    const attempt = async () => {
      if (running) return;
      running = true;
      const ok = await reconcile();
      running = false;
      if (ok && !cancelled) setRowsUnknown(false);
    };
    void attempt();
    const timer = setInterval(() => void attempt(), RECONCILE_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [rowsUnknown]);

  // A keyboard move can re-mount the card on another shelf; give focus back
  // to it there, but never take focus from wherever the user has moved it.
  useEffect(() => {
    if (focusId === null) return;
    const active = document.activeElement;
    if (active && active !== document.body && threadIdAt(active) === focusId) return;
    if (active && active !== document.body) return;
    const anchors = containerRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-thread-id]") ?? [];
    for (const anchor of anchors) {
      if (anchor.getAttribute("data-sidebar-thread-id") === focusId) anchor.focus();
    }
  }, [focusId, threads]);

  const errorText = (error: unknown) =>
    error instanceof Error && error.message.trim() ? error.message : "Unknown error.";

  const run = async (threadId: string, action: DragAction) => {
    if (action.kind === "none" || inFlight.current) return;
    inFlight.current = true;
    try { await perform(threadId, action); } finally { inFlight.current = false; }
  };

  const perform = async (threadId: string, action: Exclude<DragAction, { kind: "none" }>) => {
    setMessage(null);
    if (action.kind === "pin") {
      // Two host calls with no atomic pair: never undo a step, just report.
      let pin: HostStep = { ok: true };
      let reorder: HostStep | null = null;
      try { await rpc.call("pin", { threadId }); } catch (error) { pin = { ok: false, error: errorText(error) }; }
      if (pin.ok) {
        try {
          await rpc.call("move", { threadId, position: action.position });
          reorder = { ok: true };
        } catch (error) { reorder = { ok: false, error: errorText(error) }; }
      }
      const ready = await reconcile();
      const outcome = dragPinOutcome(pin, reorder, ready);
      setRowsUnknown(!ready);
      setMessage(outcome.kind === "pinned-placed" ? null : outcome.message);
      return;
    }
    let step: HostStep = { ok: true };
    try {
      if (action.kind === "unpin") await rpc.call("unpin", { threadId });
      else await rpc.call("move", { threadId, position: action.position });
    } catch (error) {
      step = { ok: false, error: errorText(error) };
    }
    const ready = await reconcile();
    setRowsUnknown(!ready);
    setMessage(stepOutcome(action.kind, step, ready));
  };

  const targetOf = (event: React.DragEvent): DropTarget => {
    const element = event.target instanceof Element ? event.target : null;
    if (!element?.closest("[data-wizbar-pinned]")) return { inPinned: false };
    const row = element.closest("li");
    const overId = row?.querySelector("[data-sidebar-thread-id]")?.getAttribute("data-sidebar-thread-id") ?? null;
    if (row && overId !== null && pinnedIds.includes(overId)) {
      const box = row.getBoundingClientRect();
      return { inPinned: true, position: event.clientY > box.top + box.height / 2 ? { after: overId } : { before: overId } };
    }
    const last = pinnedIds[pinnedIds.length - 1];
    return { inPinned: true, position: last === undefined ? { last: true } : { after: last } };
  };

  const endDrag = () => { setDraggingId(null); setDropAt(null); };

  const handlers = {
    onDragStart(event: React.DragEvent) {
      const id = threadIdAt(event.target);
      if (id === null) return;
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      setMessage(null);
      setFocusId(null);
      setDraggingId(id);
    },
    onDragOver(event: React.DragEvent) {
      if (draggingId === null) return;
      event.preventDefault();
      const target = targetOf(event);
      const position = target.inPinned ? target.position : null;
      if (JSON.stringify(position) !== JSON.stringify(dropAt)) setDropAt(position);
    },
    onDrop(event: React.DragEvent) {
      if (draggingId === null) return;
      event.preventDefault();
      const id = draggingId;
      const action = dropAction(id, pinnedIds.includes(id), targetOf(event));
      endDrag();
      void run(id, action);
    },
    onDragEnd: endDrag,
    onKeyDown(event: React.KeyboardEvent) {
      if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
      const id = threadIdAt(event.target);
      // Any displayed row: Pinned, Inbox, or an expanded parked shelf.
      if (id === null) return;
      const action = keyboardAction(event.key, id, pinnedIds);
      if (action.kind === "none") return;
      event.preventDefault();
      setFocusId(id);
      void run(id, action);
    },
  };

  // The marker shows the landing place; a drop on the dragged card itself
  // changes nothing, so it shows none.
  const markerBefore = (id: string, index: number) => {
    if (dropAt === null || draggingId === id) return false;
    if ("before" in dropAt) return dropAt.before === id && dropAt.before !== draggingId;
    if ("after" in dropAt) return index > 0 && dropAt.after === pinnedIds[index - 1] && dropAt.after !== draggingId;
    return "first" in dropAt && index === 0;
  };
  const markerAtEnd = () => dropAt !== null && pinnedIds.length > 0 && draggingId !== pinnedIds[pinnedIds.length - 1] &&
    ("after" in dropAt ? dropAt.after === pinnedIds[pinnedIds.length - 1] : "last" in dropAt);

  return { containerRef, handlers, draggingId, message, rowsUnknown, markerBefore, markerAtEnd };
}
