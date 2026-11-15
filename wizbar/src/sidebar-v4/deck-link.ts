// B1 (#76): what WizBar reads from WizDeck, through D1's declared interfaces
// only: the `deckWatch`/`deckRelease` lease on the shared backend cache (no
// GitHub or host read of WizBar's own) and the shared selection store.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { SelectionV1 } from "../factory-contract";
import type { deckRpcContract, DeckWatchResultV1 } from "../deck/data/server";
import { DECK_CHANNEL } from "../deck/data/protocol";
import { HEARTBEAT_MS } from "../deck/home/useDeckHome";
import { parseIssueNumber } from "../card-meta";

let clients = 0;
const newClientId = () =>
  `sidebar-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${++clients}`}`;

/**
 * One lease for the whole sidebar, renewed while the page is visible. The deck
 * picks the factory exactly as WizDeck Home does (its default for the current
 * project), so a Needs-you focus names the factory the deck opens on.
 * Null until the deck answers, and on any failure: nothing is guessed.
 */
export function useSidebarDeck(currentProjectId: string | null): DeckWatchResultV1 | null {
  const rpc = useRpc<typeof deckRpcContract>();
  const [clientId] = useState(newClientId);
  const [result, setResult] = useState<DeckWatchResultV1 | null>(null);
  const seq = useRef(0);
  const watch = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const mine = ++seq.current;
    try {
      const next = await rpc.call("deckWatch", {
        clientId, projectKey: null, currentProjectId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (mine === seq.current) setResult(next);
    } catch {
      if (mine === seq.current) setResult(null);
    }
  }, [rpc, clientId, currentProjectId]);
  useEffect(() => {
    void watch();
    const timer = setInterval(() => { void watch(); }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [watch]);
  useEffect(() => () => { void rpc.call("deckRelease", { clientId }).catch(() => undefined); }, [rpc, clientId]);
  useRealtime(DECK_CHANNEL, () => { void watch(); });
  return result;
}

export const SidebarDeckContext = createContext<DeckWatchResultV1 | null>(null);
export const useSidebarDeckResult = () => useContext(SidebarDeckContext);

/** `owner/name#N` for a GitHub pull request URL; anything else is null. */
export function pullRequestRef(url: string | null | undefined): string | null {
  const match = url ? /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)$/.exec(url) : null;
  return match ? `${match[1]}/${match[2]}#${match[3]}` : null;
}

/** The factory a Cloudroom project belongs to, if one is configured. */
export function factoryFor(deck: DeckWatchResultV1 | null, projectId: string): string | null {
  return deck?.projects.find((project) => project.cloudroomProjectId === projectId)?.projectKey ?? null;
}

/**
 * Whether a sidebar thread is linked to the shared selection. A thread
 * selection matches its id. A spec selection matches only by verified work
 * links, never by title: the thread's pull request is one of the spec's
 * verified merged pull requests, or the thread's branch issue, in its pull
 * request's repository, is the spec itself. Membership the deck has not
 * verified is not guessed (F1 owns the fleet's full placement).
 */
export function isLinked(selection: SelectionV1, deck: DeckWatchResultV1 | null, thread: {
  id: string; branch: string | null; pullRequestUrl: string | null;
}): boolean {
  if (selection.kind === "thread") return selection.threadId === thread.id;
  if (selection.kind !== "spec" || !deck?.view || deck.projectKey !== selection.projectKey) return false;
  const spec = deck.view.board.versions.flatMap((version) => version.specs).find((row) => row.ref === selection.spec);
  if (!spec) return false;
  const ref = pullRequestRef(thread.pullRequestUrl);
  if (ref === null) return false;
  if (spec.pullRequests.some((pr) => pr.ref === ref)) return true;
  const issue = parseIssueNumber(thread.branch);
  return issue !== null && `${ref.slice(0, ref.indexOf("#"))}#${issue}` === spec.ref;
}
