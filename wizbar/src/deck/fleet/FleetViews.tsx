// WizDeck's fleet views (F1, #75), in the confirmed Ledger style: Home's Fleet
// section and the spec fleet page (desktop and phone). A row click only
// highlights (shared selection); only an explicit Open navigates, natively.
// Unknown is always words, never zero or amber by guesswork.
import { useState, type CSSProperties } from "react";
import type { SelectionV1, SpecRefV1 } from "../../factory-contract";
import type { SpecRowV1 } from "../data/board";
import type { HomeViewV1 } from "../data/home";
import { LIME, SectionHeading, UrlButton, tapTarget } from "../home/sections";
import { setSelection } from "../selection/selection";
import { stallLabel } from "../live/health";
import { specOfThread, viewGroup, type FleetGroupV1, type FleetModelV1, type FleetRowV1, type FleetSortV1, type WorkLinkV1 } from "./model";

const AMBER = "var(--wizdeck-amber, #f5a524)";
const muted: CSSProperties = { color: "var(--muted-foreground)" };
const rule = "1px solid var(--border)";
const linkStyle: CSSProperties = {
  minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 2px", border: 0, background: "transparent",
  color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 3, font: "inherit", cursor: "pointer",
};

export interface FleetActions {
  /** Host URL opener, for issue and PR links. */
  openUrl(url: string): void;
  /** Native center-pane navigation; only an explicit Open calls it. */
  openThread(threadId: string): void;
}

const short = (ref: string) => `#${ref.split("#")[1]}`;

export function findSpec(board: HomeViewV1["board"], spec: SpecRefV1 | null): SpecRowV1 | null {
  if (!spec) return null;
  for (const version of board.versions) for (const row of version.specs) if (row.ref === spec) return row;
  return null;
}

function runningWords(model: FleetModelV1): string {
  const running = model.running;
  if (running.status === "ready") return `${running.count} running in this project`;
  const why = running.reason === "absent" ? "this host does not report its running threads"
    : running.reason === "loading" ? "reading the host"
    : running.reason === "stale" ? "the host connection dropped"
    : "the host's running list was inconsistent";
  return `Running unavailable: ${why}`;
}

function linkWords(link: WorkLinkV1): string {
  switch (link.status) {
    case "linked": return "";
    case "no-spec": return "no spec linked to its ticket";
    case "ambiguous": return `link ambiguous: ${link.detail}`;
    case "no-pull-request": return link.complete ? "no pull request for its branch" : "no pull request found in what was read";
    case "no-branch": return "no work link: no branch";
    case "links-unavailable": return "work links unavailable";
  }
}

function linksNote(model: FleetModelV1): string | null {
  const links = model.links;
  if (links.status === "not-connected") return "Work links are not connected in this build, so no thread can be placed under a spec yet.";
  if (links.status === "loading") return "Reading work links…";
  if (links.status === "unavailable") return `Work links unavailable: ${links.detail}`;
  if (!links.complete || links.stale) return `Work links partial${links.stale ? " and stale" : ""}: ${links.gaps.join(" ") || "not every repository was read."}`;
  return null;
}

// ---- One thread row -------------------------------------------------------

export function FleetRow({ row, actions, selection, projectKey }: {
  row: FleetRowV1; actions: FleetActions; selection: SelectionV1; projectKey: string;
}) {
  const selected = selection.kind === "thread" && selection.projectKey === projectKey && selection.threadId === row.id;
  const stall = stallLabel(row.stall);
  const role = row.role === "helper" ? "helper/reviewer" : row.role;
  const meta = [
    role,
    row.running === null ? "running unknown" : row.running ? "running" : "idle",
    row.isHidden ? "hidden" : null,
    stall.amber ? null : stall.text || null,
    linkWords(row.link) || null,
    row.parentNote === "absent" ? "parent not in this project's list" : row.parentNote === "elsewhere" ? "parent placed elsewhere" : null,
  ].filter(Boolean).join(" · ");
  const link = row.link;
  return (
    <li className="wizdeck-fleet-row" data-thread={row.id} data-depth={row.depth} data-selected={selected || undefined}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderBottom: rule,
        marginLeft: row.depth * 16, paddingLeft: row.depth > 0 ? 10 : 0, borderLeft: row.depth > 0 ? rule : undefined,
        outline: selected ? `1px solid ${LIME}` : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button type="button" aria-pressed={selected}
          onClick={() => setSelection(selected ? { kind: "none" } : { kind: "thread", projectKey, threadId: row.id })}
          style={{ ...linkStyle, textDecoration: "none", fontWeight: row.depth === 0 ? 600 : 400, textAlign: "left", overflowWrap: "anywhere", padding: 0, minHeight: 32 }}>
          {row.title}
        </button>
        <p style={{ ...muted, margin: 0, fontSize: 12 }}>
          {meta}
          {stall.amber && <span style={{ color: AMBER }}>{meta ? " · " : ""}{stall.text}</span>}
        </p>
        {(link.status === "linked" || link.status === "no-spec") && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 8px" }}>
            {link.tickets.map((ticket) => <UrlButton key={ticket.ref} url={ticket.url} label={short(ticket.ref)} open={actions.openUrl} style={linkStyle} />)}
            <UrlButton url={link.pullRequest.url} label={`PR ${short(link.pullRequest.ref)}${link.pullRequest.state === "merged" ? " merged" : ""}`} open={actions.openUrl} style={linkStyle} />
          </div>
        )}
      </div>
      <button type="button" style={tapTarget} aria-label={`Open ${row.title}`} onClick={() => actions.openThread(row.id)}>Open</button>
    </li>
  );
}

// ---- Home's Fleet section -------------------------------------------------

export function FleetSection({ model, board, actions, selection, projectKey, onView }: {
  model: FleetModelV1; board: HomeViewV1["board"]; actions: FleetActions; selection: SelectionV1; projectKey: string;
  onView(spec: SpecRefV1 | null): void;
}) {
  const highlighted = selection.kind === "spec" && selection.projectKey === projectKey ? selection.spec
    : selection.kind === "thread" && selection.projectKey === projectKey ? specOfThread(model, selection.threadId) : null;
  const note = linksNote(model);
  return (
    <section aria-labelledby="wizdeck-fleet">
      <SectionHeading id="wizdeck-fleet">Fleet</SectionHeading>
      <p style={{ ...muted, margin: "2px 0 6px" }}>{runningWords(model)} · {model.threadCount} thread{model.threadCount === 1 ? "" : "s"}</p>
      {note && <p role="status" style={{ ...muted, margin: "0 0 6px" }}>{note}</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {model.groups.map((group) => {
          const spec = findSpec(board, group.spec);
          const title = spec?.title ?? group.spec ?? "";
          const on = highlighted !== null && highlighted === group.spec;
          return (
            <li key={group.spec} data-spec={group.spec} data-highlighted={on || undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: rule, outline: on ? `1px solid ${LIME}` : undefined }}>
              <button type="button" aria-pressed={on} onClick={() => setSelection(on ? { kind: "none" } : { kind: "spec", projectKey, spec: group.spec as SpecRefV1 })}
                style={{ ...linkStyle, textDecoration: "none", flex: 1, minWidth: 0, textAlign: "left", overflowWrap: "anywhere" }}>
                <span><strong>{title}</strong> <span style={muted}>· {groupWords(group)}</span></span>
              </button>
              <button type="button" style={tapTarget} onClick={() => onView(group.spec)} aria-label={`View fleet for ${title}`}>View</button>
            </li>
          );
        })}
        {model.unplaced.rows.length > 0 && (
          <li data-spec="unplaced" style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: rule }}>
            <span style={{ flex: 1, minWidth: 0 }}><strong>Unplaced</strong> <span style={muted}>· {groupWords(model.unplaced)} · no verified spec link</span></span>
            <button type="button" style={tapTarget} onClick={() => onView(null)} aria-label="View unplaced threads">View</button>
          </li>
        )}
      </ul>
      {model.threadCount === 0 && <p style={{ ...muted, margin: "6px 0" }}>No active threads in this project.</p>}
    </section>
  );
}

function groupWords(group: FleetGroupV1): string {
  const total = `${group.rows.length} thread${group.rows.length === 1 ? "" : "s"}`;
  return group.running === null ? `${total} · running unknown` : `${group.running} running · ${total}`;
}

// ---- The spec fleet page --------------------------------------------------

function Big({ value, label, detail }: { value: number | null; label: string; detail?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "4px 10px" }} title={detail}>
      <div style={{ fontSize: 28, lineHeight: "34px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        aria-label={value === null ? `${label}: unavailable` : `${label}: ${value}`}>{value === null ? "—" : value}</div>
      <div style={muted}>{value === null ? `${label} · unavailable` : label}</div>
    </div>
  );
}

export function SpecFleet({ model, spec, board, actions, selection, projectKey, onBack }: {
  model: FleetModelV1; spec: SpecRefV1 | null; board: HomeViewV1["board"]; actions: FleetActions;
  selection: SelectionV1; projectKey: string; onBack(): void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FleetSortV1>("plan");
  const group = spec === null ? model.unplaced : model.groups.find((candidate) => candidate.spec === spec) ?? { spec, rows: [], running: model.running.status === "ready" ? 0 : null };
  const row = findSpec(board, spec);
  const rows = viewGroup(group, query, sort);
  const merged = spec ? model.mergedTickets.get(spec) ?? [] : [];
  const note = linksNote(model);
  const status = row?.status;
  return (
    <div className="wizdeck-fleet">
      <button type="button" style={linkStyle} onClick={onBack}>← Home</button>
      <h2 style={{ margin: "4px 0 0", fontSize: 20, lineHeight: "26px", fontWeight: 600, overflowWrap: "anywhere" }}>
        {spec === null ? "Unplaced work" : row?.title ?? spec}
      </h2>
      {spec && <p style={{ ...muted, margin: 0, fontSize: 12 }}>{spec}</p>}

      <section aria-label="Fleet summary" style={{ display: "flex", margin: "12px 0 4px", borderBottom: rule, paddingBottom: 10 }}>
        <Big value={group.running} label="Running" />
        <div aria-hidden style={{ borderLeft: rule }} />
        <Big value={group.rows.length} label="Threads" />
        <div aria-hidden style={{ borderLeft: rule }} />
        <Big value={model.stallCount} label="Stalls" />
      </section>
      {model.stallCount === null && <p style={{ ...muted, margin: "2px 0", fontSize: 12 }}>Stalls: {model.stallDetail}</p>}

      {spec && (status?.status === "ready" ? (
        <dl style={{ margin: "8px 0", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8 }}>
          <dt style={muted}>Now:</dt><dd style={{ margin: 0 }}>{status.now}</dd>
          <dt style={muted}>Next:</dt><dd style={{ margin: 0 }}>{status.next}</dd>
          <dt style={muted}>When:</dt><dd style={{ margin: 0 }}>{status.when}</dd>
        </dl>
      ) : (
        <p style={{ ...muted, margin: "8px 0" }}>Status unavailable · When: Not estimated</p>
      ))}
      {row && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div role="progressbar" aria-label={`${row.title}: ${row.merged}${row.complete ? "" : "+"}/${row.total} tickets merged`}
            aria-valuemin={0} aria-valuemax={row.total} aria-valuenow={row.merged}
            style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--muted, #3a3a3d)", overflow: "hidden" }}>
            <div style={{ width: `${row.total > 0 ? Math.min(1, row.merged / row.total) * 100 : 0}%`, height: "100%", background: LIME }} />
          </div>
          <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{row.merged}{row.complete ? "" : "+"}/{row.total} tickets merged</span>
        </div>
      )}
      {spec && row && <UrlButton url={row.url} label={`Spec ${short(spec)}`} open={actions.openUrl} style={linkStyle} />}

      <div className="wizdeck-fleet-tools" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
        <label style={{ flex: "1 1 220px", display: "flex" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Search the fleet</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads, branches, #refs"
            style={{ ...tapTarget, flex: 1, justifyContent: "flex-start", padding: "0 10px", cursor: "text", background: "var(--background)" }} />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Sort the fleet</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as FleetSortV1)} style={{ ...tapTarget, padding: "0 10px", background: "var(--background)" }}>
            <option value="plan">Sort: Plan order</option>
            <option value="running">Sort: Running first</option>
            <option value="title">Sort: Title</option>
          </select>
        </label>
      </div>

      <SectionHeading id="wizdeck-fleet-rows">{spec === null ? `Unplaced · ${group.rows.length}` : "Fleet"}</SectionHeading>
      <p style={{ ...muted, margin: "0 0 4px", fontSize: 12 }}>{runningWords(model)}</p>
      {note && <p role="status" style={{ ...muted, margin: "0 0 4px", fontSize: 12 }}>{note}</p>}
      {rows.length === 0
        ? <p style={{ ...muted, margin: "6px 0" }}>{query.trim() ? "No thread matches this search." : "No active threads are linked here."}</p>
        : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((item) => <FleetRow key={item.id} row={item} actions={actions} selection={selection} projectKey={projectKey} />)}
          </ul>
        )}

      {spec && (
        <>
          <SectionHeading id="wizdeck-fleet-merged">{`Merged tickets · ${merged.length}${model.links.status === "read" && model.links.complete ? "" : " known"}`}</SectionHeading>
          {merged.length === 0
            ? <p style={{ ...muted, margin: "6px 0" }}>{model.links.status === "read" ? "None among the merged pull requests read." : "Unavailable until work links are read."}</p>
            : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {merged.map(({ ticket, pullRequest }) => (
                  <li key={ticket.ref} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: rule }}>
                    <UrlButton url={ticket.url} label={short(ticket.ref)} open={actions.openUrl} style={linkStyle} />
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{ticket.title}</span>
                    <UrlButton url={pullRequest.url} label={`PR ${short(pullRequest.ref)}`} open={actions.openUrl} style={{ ...linkStyle, ...muted }} />
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </div>
  );
}

/**
 * Home's Running/Merges today/Stalls row with the live values: Running is the
 * host inventory scoped to this factory's project (the sidebar's count covers
 * every project, so the two are compared only at matching scope).
 */
export function LiveHealthRow({ model, mergesToday, mergesTodayDetail }: {
  model: FleetModelV1; mergesToday: number | null; mergesTodayDetail: string | null;
}) {
  return (
    <section aria-label="Running and health" style={{ display: "flex", margin: "14px 0 4px", borderBottom: rule, paddingBottom: 10 }}>
      <Big value={model.running.count} label="Running" detail={runningWords(model)} />
      <div aria-hidden style={{ borderLeft: rule }} />
      <Big value={mergesToday} label="Merges today" detail={mergesTodayDetail ?? undefined} />
      <div aria-hidden style={{ borderLeft: rule }} />
      <Big value={model.stallCount} label="Stalls" detail={model.stallDetail} />
    </section>
  );
}
