import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { FooterCounter } from "../src/FooterCounter";
import { v4Threads } from "../src/fixtures/v4";

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

const threads = Array.from({ length: 100 }, (_, index) => {
  const n = index + 1;
  const title = `Sample thread ${n}`;
  return {
    ...v4Threads[0]!, id: `sample-${n}`, title, displayTitle: title,
    runtimeStatus: "active" as const, providerId: n % 2 ? "codex" : "claude-code",
    createdAt: index, updatedAt: index,
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
  rpc: { cardModels: () => ({ source: "none", items: [] }) } as never,
});
