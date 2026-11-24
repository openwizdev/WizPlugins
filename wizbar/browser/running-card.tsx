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

const threads = Array.from({ length: 100 }, (_, index) => {
  const n = index + 1;
  const title = `Sample thread ${n}`;
  return {
    ...v4Threads[0]!, id: `sample-${n}`, title, displayTitle: title,
    runtimeStatus: "active" as const, providerId: n % 2 ? "codex" : "claude-code",
    parentThreadId: n <= 60 ? "sample-fleet-0" : n <= 90 ? "sample-fleet-1" : null,
    createdAt: now - 100 + index, updatedAt: now,
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
