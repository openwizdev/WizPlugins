// @vitest-environment jsdom
// Renders the real sidebar with the synthetic scene and writes a static HTML page
// (the DOM plus dist/app.css and dark host variables) for shoot.sh to screenshot.
// Skipped unless WIZBAR_RENDER_OUT names an output folder (tools/render/README.md).
import { describe, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scene } from "./scene";

const out = process.env.WIZBAR_RENDER_OUT;
const agents = Number(process.env.WIZBAR_RENDER_AGENTS ?? 24);
const height = Number(process.env.WIZBAR_RENDER_HEIGHT ?? 900);

const hostVars = `@layer base{*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}
button,input,select{font:inherit;color:inherit;background:transparent}button{cursor:pointer}ol,ul{list-style:none}
img,svg,video{display:block;vertical-align:middle}h1,h2,h3,h4,p{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}}
:root{color-scheme:dark;--background:#0f0f0f;--foreground:#ededed;--card:#1c1c1c;--card-foreground:#ededed;
--popover:#1c1c1c;--popover-foreground:#ededed;--primary:#c0ff04;--primary-foreground:#0f0f0f;--muted:#2a2a2c;
--muted-foreground:#9a9a9a;--accent:#262626;--accent-foreground:#ededed;--border:#292929;--input:#292929;--ring:#5a5a5a;
--sidebar:#161616;--sidebar-foreground:#ededed;--sidebar-accent:#222222;--sidebar-accent-foreground:#ededed;
--sidebar-border:#262626;--sidebar-ring:#5a5a5a;--success:#4cc38a;--warning:#fc8c45;--destructive:#e5484d;
--destructive-text:#ff6369;--radius:8px;--font-sans:Inter,ui-sans-serif,system-ui,sans-serif;--font-mono:ui-monospace,monospace}
html,body{margin:0;background:var(--background);color:var(--foreground);font-family:var(--font-sans);font-size:13px}
.host{display:flex;height:${height}px;width:1100px}
.side{width:300px;height:100%;background:var(--sidebar);border-right:1px solid var(--sidebar-border);display:flex;flex-direction:column}
.chrome{padding:10px 10px 6px;display:flex;flex-direction:column;gap:6px}
.chrome .btn{height:28px;border-radius:6px;background:var(--sidebar-accent);display:flex;align-items:center;padding:0 10px;color:var(--muted-foreground);font-size:12.5px}
.chrome .search{height:28px;border-radius:6px;border:1px solid var(--sidebar-border);display:flex;align-items:center;padding:0 10px;color:#6a6a6a;font-size:12.5px}
.list{flex:1;min-height:0;display:flex;flex-direction:column}
.main{flex:1;display:flex;align-items:center;justify-content:center;color:#3a3a3a}
* { animation-play-state: paused !important; }`;

describe.skipIf(!out)("render", () => {
  for (const view of (process.env.WIZBAR_RENDER_VIEWS ?? "sidebar,card").split(",")) {
    it(view, async () => {
      const app = await loadPluginApp(() => import("../../app"));
      const s = scene(agents);
      // jsdom has no layout: give the footer a place near the bottom so the card has room above it.
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        return { ...rect.call(this), top: height - 40, bottom: height - 20, height: 20, width: 280, left: 0, right: 280, x: 0, y: height - 40, toJSON() {} };
      };
      try {
      const r = renderSlot(app.threadLists[0]!, {
        activeThreadId: "thr_orch", activeProjectId: null, isCompactViewport: false, onNavigate() {}, searchQuery: process.env.WIZBAR_RENDER_SEARCH ?? "",
      }, {
        pluginId: "wizbar", settings: { wizdeckFactories: s.binding, specsOpen: JSON.stringify(["example/sample-factory#200"]) },
        sidebarThreads: { status: "ready", threads: s.threads },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          specsFile: () => ({ kind: "content", text: s.specsText }),
          agentsFile: () => ({ kind: "content", text: s.agentsText }),
          cardModels: (input: unknown) => ({ source: "host", items: (input as { threadIds: string[] }).threadIds
            .map((threadId) => ({ threadId, model: s.models[threadId]?.model ?? null, effort: s.models[threadId]?.effort ?? null })) }),
        },
      });
      await screen.findAllByText(/running/);
      await screen.findByRole("region", { name: "Cloud agents" });
      await act(async () => { await new Promise((done) => setTimeout(done, 300)); });
      if (view === "card") {
        const trigger = screen.getAllByRole("button").find((b) => /running/.test(b.getAttribute("aria-label") ?? ""));
        if (trigger) fireEvent.click(trigger);
        await act(async () => { await new Promise((done) => setTimeout(done, 300)); });
      }
      const pluginCss = join(__dirname, "../../dist/app.css");
      const hostAssets = join(__dirname, "../../node_modules/bb-app/app/dist/assets");
      const hostCss = readdirSync(hostAssets).find((file) => /^index-.+\.css$/.test(file))!;
      const css = readFileSync(existsSync(pluginCss) ? pluginCss : join(hostAssets, hostCss), "utf8");
      const html = `<!doctype html><html class="dark"><head><meta charset="utf-8"><style>@layer base, properties, theme, utilities;</style><style>${hostVars}</style><style>${css}</style></head>
<body><div class="host"><aside class="side"><div class="chrome"><div class="btn">+ New thread</div><div class="search">Search threads</div></div>
<div class="list" data-bb-plugin="wizbar">${r.container.innerHTML}</div></aside><div class="main">Thread</div></div></body></html>`;
      mkdirSync(out!, { recursive: true });
      writeFileSync(join(out!, `${view}.html`), html);
      r.unmount();
      } finally {
        Element.prototype.getBoundingClientRect = rect;
      }
    }, 30_000);
  }
});
