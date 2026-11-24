// The Specs section (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md
// sections 2 to 4 and 9. Under the 0.3 thread list: the rule
// `Specs N · M need you` and one row per running spec, collapsed until
// clicked, its open state kept per spec in plugin settings. Rows come from
// `specRows`, the same computation `wizbar specs` prints. The round-5 look
// (0.5 C, #112): a leading chevron, notes on the right, dots below, and an
// open spec raised into one card panel with its agents.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  experimental_usePluginId,
  useBbNavigate,
  useRpc,
  useSdk,
  useSettings,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { cn } from "../lib/utils";
import { TRAILING_GLYPH_BOX_CLASS } from "../StatusSlot";
import type { DotStateV4, SpecRowV4, SpecsFileReadV4 } from "../fixtures/v4";
import type { SpecsResultV6 } from "../fixtures/v6";
import { effectiveOpen, readOpenKeys, withOpen } from "./open-state";
import { boundHome, readSpecsFile } from "./read";
import { mainRows, needsYouWords, sectionRule, specRows } from "./rows";
import type { specsRpcContract } from "./server";
import { tokens } from "./theme";
import { readSpecsSort, type SpecsSort } from "../settings";
import { AgentRow } from "./AgentRow";
import { dotBreathes, nameMuted, useBreath, useBreathMode, type BreathMode } from "./breath";

const REFRESH_MS = 60_000;
const NO_BINDING: SpecsFileReadV4 = { kind: "no-binding" };

export interface SpecsSectionProps {
  threads: readonly PluginSidebarThread[];
  now: number;
  activeThreadId: string | null;
  onNavigate: () => void;
  /** S1 (#169): the section's own collapse, kept by the sidebar in `sectionsCollapsed`; independent of `specsOpen`. */
  collapsed?: boolean;
  /** With this, the rule is a button that collapses and expands the section. */
  onToggleCollapsed?: () => void;
  /** The collapse could not be saved. */
  collapseFailed?: boolean;
}

export const SpecsReadContext = createContext<SpecsFileReadV4 | null | undefined>(undefined);

export function useSpecsRead(): SpecsFileReadV4 | null {
  const shared = useContext(SpecsReadContext);
  const settings = useSettings();
  const rpc = useRpc<typeof specsRpcContract>();
  const binding = shared === undefined && !settings.isLoading ? boundHome(settings.values?.wizdeckFactories) : null;
  const key = binding ? JSON.stringify([binding.hostId, binding.rootPath]) : null;
  const [state, setState] = useState<{ key: string | null; read: SpecsFileReadV4 | null }>({ key, read: null });
  if (state.key !== key) setState({ key, read: null });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const load = () => rpc.call("specsFile", {}).then(
      (read) => { if (live) setState({ key, read }); },
      () => { if (live) setState({ key, read: { kind: "unreadable" } }); },
    );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [key, rpc]);
  if (shared !== undefined) return shared;
  if (settings.isLoading) return null;
  if (key === null) return NO_BINDING;
  return state.key === key ? state.read : null;
}

/**
 * `specsOpen` from plugin settings. Toggles show at once and save one at a time,
 * in order: a toggle made while a save is out is folded into the next save, and
 * only the newest toggle's answer is shown, so the latest choice wins on screen
 * and in the store. After the last save the written value is shown until the
 * host's values change.
 */
function useOpenSetting() {
  const pluginId = experimental_usePluginId();
  const host = useSettings();
  const sdk = useSdk();
  const [written, setWritten] = useState<{ baseline: unknown; value: unknown; saving: boolean } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const value = written && (written.saving || written.baseline === host.values) ? written.value : host.values?.specsOpen;
  const latest = useRef({ value, hostValues: host.values, seq: 0 });
  latest.current.value = value;
  latest.current.hostValues = host.values;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const toggle = useCallback((spec: string, open: boolean) => {
    const next = withOpen(latest.current.value, spec, open);
    const seq = ++latest.current.seq;
    latest.current.value = next;
    setWritten({ baseline: latest.current.hostValues, value: next, saving: true });
    setFailed(null);
    queue.current = queue.current.then(async () => {
      // A newer toggle carries this one's change in its own save.
      if (seq !== latest.current.seq) return;
      try {
        const result = await sdk.plugins.updateSettings({ pluginId, values: { specsOpen: next } });
        if (seq === latest.current.seq) setWritten({ baseline: latest.current.hostValues, value: result.values?.specsOpen ?? next, saving: false });
      } catch {
        if (seq === latest.current.seq) { setWritten(null); setFailed(spec); }
      }
    });
  }, [pluginId, sdk]);
  return { value, toggle, failed };
}

/**
 * S1 (#184): `specsSort`, the Specs section's order. A choice shows at once and
 * saves one at a time, the newest winning, like the open state; a failed save
 * goes back to the stored sort and says so.
 */
function useSortSetting() {
  const pluginId = experimental_usePluginId();
  const host = useSettings();
  const sdk = useSdk();
  const [written, setWritten] = useState<{ baseline: unknown; value: SpecsSort; saving: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const sort = written && (written.saving || written.baseline === host.values) ? written.value : readSpecsSort(host.values?.specsSort);
  const latest = useRef({
    hostValues: host.values,
    seq: 0,
    confirmed: null as { baseline: typeof host.values; value: SpecsSort; saving: false } | null,
  });
  latest.current.hostValues = host.values;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const choose = useCallback((next: SpecsSort) => {
    const seq = ++latest.current.seq;
    setWritten({ baseline: latest.current.hostValues, value: next, saving: true });
    setFailed(false);
    queue.current = queue.current.then(async () => {
      if (seq !== latest.current.seq) return;
      try {
        const result = await sdk.plugins.updateSettings({ pluginId, values: { specsSort: next } });
        const confirmed = { baseline: latest.current.hostValues, value: readSpecsSort(result.values?.specsSort ?? next), saving: false as const };
        latest.current.confirmed = confirmed;
        if (seq === latest.current.seq) setWritten(confirmed);
      } catch {
        if (seq === latest.current.seq) { setWritten(latest.current.confirmed); setFailed(true); }
      }
    });
  }, [pluginId, sdk]);
  return { sort, choose, failed };
}

export function SpecsSection({ threads, now, activeThreadId, onNavigate, collapsed = false, onToggleCollapsed, collapseFailed = false }: SpecsSectionProps) {
  const { value, toggle, failed } = useOpenSetting();
  const sorting = useSortSetting();
  const read = useSpecsRead();
  // A1 (#186): one breath mode for every dot in the section.
  const [breath, sectionRef] = useBreathMode();
  const view = useMemo(() => {
    if (read === null) return null;
    const file = readSpecsFile(read, now);
    return file.status === "ready" ? specRows(file.file, threads, readOpenKeys(value), now, null, sorting.sort) : "unavailable" as const;
  }, [now, read, threads, value, sorting.sort]);
  if (view === null) return null;
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  // S2 (#185): quiet rows follow the main list, under one Quiet group kept as `quiet` in `specsOpen`.
  const quiet = view === "unavailable" ? [] : view.specs.filter((row) => row.quiet);
  const quietOpen = readOpenKeys(value).includes(QUIET_KEY);
  const specRow = (row: SpecRowV4) => (
    <SpecRow key={row.spec} row={row} threads={byId} now={now} activeThreadId={activeThreadId} breath={breath}
      onNavigate={onNavigate} onToggle={() => toggle(row.spec, !row.open)} />
  );
  return (
    <section ref={sectionRef} aria-label="Specs">
      {view === "unavailable" ? (
        <h2 className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11.5px] font-medium">
          <span className="text-muted-foreground">Specs unavailable</span>
          <span data-rule-line="" className="h-px flex-1" style={{ background: tokens.rule }} />
        </h2>
      ) : <SpecsRule result={view} collapsed={collapsed} onToggle={onToggleCollapsed}
        picker={<SortPicker sort={sorting.sort} onChoose={sorting.choose} />} />}
      {failed ? <p role="status" className="px-2.5 text-xs text-muted-foreground">
        {failed === QUIET_KEY ? "Could not save the Quiet group. Try again." : "Could not save the open spec. Try again."}
      </p> : null}
      {sorting.failed ? <p role="status" className="px-2.5 text-xs text-muted-foreground">Could not save the sort. Try again.</p> : null}
      {collapseFailed ? <p role="status" className="px-2.5 text-xs text-muted-foreground">Could not save the collapsed section. Try again.</p> : null}
      {view === "unavailable" || collapsed ? null : (
        <ul className="flex flex-col gap-px">
          {/* #201 R1: one keyed array, the Quiet header placed at the split, so a spec moving between the main
              list and the open group keeps its DOM node (separate arrays would remount it), and React puts
              keyboard focus back on a kept node after a commit moves it. */}
          {[
            ...mainRows(view.specs).map(specRow),
            ...(quiet.length > 0 ? [<QuietGroup key={QUIET_KEY} count={quiet.length} open={quietOpen} onToggle={() => toggle(QUIET_KEY, !quietOpen)} />] : []),
            ...(quietOpen ? quiet.map(specRow) : []),
          ]}
        </ul>
      )}
    </section>
  );
}

const MIN_RULE_SPACE = 8 + 4;

/**
 * #161: `Specs N · M tickets need you (K specs)`, or `Specs N · M for you` when the full sentence does not
 * fit on one line. The full sentence is always the rule's accessible name and tooltip. An invisible copy
 * gives the full sentence's natural width, so the choice never flips on its own result.
 */
function SpecsRule({ result, collapsed, onToggle, picker }: { result: SpecsResultV6; collapsed: boolean; onToggle?: () => void; picker?: ReactNode }) {
  const words = needsYouWords(result);
  const sentence = sectionRule(result);
  const rule = useRef<HTMLHeadingElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = rule.current;
    const full = measure.current;
    if (!box || !full) return;
    const check = () => {
      // Not laid out (hidden, or no layout at all): keep the full sentence.
      if (box.clientWidth === 0) { setRoom(null); return; }
      const style = getComputedStyle(box);
      const inner = box.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setRoom(inner - full.offsetWidth);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    return () => observer.disconnect();
  }, [sentence]);
  const fits = room === null || room >= 0;
  const showLine = room === null || !fits || words === null || room >= MIN_RULE_SPACE;
  const label = (after: string | null) => (
    <>
      <span className="text-muted-foreground">Specs</span>{" "}
      <span className="font-normal tabular-nums text-muted-foreground/40">{mainRows(result.specs).length}</span>
      {after !== null ? <>{" "}<span style={{ color: tokens.warning }}>· {after}</span></> : null}
    </>
  );
  const line = (
    <>
      <span data-rule-text="" className="shrink-0 whitespace-nowrap">{label(words === null ? null : fits ? words.full : words.short)}</span>
      {showLine ? <span data-rule-line="" className="h-px min-w-0 flex-1" style={{ background: tokens.rule }} /> : null}
    </>
  );
  return (
    <div className="group/header relative flex items-end">
      <h2 ref={rule} aria-label={sentence} title={sentence}
        className={cn("flex min-w-0 flex-1 items-center gap-2 px-2.5 pb-1 pt-2 text-[11.5px] font-medium", picker && "pr-1")}>
        {/* S1 (#169): with a toggle, the whole line is the collapse button, named by the full sentence. */}
        {onToggle ? (
          <button type="button" aria-expanded={!collapsed} aria-label={sentence} onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {line}
          </button>
        ) : line}
      </h2>
      {/* Outside the heading, so its text and name stay the shown words; same size and weight as the rule. */}
      <span ref={measure} data-rule-measure="" aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-[11.5px] font-medium">
        {label(words?.full ?? null)}
      </span>
      {/* S1 (#184): outside the heading, so its options never join the rule's words or name. */}
      {picker}
    </div>
  );
}

/** S2 (#185): the Quiet group's key in `specsOpen`; never a spec key, which always holds `#`. */
const QUIET_KEY = "quiet";

/**
 * S2 (#185): the collapsed `Quiet N` group at the bottom of the Specs list. It opens like a spec: a chevron
 * in the spec's lead column, the word in muted text and its count faint, as the section rule writes its count.
 */
function QuietGroup({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <li data-quiet-group="" className="list-none text-xs">
      <button type="button" aria-expanded={open} aria-label={`Quiet ${count}`} onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[5px] text-left hover:bg-sidebar-accent/60">
        <span data-chevron={open ? "open" : "closed"} aria-hidden className="flex size-2.5 shrink-0 items-center justify-center text-muted-foreground/70">
          <svg viewBox="0 0 10 10" className={cn("size-2.5", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path d="M3.5 1.5 7 5l-3.5 3.5" />
          </svg>
        </span>
        <span className="text-[13px] text-muted-foreground">Quiet</span>
        <span className="text-[13px] tabular-nums text-muted-foreground/60">{count}</span>
      </button>
    </li>
  );
}

const sortLabels: Record<SpecsSort, string> = {
  "needs-you": "Needs you first", recent: "Recently active", closest: "Closest to done", newest: "Newest",
};

/**
 * S1 (#184): the Specs sort, a small sort-lines mark and chevron at the rule's right, hidden until the header
 * is hovered or focused. A native select lies over it, so the keyboard, a screen reader and the host's menu all work.
 */
function SortPicker({ sort, onChoose }: { sort: SpecsSort; onChoose: (sort: SpecsSort) => void }) {
  return (
    <span data-sort-picker="" title={`Sort: ${sortLabels[sort]}`}
      className="relative mb-1 mr-2 flex h-[18px] shrink-0 items-center gap-px rounded px-1 text-muted-foreground opacity-0 hover:bg-sidebar-accent/60 group-hover/header:opacity-100 group-has-[:focus-visible]/header:opacity-100 focus-within:opacity-100 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-sidebar-ring">
      <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
        <path d="M2 3.5h8M3.5 6h5M5 8.5h2" />
      </svg>
      <svg aria-hidden viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <path d="M2.5 4 5 6.5 7.5 4" />
      </svg>
      <select aria-label="Sort specs" value={sort} onChange={(event) => onChoose(event.currentTarget.value as SpecsSort)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0">
        {(Object.keys(sortLabels) as SpecsSort[]).map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}
      </select>
    </span>
  );
}

function SpecRow({ row, threads, now, activeThreadId, breath, onNavigate, onToggle }: {
  row: SpecRowV4;
  breath: BreathMode;
  now: number;
  threads: ReadonlyMap<string, PluginSidebarThread>;
  activeThreadId: string | null;
  onNavigate: () => void;
  onToggle: () => void;
}) {
  const navigate = useBbNavigate();
  // Hover and focus-within are separate, so a pointer leaving never hides the
  // GitHub action while keyboard focus is still in the row, and a blur never hides it under the pointer.
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const revealed = hover || focusWithin;
  const canOpen = row.agents.length > 0;
  const open = effectiveOpen(row);
  // The lead is the chevron, or a same-width placeholder, so every name starts at the same x.
  const lead = (
    <span data-chevron={canOpen ? (open ? "open" : "closed") : "none"} aria-hidden
      className="flex size-2.5 shrink-0 items-center justify-center text-muted-foreground/70">
      {canOpen ? (
        <svg viewBox="0 0 10 10" className={cn("size-2.5", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M3.5 1.5 7 5l-3.5 3.5" />
        </svg>
      ) : null}
    </span>
  );
  // A minimum width, so the notes can never squeeze the name to nothing (#164 R2).
  // A1 (#186): nothing running and nothing due now mutes the name, in place; host text colours only.
  const muted = nameMuted(row);
  const name = (
    <span data-spec-name="" data-muted={muted ? "" : undefined} className="min-w-[6rem] flex-1 truncate text-[13px]"
      style={{ color: muted ? tokens.mutedText : tokens.text }}>{row.shortName}</span>
  );
  // One clipped, wrapping line in priority order (#164 R2): when space is short the last note wraps out of
  // sight first, so done in the last hour goes, then later, and needs you stays longest.
  const notes = row.needsYou > 0 || row.yoursLater > 0 || row.doneLastHour > 0 ? (
    <span data-notes="" className="flex h-[18px] min-w-0 flex-wrap justify-end gap-x-2 overflow-hidden text-[11.5px] leading-[18px]">
      {row.needsYou > 0 ? <span data-needs-you="" className="shrink-0" style={{ color: tokens.warning }}>{row.needsYou} needs you</span> : null}
      {/* #162: tickets the owner gets once their blockers close, quiet beside the due-now count. */}
      {row.yoursLater > 0 ? (
        <span data-yours-later="" className="shrink-0 text-muted-foreground">
          {row.needsYou > 0 ? `· ${row.yoursLater} later` : `${row.yoursLater} later`}
        </span>
      ) : null}
      {row.doneLastHour > 0 ? <span data-done-last-hour="" className="shrink-0" style={{ color: tokens.doneNote }}>{row.doneLastHour} done in the last hour</span> : null}
    </span>
  ) : null;
  return (
    <li data-spec={row.spec} className={cn("list-none text-xs", open && "my-0.5 rounded-lg pb-1")}
      style={open ? { background: tokens.card } : undefined}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}>
      <div className="rounded-lg px-2.5 py-[5px] hover:bg-sidebar-accent/60">
        <div data-spec-line="" className="flex items-center gap-2">
          {canOpen ? (
            <button type="button" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${row.shortName}`}
              onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {lead}
              {name}
              {notes}
            </button>
          ) : <>{lead}{name}{notes}</>}
          <span className={cn(TRAILING_GLYPH_BOX_CLASS, "w-auto min-w-8 justify-end")}>
            {/* Always in the tab order, so a row with no chevron can still reach GitHub; shown on hover or focus. */}
            <button type="button" aria-label={`Open ${row.shortName} on GitHub`}
              className={cn("text-muted-foreground hover:text-foreground", !revealed && "sr-only")}
              onClick={() => navigate.openUrl(row.url)}>
              <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
            </button>
            {revealed ? null : <span data-done-total="" className="tabular-nums text-muted-foreground">{row.done}/{row.total}</span>}
          </span>
        </div>
        <Dots row={row} breath={breath} />
      </div>
      {open ? (
        <ul aria-label={`${row.shortName} agents`} className="flex flex-col gap-px">
          {row.agents.map((agent) => (
            <AgentRow key={agent.threadId} agent={agent} thread={threads.get(agent.threadId)} now={now}
              isActive={agent.threadId === activeThreadId} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const ring = (colour: string): CSSProperties => ({ boxShadow: `inset 0 0 0 1px ${colour}` });
const dotStyle: Record<DotStateV4, CSSProperties> = {
  done: { background: tokens.mutedAccent },
  "done-recent": { background: tokens.brightOlive },
  building: ring(tokens.mutedText),
  review: ring(tokens.mutedText),
  "needs-you": { background: tokens.warning },
  // #162: hollow and quiet, the warning hue only as a ring at partial strength.
  "yours-later": ring(`color-mix(in oklab, ${tokens.warning} 60%, transparent)`),
  held: ring(tokens.quietRing),
  "not-started": { background: tokens.border },
};
const dotWords: Record<DotStateV4, string> = {
  done: "done", "done-recent": "done in the last hour", building: "being built", review: "in review",
  "needs-you": "needs you", "yours-later": "later", held: "held", "not-started": "not started",
};

/** One dot per ticket, in the contract's dot order (section 2). */
function Dots({ row, breath }: { row: SpecRowV4; breath: BreathMode }) {
  const counts = new Map<DotStateV4, number>();
  for (const dot of row.dots) counts.set(dot.state, (counts.get(dot.state) ?? 0) + 1);
  const label = `${row.total} tickets: ${[...counts].map(([state, count]) => `${count} ${dotWords[state]}`).join(", ")}`;
  return (
    <span role="img" aria-label={label} className="mt-[5px] flex flex-wrap gap-[3px]">
      {row.dots.map((dot) => (
        <Dot key={dot.ticket} state={dot.state} breathing={dotBreathes(dot, row.agents)} breath={breath} />
      ))}
    </span>
  );
}

/** A1 (#186): one ticket dot; it breathes, in place and in step, while a working agent names its ticket. */
function Dot({ state, breathing, breath }: { state: DotStateV4; breathing: boolean; breath: BreathMode }) {
  const ref = useBreath(breathing, breath);
  return <span ref={ref} data-dot-state={state} data-breath={breathing ? "" : undefined}
    className="size-[5px] rounded-full" style={dotStyle[state]} />;
}
