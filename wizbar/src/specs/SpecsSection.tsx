// The Specs section (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md
// sections 2 to 4 and 9. Under the 0.3 thread list: the rule
// `Specs N · M need you` and one row per running spec, collapsed until
// clicked, its open state kept per spec in plugin settings. Rows come from
// `specRows`, the same computation `wizbar specs` prints.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { TRAILING_GLYPH_BOX_CLASS } from "../StatusSlot";
import type { DotStateV4, SpecRowV4, SpecsFileReadV4 } from "../fixtures/v4";
import { effectiveOpen, readOpenKeys, withOpen } from "./open-state";
import { boundHome, readSpecsFile } from "./read";
import { sectionRule, specRows } from "./rows";
import type { specsRpcContract } from "./server";
import { tokens } from "./theme";
import { AgentRow } from "./AgentRow";

const REFRESH_MS = 60_000;
const NO_BINDING: SpecsFileReadV4 = { kind: "no-binding" };

export interface SpecsSectionProps {
  threads: readonly PluginSidebarThread[];
  now: number;
  activeThreadId: string | null;
  onNavigate: () => void;
}

/**
 * The server's specs file read for the bound factory, asked for on mount, at once
 * when the binding's host or root changes, and once a minute; a failed call is
 * unreadable. A read is shown only under the binding it was asked for, so a
 * switch clears the old rows at once and a late answer for the old one is dropped.
 */
function useSpecsFile(home: string | null): SpecsFileReadV4 | null {
  const rpc = useRpc<typeof specsRpcContract>();
  const [read, setRead] = useState<{ home: string; read: SpecsFileReadV4 } | null>(null);
  useEffect(() => {
    if (home === null) return;
    let live = true;
    const load = () => rpc.call("specsFile", {}).then(
      (result) => { if (live) setRead({ home, read: result }); },
      () => { if (live) setRead({ home, read: { kind: "unreadable" } }); },
    );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [home, rpc]);
  // With no bound factory there is nothing to read (section 1: no-binding).
  if (home === null) return NO_BINDING;
  return read?.home === home ? read.read : null;
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
  const [failed, setFailed] = useState(false);
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
    setFailed(false);
    queue.current = queue.current.then(async () => {
      // A newer toggle carries this one's change in its own save.
      if (seq !== latest.current.seq) return;
      try {
        const result = await sdk.plugins.updateSettings({ pluginId, values: { specsOpen: next } });
        if (seq === latest.current.seq) setWritten({ baseline: latest.current.hostValues, value: result.values?.specsOpen ?? next, saving: false });
      } catch {
        if (seq === latest.current.seq) { setWritten(null); setFailed(true); }
      }
    });
  }, [pluginId, sdk]);
  const home = boundHome(host.values?.wizdeckFactories);
  return { value, toggle, failed, home: home === null ? null : JSON.stringify([home.hostId, home.rootPath]) };
}

export function SpecsSection({ threads, now, activeThreadId, onNavigate }: SpecsSectionProps) {
  const { value, toggle, failed, home } = useOpenSetting();
  const read = useSpecsFile(home);
  const view = useMemo(() => {
    if (read === null) return null;
    const file = readSpecsFile(read, now);
    return file.status === "ready" ? specRows(file.file, threads, readOpenKeys(value), now) : "unavailable" as const;
  }, [now, read, threads, value]);
  if (view === null) return null;
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  return (
    <section aria-label="Specs">
      <h2 className="flex items-center gap-2 px-2.5 pb-1 pt-3">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {view === "unavailable" ? "Specs unavailable" : sectionRule(view)}
        </span>
        <span className="h-px flex-1" style={{ background: tokens.mutedAccent }} />
      </h2>
      {failed ? <p role="status" className="px-2.5 text-xs text-muted-foreground">Could not save the open spec. Try again.</p> : null}
      {view === "unavailable" ? null : (
        <ul className="flex flex-col gap-px">
          {view.specs.map((row) => (
            <SpecRow key={row.spec} row={row} threads={byId} now={now} activeThreadId={activeThreadId}
              onNavigate={onNavigate} onToggle={() => toggle(row.spec, !row.open)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SpecRow({ row, threads, now, activeThreadId, onNavigate, onToggle }: {
  row: SpecRowV4;
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
  const name = (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span data-spec-name="" className="truncate text-foreground">{row.shortName}</span>
      {row.needsYou > 0 ? <span data-needs-you="" className="shrink-0" style={{ color: tokens.warning }}>{row.needsYou} needs you</span> : null}
      {row.doneLastHour > 0 ? <span data-done-last-hour="" className="shrink-0" style={{ color: tokens.mutedAccent }}>{row.doneLastHour} done in the last hour</span> : null}
    </span>
  );
  return (
    <li data-spec={row.spec} className="list-none rounded-md px-2.5 py-1 text-xs hover:bg-sidebar-accent/60"
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}>
      <div className="flex items-center gap-2">
        {canOpen ? (
          <button type="button" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${row.shortName}`}
            onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            {name}
            <Icon name="ChevronDown" className={cn("size-3 shrink-0 text-muted-foreground/70 transition-transform", open && "rotate-180")} />
          </button>
        ) : name}
        <span className={cn(TRAILING_GLYPH_BOX_CLASS, "w-auto min-w-6 justify-end")}>
          {/* Always in the tab order, so a row with no chevron can still reach GitHub; shown on hover or focus. */}
          <button type="button" aria-label={`Open ${row.shortName} on GitHub`}
            className={cn("text-muted-foreground hover:text-foreground", !revealed && "sr-only")}
            onClick={() => navigate.openUrl(row.url)}>
            <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
          </button>
          {revealed ? null : <span data-done-total="" className="tabular-nums text-muted-foreground">{row.done}/{row.total}</span>}
        </span>
      </div>
      <Dots row={row} />
      {open ? (
        <ul aria-label={`${row.shortName} agents`} className="mt-1 flex flex-col gap-px">
          {row.agents.map((agent) => (
            <AgentRow key={agent.threadId} agent={agent} thread={threads.get(agent.threadId)} now={now}
              isActive={agent.threadId === activeThreadId} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const dotStyle: Record<DotStateV4, CSSProperties> = {
  done: { background: tokens.mutedAccent },
  "done-recent": { background: tokens.mutedAccent, boxShadow: `0 0 0 1px ${tokens.accent}` },
  building: { background: tokens.accent },
  review: { boxShadow: `inset 0 0 0 1px ${tokens.accent}` },
  "needs-you": { background: tokens.warning },
  held: { boxShadow: `inset 0 0 0 1px ${tokens.mutedText}` },
  "not-started": { background: tokens.border },
};
const dotWords: Record<DotStateV4, string> = {
  done: "done", "done-recent": "done in the last hour", building: "being built", review: "in review",
  "needs-you": "needs you", held: "held", "not-started": "not started",
};

/** One dot per ticket, in the contract's dot order (section 2). */
function Dots({ row }: { row: SpecRowV4 }) {
  const counts = new Map<DotStateV4, number>();
  for (const dot of row.dots) counts.set(dot.state, (counts.get(dot.state) ?? 0) + 1);
  const label = `${row.total} tickets: ${[...counts].map(([state, count]) => `${count} ${dotWords[state]}`).join(", ")}`;
  return (
    <span role="img" aria-label={label} className="mt-1 flex flex-wrap gap-1">
      {row.dots.map((dot) => (
        <span key={dot.ticket} data-dot-state={dot.state} className="size-1.5 rounded-full" style={dotStyle[dot.state]} />
      ))}
    </span>
  );
}
