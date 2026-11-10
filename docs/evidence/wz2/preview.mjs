// Synthetic browser evidence, separate from the plugin's distribution.
import { loadPluginApp, renderSlot } from "/wizbar/node_modules/@get-bb/plugin-sdk/dist/testing/app.js";

const manifestResponse = await fetch("/wizbar/package.json");
if (!manifestResponse.ok) throw new Error("Cannot read preview metadata");
const manifest = await manifestResponse.json();
const app = await loadPluginApp(() => import("/wizbar/app.tsx"));
const inbox = app.threadLists[0];
if (manifest.bb.branding.icon !== "Zap") throw new Error("Unexpected preview icon");
for (const [id, text] of Object.entries({
  name: manifest.bb.name,
  package: manifest.name,
  namespace: manifest.name.replace(/^bb-plugin-/, ""),
  title: inbox.title,
})) document.getElementById(id).textContent = text;
const rendered = renderSlot(inbox, {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: window.innerWidth < 480,
  onNavigate() {},
  searchQuery: "",
}, {
  sidebarThreads: { status: "ready", threads: [], projects: [] },
  rpc: { listLifecycle: () => ({ rows: [] }) },
});
await rendered.findByText("No threads yet");
document.getElementById("slot").append(rendered.container);
document.documentElement.dataset.ready = "true";
window.addEventListener("pagehide", () => rendered.unmount(), { once: true });
