// WizDeck Home shell (D1, #73). Shared file: this shell is D1's. D2 adds its
// action insertion and F1 its live/fleet insertion at the marked slots only.
import { useEffect, useState } from "react";
import { useBbContext, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { FocusRequestV1 } from "../../factory-contract";
import { useDeckHome } from "./useDeckHome";
import { HealthRow, NeedsYou, Versions, homeCss, tapTarget } from "./sections";
// F1 (#75) live/fleet insertion.
import type { SpecRefV1 } from "../../factory-contract";
import { useSelection } from "../selection/selection";
import { useLiveFleet } from "../live/useLiveFleet";
import { FleetSection, LiveHealthRow, SpecFleet, type FleetActions } from "../fleet/FleetViews";

const INTRO_KEY = "wizdeck.intro.v1";

function useIntro(): [boolean, () => void] {
  const [seen, setSeen] = useState(() => {
    try { return globalThis.localStorage?.getItem(INTRO_KEY) === "seen"; } catch { return false; }
  });
  return [!seen, () => {
    try { globalThis.localStorage?.setItem(INTRO_KEY, "seen"); } catch { /* Shown again next time; harmless. */ }
    setSeen(true);
  }];
}

function ago(at: number | null, now: number): string {
  if (at === null) return "not yet";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)} min ago`;
}

export function Home({ focus }: { focus: FocusRequestV1 | null }) {
  const context = useBbContext();
  const navigate = useBbNavigate();
  // The default is the current project's factory; the selected thread never chooses the target.
  const deck = useDeckHome(context.projectId);
  const [showIntro, dismissIntro] = useIntro();
  const result = deck.result;
  const projectKey = deck.selected ?? result?.projectKey ?? null;
  // A view is shown only for the factory it was built for: switching never leaks rows.
  const view = result?.view && result.view.projectKey === projectKey ? result.view : null;
  const open = (url: string) => { navigate.openUrl(url); };
  const focusedItemId = focus && focus.projectKey === projectKey ? focus.itemId : null;
  const now = Date.now();
  // F1 (#75): the live fleet, scoped to the shown factory's Cloudroom project.
  // Work links reach the panel only once the backend leases them (pending).
  const scopeProjectId = result?.projects.find((project) => project.projectKey === projectKey)?.cloudroomProjectId ?? null;
  const fleet = useLiveFleet(view ? scopeProjectId : null, undefined, now);
  const selection = useSelection();
  const [fleetPage, setFleetPage] = useState<{ projectKey: string; spec: SpecRefV1 | null } | null>(null);
  const fleetActions: FleetActions = { openUrl: open, openThread: (threadId) => navigate.toThread(threadId) };

  // F1 (#75): an explicit Needs-you focus leaves a fleet page for Home, where the item is.
  // PLANTED BUG (red run): an explicit focus leaves the fleet page in place.
  useEffect(() => { if (focusedItemId) void 0; }, [focusedItemId]);

  useEffect(() => {
    if (!focusedItemId || !view) return;
    document.getElementById(`wizdeck-need-${focusedItemId}`)?.focus();
  }, [focusedItemId, view !== null]);

  return (
    <div className="wizdeck-home" style={{ padding: "4px 16px 16px", fontSize: 14, lineHeight: "20px", color: "var(--foreground)" }}>
      <style>{homeCss}</style>
      <header style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ margin: "8px 0", fontSize: 24, fontWeight: 600 }}>Home</h2>
        {result && result.projects.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Factory</span>
            <select value={projectKey ?? ""} onChange={(event) => deck.select(event.target.value)}
              style={{ ...tapTarget, padding: "0 10px", background: "var(--background)" }}>
              {result.projects.map((project) => <option key={project.projectKey} value={project.projectKey}>{project.projectKey}</option>)}
            </select>
          </label>
        )}
      </header>

      {showIntro && (
        <div role="note" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-foreground)", flexWrap: "wrap" }}>
          <p style={{ margin: 0, flex: 1, minWidth: 200 }}>
            WizDeck reads your factory's GitHub plan and its Needs-you file. Read-only in this version: it sends nothing and changes nothing.
          </p>
          <button type="button" style={tapTarget} onClick={dismissIntro}>Got it</button>
        </div>
      )}

      {deck.error && <p role="alert" style={{ margin: "8px 0" }}>WizDeck could not reach its backend: {deck.error}</p>}
      {result?.setup && (
        <div role="status" style={{ margin: "12px 0" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Set up a factory first</p>
          <p style={{ margin: "4px 0 0", color: "var(--muted-foreground)" }}>
            {result.setup} Add it under this plugin's settings, "WizDeck factories": the Cloudroom project, its repositories,
            its home checkout's host and root, its orchestrator and its status writer. Nothing is guessed from the open thread.
          </p>
        </div>
      )}
      {!result && !deck.error && <p style={{ color: "var(--muted-foreground)" }}>Loading…</p>}

      {view && fleet && projectKey && fleetPage?.projectKey === projectKey && (
        <SpecFleet model={fleet} spec={fleetPage.spec} board={view.board} actions={fleetActions} selection={selection}
          projectKey={projectKey} onBack={() => setFleetPage(null)} />
      )}
      {view && !(fleet && fleetPage?.projectKey === projectKey) && (
        <>
          <NeedsYou needsYou={view.needsYou} open={open} focusedItemId={focusedItemId} />
          {/* D2 slot: answer and Tell-the-factory actions. */}
          {fleet
            ? <LiveHealthRow model={fleet} mergesToday={view.health.mergesToday} mergesTodayDetail={view.health.mergesTodayDetail} />
            : <HealthRow health={view.health} />}
          {/* F1 slot: running agents and the live fleet tree. */}
          {fleet && projectKey && (
            <FleetSection model={fleet} board={view.board} actions={fleetActions} selection={selection} projectKey={projectKey}
              onView={(spec) => setFleetPage({ projectKey, spec })} />
          )}
          <Versions board={view.board} open={open} />
          {!view.github.authenticated && (
            <p role="status" style={{ color: "var(--muted-foreground)" }}>No GitHub token is set, so the plan cannot be read. Add a read-only token in this plugin's settings.</p>
          )}
          <footer style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 8, color: "var(--muted-foreground)" }}>
            <span>Updated {ago(view.board.fetchedAt, now)} · refreshes every 60 s</span>
            <button type="button" style={tapTarget} onClick={deck.refresh}
              disabled={view.nextRefreshAt !== null && view.nextRefreshAt > now}
              title={view.nextRefreshAt !== null && view.nextRefreshAt > now ? "Waits for the shared 60-second interval" : undefined}>
              Refresh
            </button>
          </footer>
        </>
      )}
      {result && !result.setup && !view && <p style={{ color: "var(--muted-foreground)" }}>Loading {projectKey}…</p>}
    </div>
  );
}
