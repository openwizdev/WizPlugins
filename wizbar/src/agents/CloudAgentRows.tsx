import { useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { MatrixMark } from "../MatrixMark";
import type { CloudAgents, CloudRow } from "./cloud";

function CloudAgentRow({ row: { label, detail, matrix, pull, url } }: { row: CloudRow }) {
  const navigate = useBbNavigate();
  return (
    <li>
      <button type="button" onClick={() => navigate.openUrl(url)}
        aria-label={`${label}, ${detail}${pull ? `, ${pull}` : ""}, on GitHub, opens in browser`}
        className="flex w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-1 text-left text-xs hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset">
        <span aria-hidden="true" className="mt-0.5 shrink-0"><MatrixMark state={matrix} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate" title={label}>{label}</span>
          <span className="block truncate text-muted-foreground" title={detail}>{detail}</span>
        </span>
        {pull ? <span className="shrink-0 text-muted-foreground">{pull}</span> : null}
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
