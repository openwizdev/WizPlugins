import { useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { MatrixMark } from "../MatrixMark";
import type { CloudAgents, CloudRow } from "./cloud";

function CloudAgentRow({ row: { label, model, age, detail, matrix, pull, url } }: { row: CloudRow }) {
  const navigate = useBbNavigate();
  return (
    <li className="list-none">
      <button type="button" onClick={() => navigate.openUrl(url)}
        aria-label={`${label}, ${detail}${pull ? `, ${pull}` : ""}, on GitHub, opens in browser`}
        className="group/cloud block w-full min-w-0 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset">
        <span className="flex h-5 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label}>{label}</span>
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
            <MatrixMark state={matrix} />
            <span className="min-w-6 text-right tabular-nums text-2xs text-muted-foreground">{age}</span>
          </span>
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs text-muted-foreground">
          <span className="min-w-0 truncate" title={model}>{model}</span>
          {pull ? (
            <span className="shrink-0 underline decoration-muted-foreground/40 underline-offset-2 group-hover/cloud:text-foreground">
              {pull}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function CloudAgentRows({ result }: { result: Extract<CloudAgents, { status: "ready" }> }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const [showMore, setShowMore] = useState(false);
  return (
    <>
      {result.rows.map((row) => <CloudAgentRow key={`${row.label}:${row.url}`} row={row} />)}
      {result.earlier.length > 0 ? (
        <li className="text-xs">
          <button type="button" aria-expanded={showEarlier} onClick={() => setShowEarlier((open) => !open)}
            className="rounded px-2.5 py-1 text-left text-muted-foreground hover:text-foreground focus-visible:ring-1">
            {result.earlier.length} earlier
          </button>
          {showEarlier ? <ul className="flex flex-col gap-px">
            {result.earlier.map((row) => <CloudAgentRow key={`${row.label}:${row.url}`} row={row} />)}
          </ul> : null}
        </li>
      ) : null}
      {result.more.length > 0 ? (
        <li className="px-2.5 py-1 text-xs text-muted-foreground">
          <button type="button" aria-expanded={showMore} onClick={() => setShowMore((open) => !open)}
            className="rounded text-left hover:text-foreground focus-visible:ring-1">
              {result.more.length} more in the run map with no recent note
          </button>
          {showMore ? <ul className="pl-3 pt-1">
              {result.more.map(({ label }) => <li key={label} className="truncate" title={label}>{label}</li>)}
          </ul> : null}
        </li>
      ) : null}
    </>
  );
}
