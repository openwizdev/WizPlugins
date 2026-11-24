import { useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { MatrixMark } from "../MatrixMark";
import type { CloudAgents } from "./cloud";

export function CloudAgentRows({ result }: { result: Extract<CloudAgents, { status: "ready" }> }) {
  const navigate = useBbNavigate();
  const [showMore, setShowMore] = useState(false);
  return (
    <>
      {result.rows.map(({ label, shortLabel, model, status, detail, matrix, pull, url }) => {
        const inlineStatus = !pull && shortLabel.length + model.length + status.length <= 42;
        return (
          <li key={`${label}:${url}`}>
            <button type="button" onClick={() => navigate.openUrl(url)}
              title={`${label} — ${detail}${pull ? ` · ${pull}` : ""}`}
              aria-label={`${label}, ${detail}${pull ? `, ${pull}` : ""}, on GitHub, opens in browser`}
              className="group flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-left text-xs hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset">
              <span aria-hidden="true" className="shrink-0"><MatrixMark state={matrix} /></span>
              <span className="min-w-0 shrink-0 truncate text-foreground">{shortLabel}</span>
              <span className="ml-auto flex min-w-0 items-center gap-2 pl-1.5 text-[11px] tabular-nums text-muted-foreground">
                {inlineStatus ? (
                  <span className="truncate">{model} · {status}</span>
                ) : (
                  <>
                    <span className="truncate group-hover:hidden group-focus-visible:hidden">{model}</span>
                    <span className="hidden truncate group-hover:inline group-focus-visible:inline">{status}</span>
                  </>
                )}
                {pull ? <span className="shrink-0">{pull}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
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
