import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { FooterCounter } from "../src/FooterCounter";
import { ThreadCard } from "../src/ThreadCard";
import { SpecsSection } from "../src/specs/SpecsSection";
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

const params = new URLSearchParams(location.search);
const largeSummary = params.has("large-summary");
const narrowFooter = params.has("narrow-footer");
const denseCard = params.has("dense-card");
const narrowSpec = params.get("narrow-spec");

if (narrowSpec) {
  // One spec row short of space: a long name, a ticket due now and one done in the last hour.
  const base = v4SpecsFile.specs[0]!;
  const [first, second] = [base.tickets[0]!, base.tickets[1] ?? base.tickets[0]!];
  const file = {
    ...v4SpecsFile, generatedAt: new Date(now - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    specs: [{
      ...base, shortName: "A long sample spec name for narrow rows",
      tickets: [
        { ...first, state: "needs-you" as const, closedAt: null },
        { ...second, ticket: `${base.spec.split("#")[0]}#${Number(second.ticket.split("#")[1]) + 1000}` as typeof second.ticket,
          state: "done" as const, closedAt: new Date(now - 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z") },
      ],
    }],
  };
  renderSlot({ component: () => (
    <aside style={{ width: `${Number(narrowSpec)}px` }} className="flex min-h-0 flex-col bg-sidebar text-foreground">
      <SpecsSection threads={[]} now={now} activeThreadId={null} onNavigate={() => {}}
        collapsed={false} onToggleCollapsed={() => {}} collapseFailed={false} />
    </aside>
  ) }, {}, {
    pluginId: "narrow-spec-browser", settings: { wizdeckFactories: binding },
    rpc: { specsFile: () => ({ kind: "content", text: JSON.stringify(file) }) } as never,
  });
} else if (denseCard) {
  const parent = {
    ...v4Threads[0]!,
    id: "dense-parent",
    title: "Dense card with every detail chip at 300 px",
    displayTitle: "Dense card with every detail chip at 300 px",
    providerId: "claude-code",
    activity: { workflows: 2, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 },
    environment: {
      id: "env_dense",
      name: "Synthetic workspace",
      branchName: "room/1042-refine-command-palette-a1b2",
      path: null,
      isWorktree: true,
      providerId: "git-worktree",
      workspaceDisplayKind: "other" as const,
    },
    updatedAt: now - 7 * 60 * 1000,
  };
  const children = Array.from({ length: 12 }, (_, index) => ({
    ...v4Threads[0]!,
    id: `dense-child-${index + 1}`,
    title: `Child ${index + 1}`,
    displayTitle: `Child ${index + 1}`,
    parentThreadId: parent.id,
  }));
  renderSlot({ component: () => (
    <aside className="flex h-screen min-h-0 flex-col bg-sidebar text-foreground">
      <ul className="px-1.5 py-2">
        <ThreadCard
          thread={parent}
          projectName="Orchard Workspace"
          isActive={false}
          canPark={true}
          onNavigate={() => {}}
          onSettle={() => {}}
          onSnooze={() => {}}
          now={now}
        />
      </ul>
    </aside>
  ) }, {}, {
    pluginId: "dense-card-browser",
    sidebarThreads: { status: "ready", threads: [parent, ...children] },
    sidebarPullRequests: {
      [parent.id]: {
        experimental_autoMerge: false,
        experimental_inMergeQueue: null,
        experimental_checks: { state: "passing" },
        experimental_review: { state: "none" },
        experimental_mergeability: { state: "mergeable" },
        number: 1088,
        title: "Refine command palette",
        url: "https://github.com/example/sample-repo/pull/1088",
        state: "open",
        attention: "none",
      },
    },
    rpc: {
      cardModels: () => ({ source: "host", items: [{ threadId: parent.id, model: "Opus 5.5", effort: "medium" }] }),
    } as never,
  });
} else if (narrowFooter) {
  const stamp = new Date(now - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const repo = "example/sample-plans";
  const running = Array.from({ length: 125 }, (_, index) => ({
    ...v4Threads[0]!,
    id: `narrow-run-${index + 1}`,
    title: `Running ${index + 1}`,
    displayTitle: `Running ${index + 1}`,
    runtimeStatus: "active" as const,
    hasPendingInteraction: false,
    updatedAt: now,
  }));
  const waiting = Array.from({ length: 120 }, (_, index) => ({
    ...v4Threads[0]!,
    id: `narrow-wait-${index + 1}`,
    title: `Waiting ${index + 1}`,
    displayTitle: `Waiting ${index + 1}`,
    runtimeStatus: "idle" as const,
    hasPendingInteraction: true,
    updatedAt: now,
  }));
  const agents = Array.from({ length: 105 }, (_, index) => ({
    repository: repo,
    ticket: `${repo}#${200 + index}`,
    commentId: index + 1,
    agent: "builder",
    harness: "Synthetic",
    model: "Sample",
    state: "working",
    live: true,
    step: "Building",
    updatedAt: stamp,
    time: stamp,
  }));
  renderSlot({ component: () => (
    <aside className="flex h-screen min-h-0 flex-col bg-sidebar text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto" />
      <FooterCounter className="shrink-0 border-t border-sidebar-border px-3 py-1" />
    </aside>
  ) }, {}, {
    pluginId: "narrow-footer-browser",
    sidebarThreads: { status: "ready", threads: [...running, ...waiting] },
    settings: { wizdeckFactories: binding, specsSort: "newest" },
    rpc: {
      specsFile: () => ({ kind: "content", text: JSON.stringify(specs) }),
      agentsFile: () => ({ kind: "content", text: JSON.stringify({ version: 1, generatedAt: stamp, agents }) }),
      cardModels: () => ({ source: "none", items: [] }),
    } as never,
  });
} else {
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
}
