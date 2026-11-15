// WizDeck Home's sections (D1, #73), in the confirmed Ledger style: dark host
// surface, compact rows, thin separators, lime only on progress. Read-only:
// there are no send controls. Unavailable is always words, never zero.
import type { CSSProperties, ReactNode } from "react";
import type { NeedsYouViewV1 } from "../../factory-contract";
import type { SpecRowV1 } from "../data/board";
import type { HomeVersionV1, HomeViewV1 } from "../data/home";

export const LIME = "var(--wizdeck-lime, #c6f432)";
const muted: CSSProperties = { color: "var(--muted-foreground)" };
const rule = "1px solid var(--border)";

/** Every interactive element: at least 44 px tall, for touch. */
export const tapTarget: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: rule, borderRadius: 8, background: "transparent", color: "var(--foreground)", font: "inherit", cursor: "pointer",
};
const linkButton: CSSProperties = {
  minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 2px", border: 0, background: "transparent",
  color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 3, font: "inherit", cursor: "pointer",
};

export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 6px", fontSize: 15, fontWeight: 600 }}>
      <span style={{ whiteSpace: "nowrap" }}>{children}</span>
      <span aria-hidden style={{ flex: 1, borderTop: rule }} />
    </h3>
  );
}

export function UrlButton({ url, label, open, style }: { url: string; label: string; open: (url: string) => void; style?: CSSProperties }) {
  return <button type="button" style={style ?? linkButton} onClick={() => open(url)}>{label}</button>;
}

// ---- Needs you -------------------------------------------------------------

export function NeedsYou({ needsYou, open, focusedItemId }: {
  needsYou: HomeViewV1["needsYou"]; open: (url: string) => void; focusedItemId: string | null;
}) {
  const view: NeedsYouViewV1 | null = needsYou.view;
  const title = needsYou.freshness === "loading" ? "Needs you"
    : !view || view.state === "unavailable" ? "Needs you · unavailable"
    : view.count === null ? `Needs you · ${view.items.length} known` : `Needs you · ${view.count}`;
  return (
    <section aria-labelledby="wizdeck-needs-you" data-freshness={needsYou.freshness}>
      <SectionHeading id="wizdeck-needs-you">{title}</SectionHeading>
      {needsYou.freshness === "loading" && <p style={{ ...muted, margin: "6px 0" }}>Reading the Needs-you file…</p>}
      {view?.state === "unavailable" && (
        <div role="status" style={{ margin: "6px 0" }}>
          <p style={{ margin: 0 }}>{needsYou.detail ?? "The Needs-you file is unavailable."}</p>
          <p style={{ ...muted, margin: "2px 0 0" }}>This is not an empty list: nothing can be answered until the file can be read.</p>
        </div>
      )}
      {view?.state === "ready" && view.items.length === 0 && view.complete && (
        <p style={{ ...muted, margin: "6px 0" }}>Nothing needs you right now.</p>
      )}
      {view?.state === "ready" && !view.complete && (
        <p role="status" style={{ ...muted, margin: "6px 0" }}>Incomplete: {view.gaps.join(" ")}</p>
      )}
      {view?.state === "ready" && view.items.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {view.items.map((item) => {
            const source = needsYou.sources[item.id];
            return (
              <li key={item.id} id={`wizdeck-need-${item.id}`} tabIndex={-1} data-focused={focusedItemId === item.id || undefined}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: rule,
                  outline: focusedItemId === item.id ? `1px solid ${LIME}` : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.code} · {item.question}</p>
                  <p style={{ ...muted, margin: "2px 0 0" }}>
                    Options: {item.options.map((option) => option.id === item.recommendedOptionId ? `${option.label} (rec)` : option.label).join(" · ")}
                  </p>
                  {item.risk !== "ordinary" && <p style={{ ...muted, margin: "2px 0 0" }}>Gated: {item.risk}</p>}
                </div>
                {source && <UrlButton url={source} label="Open" open={open} style={tapTarget} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- Running and health ----------------------------------------------------

function BigNumber({ value, label, detail }: { value: number | null; label: string; detail: string | null }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "4px 12px" }} title={detail ?? undefined}>
      <div style={{ fontSize: 28, lineHeight: "34px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        aria-label={value === null ? `${label}: unavailable` : `${label}: ${value}`}>
        {value === null ? "—" : value}
      </div>
      <div style={muted}>{value === null ? `${label} · unavailable` : label}</div>
    </div>
  );
}

export function HealthRow({ health }: { health: HomeViewV1["health"] }) {
  return (
    <section aria-label="Running and health" style={{ display: "flex", margin: "14px 0 4px", borderBottom: rule, paddingBottom: 10 }}>
      <BigNumber value={health.running} label="Running" detail={health.runningDetail} />
      <div aria-hidden style={{ borderLeft: rule }} />
      <BigNumber value={health.mergesToday} label="Merges today" detail={health.mergesTodayDetail} />
      <div aria-hidden style={{ borderLeft: rule }} />
      <BigNumber value={health.stalls} label="Stalls" detail={health.stallsDetail} />
    </section>
  );
}

// ---- Versions and specs ----------------------------------------------------

function Progress({ spec }: { spec: SpecRowV1 }) {
  const ratio = spec.total > 0 ? Math.min(1, spec.merged / spec.total) : 0;
  const label = `${spec.merged}${spec.complete ? "" : "+"}/${spec.total}`;
  return (
    <div className="wizdeck-progress" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div role="progressbar" aria-label={`${spec.title}: ${label} tickets merged`} aria-valuemin={0} aria-valuemax={spec.total}
        aria-valuenow={spec.merged} style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--muted, #3a3a3d)", overflow: "hidden" }}>
        <div style={{ width: `${ratio * 100}%`, height: "100%", background: LIME }} />
      </div>
      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function issueNumber(ref: string) {
  return `#${ref.split("#")[1]}`;
}

function SpecRow({ spec, open, multiRepo }: { spec: SpecRowV1; open: (url: string) => void; multiRepo: boolean }) {
  const status = spec.status;
  return (
    <li className="wizdeck-spec" data-spec={spec.ref} style={{ borderLeft: rule, padding: "8px 0 8px 12px", borderBottom: rule }}>
      <div className="wizdeck-spec-title">
        <p style={{ margin: 0, fontWeight: 600 }}>{spec.title}{spec.state === "closed" ? " · done" : ""}</p>
        <p style={{ ...muted, margin: 0, fontSize: 12 }}>{multiRepo ? spec.ref : issueNumber(spec.ref)}</p>
      </div>
      <div className="wizdeck-spec-body">
        {status.status === "ready" ? (
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8 }}>
            <dt style={muted}>Now:</dt><dd style={{ margin: 0 }}>{status.now}</dd>
            <dt style={muted}>Next:</dt><dd style={{ margin: 0 }}>{status.next}</dd>
            <dt style={muted}>When:</dt><dd style={{ margin: 0 }}>{status.when}</dd>
          </dl>
        ) : (
          <p style={{ ...muted, margin: 0 }}>Status {status.reason === "ambiguous" ? "ambiguous" : "unavailable"} · When: {status.when}</p>
        )}
        <Progress spec={spec} />
        {!spec.complete && <span style={{ ...muted, justifySelf: "start", fontSize: 12, border: rule, borderRadius: 4, padding: "0 6px" }}>partial · not every ticket was read</span>}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 8px" }}>
          <UrlButton url={spec.url} label={issueNumber(spec.ref)} open={open} />
          {spec.pullRequests.map((pr) => <UrlButton key={pr.ref} url={pr.url} label={`PR ${issueNumber(pr.ref)}`} open={open} />)}
          <span style={{ flex: 1 }} />
          <UrlButton url={spec.url} label="Open" open={open} style={tapTarget} />
        </div>
      </div>
    </li>
  );
}

function versionSummary(version: HomeVersionV1) {
  const merged = version.specs.reduce((sum, spec) => sum + spec.merged, 0);
  const total = version.specs.reduce((sum, spec) => sum + spec.total, 0);
  const complete = version.complete && version.specs.every((spec) => spec.complete);
  return `${merged}${complete ? "" : "+"}/${total} tickets merged`;
}

export function Versions({ board, open }: { board: HomeViewV1["board"]; open: (url: string) => void }) {
  const repositories = new Set(board.versions.map((version) => version.repository));
  const multiRepo = repositories.size > 1;
  return (
    <section aria-labelledby="wizdeck-versions" data-freshness={board.freshness}>
      <SectionHeading id="wizdeck-versions">Versions</SectionHeading>
      {board.freshness === "loading" && <p style={{ ...muted, margin: "6px 0" }}>Reading GitHub…</p>}
      {(board.freshness === "unavailable" || board.freshness === "stale") && (
        <p role="status" style={{ margin: "6px 0" }}>
          {board.freshness === "stale" ? "Stale: " : "Unavailable: "}{board.detail ?? "GitHub could not be read."}
        </p>
      )}
      {board.freshness !== "loading" && board.versions.length === 0 && board.freshness !== "unavailable" && (
        <p style={{ ...muted, margin: "6px 0" }}>No open versions with specs.</p>
      )}
      {board.versions.map((version) => (
        <div key={`${version.repository}/${version.number}`} style={{ marginBottom: 8 }}>
          <h4 style={{ margin: "10px 0 4px", fontSize: 14, fontWeight: 600 }}>
            {version.title} · {versionSummary(version)}{multiRepo ? <span style={muted}> · {version.repository}</span> : null}
          </h4>
          {!version.complete && (
            <p role="status" style={{ ...muted, margin: "0 0 4px" }}>Partial: not every issue in this version was read, so some specs may be missing.</p>
          )}
          {version.specs.length === 0 ? <p style={{ ...muted, margin: 0 }}>{version.complete ? "No specs yet." : "No specs among the issues read so far."}</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {version.specs.map((spec) => <SpecRow key={spec.ref} spec={spec} open={open} multiRepo={multiRepo} />)}
            </ul>
          )}
        </div>
      ))}
      {board.gaps.length > 0 && (
        <details style={{ ...muted, margin: "6px 0" }}>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{board.gaps.length} gap{board.gaps.length === 1 ? "" : "s"} in this read</summary>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{board.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

/** Responsive layout: side-by-side spec rows in a wide panel, stacked on a phone. */
export const homeCss = `
.wizdeck-home { container-type: inline-size; }
.wizdeck-spec { display: grid; gap: 6px; }
.wizdeck-spec-body { display: grid; gap: 6px; }
@container (min-width: 440px) {
  .wizdeck-spec { grid-template-columns: minmax(120px, 30%) 1fr; column-gap: 16px; }
}
`;
