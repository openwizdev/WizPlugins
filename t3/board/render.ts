// Draws the board as one self-contained page: inline CSS, one small inline
// script that refreshes it, no outside requests. Every value is escaped.
import type { AgentRow, Board, Dot, DotState, SpecRow, ThreadRow } from "./board.ts";
import { leaseMinutes } from "./board.ts";

export const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Only GitHub links leave the page; anything else is drawn as text. */
const safeUrl = (url: string | null) => (url !== null && /^https:\/\/github\.com\//.test(url) ? url : null);
const link = (url: string | null, text: string, cls = "") => {
  const href = safeUrl(url);
  const c = cls ? ` class="${cls}"` : "";
  return href ? `<a${c} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : `<span${c}>${esc(text)}</span>`;
};

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

const dotWords: Record<DotState, string> = {
  done: "done", "done-recent": "done in the last hour", building: "being built", review: "in review",
  "needs-you": "needs you", "yours-later": "later", held: "held", "not-started": "not started",
};
const reasonWords: Record<string, string> = {
  missing: "no file yet", unreadable: "can't read the file", malformed: "the file doesn't read",
  "unknown-schema": "unknown file version", stale: "older than 30 minutes",
};
const reason = (r: string) => reasonWords[r] ?? r;

function dots(row: SpecRow): string {
  const counts = new Map<DotState, number>();
  for (const d of row.dots) counts.set(d.state, (counts.get(d.state) ?? 0) + 1);
  const label = `${row.total} tickets: ${[...counts].map(([s, n]) => `${n} ${dotWords[s]}`).join(", ")}`;
  const one = (d: Dot) => `<i class="dot ${d.state}${d.breathing ? " breath" : ""}" title="${esc(`${d.code ?? d.ticket}: ${dotWords[d.state]}`)}"></i>`;
  return `<span class="dots" role="img" aria-label="${esc(label)}">${row.dots.map(one).join("")}</span>`;
}

const stateWords: Record<AgentRow["state"], string> = { working: "working", reviewing: "reviewing", "needs-you": "needs you", failed: "failed" };
function agent(a: AgentRow, now: number): string {
  const model = [a.harness, a.model].filter(Boolean).join(" · ");
  return `<li class="agent ${a.state}"><i class="mark"></i><div>${link(a.url, a.label, "name")}`
    + `<span class="meta">${esc(stateWords[a.state])}${model ? ` · ${esc(model)}` : ""} · ${a.where === "t3" ? "T3" : "GitHub"} · ${ago(a.updatedAt, now)}</span></div></li>`;
}

function spec(row: SpecRow, now: number): string {
  const notes = [
    row.needsYou > 0 ? `<span class="warn">${row.needsYou} needs you</span>` : "",
    row.yoursLater > 0 ? `<span class="soft">${row.needsYou > 0 ? "· " : ""}${row.yoursLater} later</span>` : "",
    row.doneLastHour > 0 ? `<span>${row.doneLastHour} done · 1h</span>` : "",
  ].join("");
  const line = `<div class="spec-line"><span class="lead${row.agents.length > 0 ? " chev" : ""}"></span>`
    + `<span class="spec-name${row.muted ? " muted" : ""}">${esc(row.shortName)}</span><span class="notes">${notes}</span>`
    + `<span class="count">${row.done}/${row.total}</span>${link(row.url, "↗", "gh")}</div>${dots(row)}`;
  if (row.agents.length === 0) return `<li class="spec"><div>${line}</div></li>`;
  return `<li class="spec"><details open data-key="${esc(row.spec)}"><summary>${line}</summary>`
    + `<ul class="agents">${row.agents.map((a) => agent(a, now)).join("")}</ul></details></li>`;
}

const lookWords: Record<ThreadRow["look"], string> = { running: "working", "needs-you": "needs you", failed: "failed", idle: "idle" };
function thread(t: ThreadRow, now: number): string {
  return `<li class="thread ${t.look}"><i class="mark"></i><div><span class="name">${esc(t.title)}</span>`
    + `<span class="meta">${esc(lookWords[t.look])}${t.model ? ` · ${esc(t.model)}` : ""} · ${ago(t.updatedAt, now)}</span></div></li>`;
}

const section = (key: string, title: string, body: string) =>
  `<section><details open data-key="section:${key}"><summary class="rule"><span>${title}</span><hr></summary>${body}</details></section>`;

/** The board's inner HTML, which the page refreshes in place. */
export function renderBoard(board: Board, note: string | null = null): string {
  const { now } = board;
  const out: string[] = [];
  const running = board.running === null ? "running unknown" : `${board.running} running`;
  out.push(`<header><b>WizBar</b><span class="meta">${running}</span></header>`);

  if (board.t3.status === "ready" && board.t3.pinned.length > 0) {
    out.push(section("pinned", `Pinned ${board.t3.pinned.length}`, `<ul>${board.t3.pinned.map((t) => thread(t, now)).join("")}</ul>`));
  }

  if (board.specs.status === "unavailable") {
    out.push(section("specs", "Specs", `<p class="unavailable">Specs unavailable: ${esc(reason(board.specs.reason))}</p>`));
  } else {
    const main = board.specs.rows.filter((r) => !r.quiet);
    const quiet = board.specs.rows.filter((r) => r.quiet);
    const quietGroup = quiet.length === 0 ? ""
      : `<li class="quiet"><details data-key="quiet"><summary>Quiet ${quiet.length}</summary><ul>${quiet.map((r) => spec(r, now)).join("")}</ul></details></li>`;
    const rule = esc(board.specs.rule).replace(/ · (\d+ tickets? needs? you.*)$/, ' · <span class="warn">$1</span>');
    const empty = board.specs.rows.length === 0 ? `<p class="meta">No running specs.</p>` : "";
    out.push(section("specs", rule, `${empty}<ul class="specs">${main.map((r) => spec(r, now)).join("")}${quietGroup}</ul>`));
  }

  if (board.otherAgents.length > 0) {
    out.push(section("github", `On GitHub ${board.otherAgents.length}`, `<ul class="agents">${board.otherAgents.map((a) => agent(a, now)).join("")}</ul>`));
  }

  if (board.t3.status === "ready") {
    const rows = board.t3.needsYou;
    out.push(section("needs-you", `Needs you ${rows.length}`, rows.length === 0 ? `<p class="meta">Nothing waiting on you in T3.</p>` : `<ul>${rows.map((t) => thread(t, now)).join("")}</ul>`));
  } else if (board.t3.status === "unavailable") {
    out.push(section("needs-you", "Needs you", `<p class="unavailable">T3 threads unavailable: ${esc(board.t3.reason)}</p>`));
  }

  const sources = [
    board.specs.status === "ready" ? `specs ${ago(board.specs.generatedAt, now)}` : "",
    board.agents.status === "ready" ? `GitHub notes live for ${leaseMinutes}m` : `GitHub notes unavailable: ${reason(board.agents.reason)}`,
    board.t3.status === "off" ? "T3 threads off" : "",
  ].filter(Boolean).join(" · ");
  out.push(`<footer class="meta">${note ? `<span class="warn">${esc(note)}</span><br>` : ""}${esc(sources)}</footer>`);
  return out.join("");
}

const css = `
:root{color-scheme:light dark;--bg:#161616;--card:#222;--fg:#ededed;--muted:#b7b7b7;--border:#292929;--warn:#fc8c45;--ok:#7fc77f}
@media (prefers-color-scheme:light){:root{--bg:#fafafa;--card:#f0f0f0;--fg:#1a1a1a;--muted:#6b6b6b;--border:#dedede;--warn:#d9631e;--ok:#3f9a4a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:420px;padding:10px 8px}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
header{display:flex;justify-content:space-between;align-items:baseline;padding:2px 10px 8px}
ul{list-style:none;margin:0;padding:0}summary{list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}
.rule{display:flex;align-items:center;gap:8px;margin:10px 10px 4px;color:var(--muted);font-size:12px;font-weight:500}
.rule hr{flex:1;border:0;border-top:1px solid var(--border);margin:0}
.meta{color:var(--muted);font-size:12px}.warn{color:var(--warn)}.unavailable{color:var(--muted);margin:4px 10px}
.spec>div,.spec>details>summary{display:block;padding:5px 10px;border-radius:8px}.spec>div:hover,.spec summary:hover{background:color-mix(in oklab,var(--card) 70%,transparent)}
.spec details[open]{background:var(--card);border-radius:8px;padding-bottom:4px;margin:2px 0}
.spec-line{display:flex;align-items:center;gap:8px}.lead{width:10px;flex:none;color:var(--muted)}
.chev::before{content:"›";display:inline-block}details[open]>summary .chev::before{transform:rotate(90deg)}
.spec-name{flex:1;min-width:6rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.spec-name.muted{color:var(--muted)}
.notes{display:flex;gap:8px;font-size:12px;white-space:nowrap}.count{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px}
.gh{color:var(--muted);font-size:12px}
.dots{display:flex;flex-wrap:wrap;gap:3px;margin:5px 0 0 18px}.dot{width:5px;height:5px;border-radius:50%;display:block}
.dot.done{background:color-mix(in oklab,var(--ok) 55%,var(--bg))}.dot.done-recent{background:color-mix(in oklab,var(--ok) 85%,var(--bg))}
.dot.building,.dot.review{box-shadow:inset 0 0 0 1px var(--muted)}.dot.needs-you{background:var(--warn)}
.dot.yours-later{box-shadow:inset 0 0 0 1px color-mix(in oklab,var(--warn) 60%,transparent)}
.dot.held{box-shadow:inset 0 0 0 1px color-mix(in oklch,var(--muted) 45%,var(--bg))}.dot.not-started{background:var(--border)}
.breath{animation:breath 2s ease-in-out infinite}@keyframes breath{50%{opacity:.4}}
@media (prefers-reduced-motion:reduce){.breath{animation:none}}
.agent,.thread{display:flex;align-items:flex-start;gap:8px;padding:3px 10px 3px 18px}.thread{padding-left:10px}
.agent>div,.thread>div{min-width:0;flex:1}
.agent .name,.thread .name,.agent .meta,.thread .meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.soft{color:var(--muted)}
.mark{width:6px;height:6px;border-radius:50%;flex:none;margin-top:6px;box-shadow:inset 0 0 0 1px var(--muted)}
.working .mark,.running .mark{background:var(--ok);box-shadow:none}.reviewing .mark{box-shadow:inset 0 0 0 1.5px var(--ok)}
.needs-you .mark{background:var(--warn);box-shadow:none}.failed .mark{background:#e5484d;box-shadow:none}
.quiet>details>summary{padding:5px 10px 5px 28px;color:var(--muted);font-size:12px}
footer{padding:12px 10px 4px}
section>details>p{margin:4px 10px}
#stale{display:none;margin:0 10px 6px;color:var(--warn);font-size:12px}#stale.on{display:block}`;

/** The whole page. `refreshSeconds` 0 draws a still snapshot (for T3's html_render), with no script. */
export function renderPage(board: Board, options: { refreshSeconds: number; nonce?: string; note?: string | null }): string {
  const script = options.refreshSeconds > 0 ? `<script nonce="${esc(options.nonce ?? "")}">
(() => {
  const root = document.getElementById("board"), stale = document.getElementById("stale"), key = "wizbar-t3-open";
  const saved = () => { try { return JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { return {}; } };
  const restore = () => { const s = saved(); for (const d of root.querySelectorAll("details[data-key]")) if (d.dataset.key in s) d.open = s[d.dataset.key]; };
  root.addEventListener("toggle", (e) => { const d = e.target; if (!d.dataset || !d.dataset.key) return; const s = saved(); s[d.dataset.key] = d.open; sessionStorage.setItem(key, JSON.stringify(s)); }, true);
  restore();
  setInterval(async () => {
    try {
      const r = await fetch("/board", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      root.innerHTML = await r.text(); restore(); stale.classList.remove("on");
    } catch { stale.classList.add("on"); }
  }, ${Math.round(options.refreshSeconds * 1000)});
})();
</script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WizBar</title><style>${css}</style></head><body><main><p id="stale">The board server stopped answering; this is the last view.</p><div id="board">${renderBoard(board, options.note ?? null)}</div></main>${script}</body></html>`;
}
