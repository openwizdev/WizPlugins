// WB4-3 (openwizdev/OpenWiz#1437): the hover card on "N running"
// (specs-section.v1.md section 7). It shows exactly `wizbar stats --json`
// for the same rows: `computeStatsV4` over the sidebar rows, the specs file
// and the served model source. Colours are host theme variables only.
import { useEffect, useState } from "react";
import {
  experimental_useProviders as useProviders,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRpc,
  useSettings,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { modelLabel } from "./card-meta";
import { MatrixMark } from "./MatrixMark";
import { ProviderGlyph } from "./ProviderGlyph";
import { cardSummary, computeStatsV4, isRunning } from "./stats";
import { boundHome, readSpecsFile } from "./specs/read";
import { tokens } from "./specs/theme";
import type { specsRpcContract } from "./specs/server";
import type { t3sidebarRpcContract } from "./server";
import type { SpecsFileReadV4 } from "./fixtures/v4";
import type { CardModelsResultV3 } from "./v3-types";

const REFRESH_MS = 60_000;

/**
 * The specs file read while the card is open, on open and once a minute (the
 * server's shared refresh, specs-section.v1.md section 1), keyed to the bound
 * factory's host and root: a new binding hides the old read at once and drops
 * its late answers. A failed call is unreadable.
 */
function useSpecsRead(): SpecsFileReadV4 | null {
  const rpc = useRpc<typeof specsRpcContract>();
  const home = boundHome(useSettings().values?.wizdeckFactories);
  const key = home ? JSON.stringify([home.hostId, home.rootPath]) : null;
  const [read, setRead] = useState<{ key: string; read: SpecsFileReadV4 } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const load = () => rpc.call("specsFile", {}).then(
      (result) => { if (live) setRead({ key, read: result }); },
      () => { if (live) setRead({ key, read: { kind: "unreadable" } }); },
    );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [key, rpc]);
  return read && read.key === key ? read.read : null;
}

/** Model and effort for the running threads, from the `cardModels` RPC; null until every batch answers. */
function useModels(threadIds: readonly string[]): CardModelsResultV3 | null {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [served, setServed] = useState<CardModelsResultV3 | null>(null);
  const key = threadIds.join("\n");
  useEffect(() => {
    let live = true;
    setServed(null);
    if (!key) return;
    const ids = key.split("\n");
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    Promise.all(batches.map((threadIds) => rpc.call("cardModels", { threadIds }))).then((results) => {
      if (live) setServed({ source: results.every((r) => r.source === "host") ? "host" : "none", items: results.flatMap((r) => r.items) });
    }, () => undefined);
    return () => { live = false; };
  }, [rpc, key]);
  return served;
}

const quiet = { margin: 0, color: tokens.mutedText } as const;
const list = { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2, flexShrink: 0 } as const;

export function StatsPanel({ rows }: { rows: readonly PluginSidebarThread[] | null }) {
  const actions = useSidebarThreadActions();
  const providers = useProviders().providers;
  const read = useSpecsRead();
  const models = useModels(rows?.filter(isRunning).map((row) => row.id) ?? []);
  const now = Date.now();
  const specs = read ? readSpecsFile(read, now) : null;
  const stats = computeStatsV4(rows, specs?.status === "ready" ? specs.file : null, models, now,
    Intl.DateTimeFormat().resolvedOptions().timeZone);
  return (
    <section aria-label="Running threads" style={{
      display: "flex", flexDirection: "column", gap: 8, minHeight: 0, boxSizing: "border-box",
      width: 300, maxWidth: "calc(100vw - 32px)", padding: "8px 10px", borderRadius: 8, fontSize: 12, lineHeight: "18px",
      fontVariantNumeric: "tabular-nums", background: "var(--card, #222222)", color: "var(--foreground)", border: `1px solid ${tokens.border}`,
    }}>
      {stats.status !== "ready" ? <p style={quiet}>Stats unavailable</p> : (
        <>
          <p style={{ margin: 0, flexShrink: 0 }}>{cardSummary(stats)}</p>
          <ul aria-label="Harness" style={list}>
            {stats.harness.map(({ providerId, count }) => (
              <li key={providerId} data-harness={providerId} data-count={count} style={{ display: "flex", alignItems: "center", gap: 6, color: tokens.mutedText }}>
                <ProviderGlyph providerId={providerId} className="justify-start" />
                <span style={{ flex: 1 }}>{providers.find((p) => p.id === providerId)?.displayName ?? providerId}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
          <ul aria-label="Threads" style={{ ...list, flexShrink: 1, minHeight: 0, overflowY: "auto", alignContent: "start", borderTop: `1px solid ${tokens.border}`, paddingTop: 6 }}>
            {stats.threads.map((thread) => {
              const model = modelLabel(thread.model, thread.effort);
              return (
                <li key={thread.id} data-thread={thread.id}>
                  <button type="button" className="bg-transparent hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset"
                    style={{ appearance: "none", margin: 0, border: 0, color: "inherit", font: "inherit", textAlign: "left", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 6, alignItems: "center", padding: "2px 4px", borderRadius: 4, cursor: "pointer" }}
                    onClick={(event) => actions.open(thread.id, { split: event.metaKey || event.ctrlKey })}>
                    <MatrixMark state={thread.matrix} />
                    <span data-title="" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.title}</span>
                    {thread.shortName || model ? (
                      <span style={{ gridColumn: 2, display: "flex", gap: 6, fontSize: 11, color: tokens.mutedText }}>
                        {thread.shortName ? <span data-spec-name="">{thread.shortName}</span> : null}
                        {model ? <span>{model}</span> : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
