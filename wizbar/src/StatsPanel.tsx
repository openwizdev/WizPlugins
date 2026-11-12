// WZ20 (#41): the footer bolt's disclosure panel (target picture C). It shows
// the stats computation over the observable sidebar rows; the host draws it
// above the footer row and owns opening and closing.
import type { ExperimentalSidebarFooterDisclosureProps } from "@get-bb/plugin-sdk/app";
import { useObservableRows } from "./FooterCounter";
import { computeStats, disclosureText, finishedTodayText } from "./stats";

const line = { margin: 0 } as const;

export function StatsPanel(_: ExperimentalSidebarFooterDisclosureProps) {
  const { rows } = useObservableRows();
  const stats = computeStats(rows, Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  return (
    <section
      aria-label="WizBar stats"
      style={{ display: "grid", gap: 4, padding: "10px 12px", fontSize: 13, lineHeight: "18px",
        fontVariantNumeric: "tabular-nums", color: "var(--foreground)" }}
    >
      {stats.status === "ready" ? (
        <>
          <p style={line}>{`${stats.running.total} running · ${stats.running.topLevel} top-level, ${stats.running.children} children`}</p>
          <p style={line}>{`${stats.running.cloud} cloud, ${stats.running.local} local, ${stats.running.unknown} unknown`}</p>
          <p style={{ ...line, color: "var(--muted-foreground)" }}>{disclosureText}</p>
          <hr style={{ margin: "4px 0", border: 0, borderTop: "1px solid var(--border)" }} />
          <p style={line}>{`Waiting on you: ${stats.waitingOnYou}`}</p>
          <p style={line}>{finishedTodayText(stats)}</p>
        </>
      ) : (
        <>
          <p style={line}>Stats unavailable</p>
          <p style={{ ...line, color: "var(--muted-foreground)" }}>{disclosureText}</p>
        </>
      )}
    </section>
  );
}
