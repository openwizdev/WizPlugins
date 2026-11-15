// The panel's only data hook (D1, #73). It renews a lease on the backend's
// shared cache and re-reads on its realtime signal. It never reads GitHub or
// the host itself, and it makes no write of any kind.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { deckRpcContract, DeckWatchResultV1 } from "../data/server";
import { DECK_CHANNEL } from "../data/protocol";

/** Lease renewal: well inside the backend's 90-second lease. Not a GitHub read. */
export const HEARTBEAT_MS = 30_000;

let clients = 0;
const newClientId = () =>
  `panel-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${++clients}`}`;

export interface DeckHomeState {
  result: DeckWatchResultV1 | null;
  /** The factory the person picked, or null for the default. */
  selected: string | null;
  select(projectKey: string): void;
  refresh(): void;
  error: string | null;
}

export function useDeckHome(currentProjectId: string | null): DeckHomeState {
  const rpc = useRpc<typeof deckRpcContract>();
  const [clientId] = useState(newClientId);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<DeckWatchResultV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const input = useCallback(() => ({
    clientId, projectKey: selectedRef.current, currentProjectId,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }), [clientId, currentProjectId]);

  // Only the newest request may write, so a slow answer for the previous
  // factory can never paint its rows under the new one.
  const apply = useCallback(async (method: "deckWatch" | "deckRefresh") => {
    const mine = ++seq.current;
    try {
      const next = await rpc.call(method, input());
      if (mine !== seq.current) return;
      setResult(next);
      setError(null);
    } catch (caught) {
      if (mine !== seq.current) return;
      setError(caught instanceof Error ? caught.message : "WizDeck could not reach its backend.");
    }
  }, [rpc, input]);

  useEffect(() => {
    void apply("deckWatch");
    const timer = setInterval(() => { void apply("deckWatch"); }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [apply, selected]);

  useEffect(() => () => { void rpc.call("deckRelease", { clientId }).catch(() => undefined); }, [rpc, clientId]);

  useRealtime(DECK_CHANNEL, () => { void apply("deckWatch"); });

  const select = useCallback((projectKey: string) => {
    seq.current += 1; // Drop any answer still in flight for the previous factory.
    selectedRef.current = projectKey;
    setResult((previous) => previous && { ...previous, projectKey, view: null });
    setSelected(projectKey);
  }, []);

  return { result, selected, select, refresh: () => { void apply("deckRefresh"); }, error };
}
