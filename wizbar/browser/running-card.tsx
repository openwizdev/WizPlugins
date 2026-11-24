import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { FooterCounter } from "../src/FooterCounter";
import { v4SpecsFile, v4Threads } from "../src/fixtures/v4";

const [hostStyles] = Object.values(import.meta.glob(
  "../node_modules/bb-app/app/dist/assets/index-*.css", { eager: true, query: "?url", import: "default" },
));
const styles = document.createElement("link");
styles.rel = "stylesheet";
styles.href = String(hostStyles);
document.head.append(styles);
await new Promise<void>((resolve, reject) => {
  styles.onload = () => resolve();
  styles.onerror = reject;
});

const now = Date.now();
const specs = {
  ...v4SpecsFile, generatedAt: new Date(now).toISOString(),
  specs: v4SpecsFile.specs.slice(0, 2).map((spec, i) => ({ ...spec, fleetThreadId: `sample-fleet-${i}` })),
};
const binding = JSON.stringify([{
  projectKey: "sample-factory", cloudroomProjectId: "sample-project", repositories: ["example/sample-plans"],
  home: { hostId: "sample-host", rootPath: "/synthetic/sample" },
  orchestratorThreadId: "sample-orchestrator", statusWriterLogin: "sample-user",
}]);

const largeSummary = new URLSearchParams(location.search).has("large-summary");
const total = largeSummary ? 480 : 100;
const threads = Array.from({ length: total }, (_, index) => {
  const n = index + 1;
  const title = `Sample thread ${n}`;
  const local = !largeSummary || n <= 120;
  return {
    ...v4Threads[local ? 0 : 1]!, id: `sample-${n}`, title, displayTitle: title,
    runtimeStatus: largeSummary && n > 240 && n <= 360 ? "starting" as const : "active" as const,
    hasPendingInteraction: largeSummary && n > 360,
    providerId: n % 2 ? "codex" : "claude-code",
    parentThreadId: n <= 60 ? "sample-fleet-0" : n <= 90 ? "sample-fleet-1" : null,
    createdAt: now - total + index, updatedAt: now,
  };
});

renderSlot({ component: () => (
  <aside className="flex h-screen min-h-0 flex-col bg-sidebar text-foreground">
    <div className="min-h-0 flex-1 overflow-y-auto" />
    <FooterCounter className="shrink-0 border-t border-sidebar-border px-3 py-1" />
  </aside>
) }, {}, {
  pluginId: "running-card-browser",
  sidebarThreads: { status: "ready", threads },
  settings: { wizdeckFactories: binding, specsSort: "newest" },
  rpc: {
    specsFile: () => ({ kind: "content", text: JSON.stringify(specs) }),
    cardModels: () => ({ source: "none", items: [] }),
  } as never,
});
