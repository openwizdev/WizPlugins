// Draws the board as one self-contained page: inline CSS, one small inline
// script that refreshes it, no outside requests. Every value is escaped.
import type { AgentRow, Board, Dot, DotState, Requests, Scan, SpecRow, Tally, ThreadRow } from "./board.ts";
import { leaseMinutes } from "./board.ts";
import { esc, narrowPx, railCss, renderRail, views, type Badges, type Pin } from "./rail.ts";

export { esc };
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

/** The producer's GitHub requests as the Usage view shows them. */
export type RequestsView = { status: "off" } | { status: "none"; reason: string } | { status: "ready"; value: Requests };
export interface Extras { note?: string | null; requests?: RequestsView }

/** What the rail's badges count: everything waiting on you, and everything running. */
export function badges(board: Board): Badges {
  const t3 = board.t3.status === "ready" ? board.t3.needsYou.length : 0;
  const specs = board.specs.status === "ready" ? board.specs.needsYou : 0;
  return { now: t3 + asking(board).length + specs, agents: board.running ?? 0 };
}

/** GitHub agents asking you something. A T3 thread asking you is already in Needs you. */
const asking = (board: Board) => [...(board.specs.status === "ready" ? board.specs.rows.flatMap((r) => r.agents) : []), ...board.otherAgents]
  .filter((a) => a.where === "github" && a.state === "needs-you").sort((a, b) => b.updatedAt - a.updatedAt);

const view = (key: string, title: string, body: string) =>
  `<div class="view" id="view-${key}" data-view="${key}"><h2 class="view-title">${title}</h2>${body}</div>`;

function nowView(board: Board): string {
  const { now } = board;
  const out: string[] = [];
  if (board.t3.status === "ready" && board.t3.pinned.length > 0) {
    out.push(section("pinned", `Pinned ${board.t3.pinned.length}`, `<ul>${board.t3.pinned.map((t) => thread(t, now)).join("")}</ul>`));
  }
  if (board.t3.status === "ready") {
    const rows = board.t3.needsYou;
    out.push(section("needs-you", `Needs you ${rows.length}`, rows.length === 0 ? `<p class="meta">Nothing waiting on you in T3.</p>` : `<ul>${rows.map((t) => thread(t, now)).join("")}</ul>`));
  } else if (board.t3.status === "unavailable") {
    out.push(section("needs-you", "Needs you", `<p class="unavailable">T3 threads unavailable: ${esc(board.t3.reason)}</p>`));
  }
  const ask = asking(board);
  if (ask.length > 0) out.push(section("asking", `Asking on GitHub ${ask.length}`, `<ul class="agents">${ask.map((a) => agent(a, now)).join("")}</ul>`));
  if (board.specs.status === "unavailable") {
    out.push(section("now-specs", "Specs", `<p class="unavailable">Specs unavailable: ${esc(reason(board.specs.reason))}</p>`));
  } else {
    const due = board.specs.rows.filter((r) => r.needsYou > 0);
    const specs = due.length === 1 ? "spec" : "specs";
    const title = due.length === 0 ? "Specs"
      : `<span class="warn">${board.specs.needsYou} ${board.specs.needsYou === 1 ? "ticket needs" : "tickets need"} you</span> · ${due.length} ${specs}`;
    out.push(section("now-specs", title, due.length === 0 ? `<p class="meta">No spec ticket needs you.</p>` : `<ul class="specs">${due.map((r) => spec(r, now)).join("")}</ul>`));
  }
  return out.join("");
}

function specsView(board: Board): string {
  const { now } = board;
  if (board.specs.status === "unavailable") {
    return section("specs", "Specs", `<p class="unavailable">Specs unavailable: ${esc(reason(board.specs.reason))}</p>`);
  }
  const main = board.specs.rows.filter((r) => !r.quiet);
  const quiet = board.specs.rows.filter((r) => r.quiet);
  const quietGroup = quiet.length === 0 ? ""
    : `<li class="quiet"><details data-key="quiet"><summary>Quiet ${quiet.length}</summary><ul>${quiet.map((r) => spec(r, now)).join("")}</ul></details></li>`;
  const rule = esc(board.specs.rule).replace(/ · (\d+ tickets? needs? you.*)$/, ' · <span class="warn">$1</span>');
  const empty = board.specs.rows.length === 0 ? `<p class="meta">No running specs.</p>` : "";
  return section("specs", rule, `${empty}<ul class="specs">${main.map((r) => spec(r, now)).join("")}${quietGroup}</ul>`);
}

function agentsView(board: Board): string {
  const { now } = board;
  const out: string[] = [];
  const bySpec = board.specs.status === "ready" ? board.specs.rows.filter((r) => r.agents.length > 0) : [];
  const onSpecs = bySpec.reduce((n, r) => n + r.agents.length, 0);
  if (onSpecs > 0) {
    out.push(section("agents-specs", `On specs ${onSpecs}`, `<ul>${bySpec.map((r) =>
      `<li class="group"><span class="group-name${r.muted ? " muted" : ""}">${esc(r.shortName)}</span><ul class="agents">${r.agents.map((a) => agent(a, now)).join("")}</ul></li>`).join("")}</ul>`));
  }
  if (board.otherAgents.length > 0) {
    out.push(section("github", `On GitHub ${board.otherAgents.length}`, `<ul class="agents">${board.otherAgents.map((a) => agent(a, now)).join("")}</ul>`));
  }
  if (board.t3.status === "ready" && board.t3.running.length > 0) {
    out.push(section("t3-running", `Other T3 threads ${board.t3.running.length}`, `<ul>${board.t3.running.map((t) => thread(t, now)).join("")}</ul>`));
  }
  if (out.length === 0) {
    out.push(board.running === null
      ? `<p class="unavailable">Agents unknown: neither the GitHub notes nor T3's threads could be read.</p>`
      : `<p class="meta">No live agents.</p>`);
  }
  return out.join("");
}

/** A name, a one-hue bar and a figure: the bar is the share of `whole`, the words carry the numbers. */
function bars(rows: readonly { name: string; value: number; whole: number; figure: string; title: string; warn?: boolean }[]): string {
  return `<ul class="bars">${rows.map((r) => {
    const width = r.whole > 0 ? Math.min(100, Math.round((r.value / r.whole) * 1000) / 10) : 0;
    return `<li title="${esc(r.title)}"><span class="bar-name">${esc(r.name)}</span>`
      + `<span class="bar${r.warn ? " near" : ""}" aria-hidden="true"><i style="width:${width}%"></i></span><span class="bar-figure">${esc(r.figure)}</span></li>`;
  }).join("")}</ul>`;
}

function usageView(board: Board, requests: RequestsView): string {
  const { now } = board;
  const out: string[] = [];
  const running = board.running;
  const tallies = (key: string, title: string, list: readonly Tally[]) => {
    if (board.usage === null || running === null) return section(key, title, `<p class="unavailable">Running unknown: neither the GitHub notes nor T3's threads could be read.</p>`);
    if (running === 0) return section(key, title, `<p class="meta">Nothing running.</p>`);
    return section(key, title, bars(list.map((t) => ({ name: t.name, value: t.count, whole: running, figure: String(t.count), title: `${t.name}: ${t.count} of ${running} running` }))));
  };
  out.push(tallies("usage-harness", "Running by harness", board.usage?.harnesses ?? []));
  out.push(tallies("usage-model", "Running by model", board.usage?.models ?? []));

  if (requests.status === "off") {
    out.push(section("usage-github", "GitHub requests", `<p class="meta">Not counted here: this board only reads the files, so whatever runs the specs producer sees its requests. Start the board with --repo to run it here.</p>`));
  } else if (requests.status === "none") {
    out.push(section("usage-github", "GitHub requests", `<p class="meta">${esc(requests.reason)}</p>`));
  } else {
    const r = requests.value;
    const scans = [["Specs scan", r.specs], ["Agents scan", r.agents]] as const;
    const near = (s: Scan) => s.used >= s.budget * 0.8;
    const rows = scans.map(([name, s]) => ({
      name, value: s.used, whole: s.budget, warn: near(s), figure: `${s.used} of ${s.budget}`,
      title: `${name}: ${s.used} of ${s.budget} requests, ${s.unchanged} answered "unchanged"`,
    }));
    // The bar's colour is never the only sign: a near cap is said in words too.
    const warnings = scans.filter(([, s]) => near(s)).map(([name, s]) =>
      `<p class="warn">${name} is near its cap (${s.used} of ${s.budget}). Past it, the producer keeps the last file.</p>`);
    out.push(section("usage-github", `GitHub requests · last run ${ago(r.at, now)}`, bars(rows) + warnings.join("")
      + `<p class="meta">Each producer run has these caps. "Unchanged" answers count toward them but not toward GitHub's own rate limit.</p>`));
  }
  out.push(`<p class="meta usage-note">Tokens and cost aren't shown: T3's thread list and the GitHub notes don't include them.</p>`);
  return out.join("");
}

/** The board's inner HTML, which the page refreshes in place: one view per rail tab, then the sources. */
export function renderBoard(board: Board, extras: Extras = {}): string {
  const { now } = board;
  const note = extras.note ?? null;
  const out: string[] = [];
  const running = board.running === null ? "running unknown" : `${board.running} running`;
  out.push(`<header><b>WizBar</b><span class="meta">${running}</span></header>`);
  const body: Record<(typeof views)[number]["key"], string> = {
    now: nowView(board), specs: specsView(board), agents: agentsView(board), usage: usageView(board, extras.requests ?? { status: "off" }),
  };
  for (const { key, label } of views) out.push(view(key, label, body[key]));

  const sources = [
    board.specs.status === "ready" ? `specs ${ago(board.specs.generatedAt, now)}` : "",
    board.agents.status === "ready" ? `GitHub notes live for ${leaseMinutes}m` : `GitHub notes unavailable: ${reason(board.agents.reason)}`,
    board.t3.status === "off" ? "T3 threads off" : "",
  ].filter(Boolean).join(" · ");
  out.push(`<footer class="meta">${note ? `<span class="warn">${esc(note)}</span><br>` : ""}${esc(sources)}</footer>`);
  const b = badges(board);
  out.push(`<i hidden data-badges data-now="${b.now}" data-agents="${b.agents}"></i>`);
  return out.join("");
}

const css = `
:root{color-scheme:light dark;--bg:#161616;--card:#222;--fg:#ededed;--muted:#b7b7b7;--border:#292929;--warn:#fc8c45;--ok:#7fc77f;
  --line:rgb(255 255 255/.08);--hover:rgb(255 255 255/.04);--active:rgb(255 255 255/.08);--pop:#1d1d1d;--focus:#5b8def;--bar:#338ced}
@media (prefers-color-scheme:light){:root{--bg:#fafafa;--card:#f0f0f0;--fg:#1a1a1a;--muted:#6b6b6b;--border:#dedede;--warn:#d9631e;--ok:#3f9a4a;
  --line:rgb(0 0 0/.08);--hover:rgb(0 0 0/.04);--active:rgb(0 0 0/.07);--pop:#fff;--focus:#3e63dd;--bar:#257de0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
main{flex:1;min-width:0;max-width:600px;padding:10px 8px;container:board/inline-size}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
body[data-view] .view{display:none}
body[data-view="now"] #view-now,body[data-view="specs"] #view-specs,body[data-view="agents"] #view-agents,body[data-view="usage"] #view-usage{display:block}
.view-title{margin:14px 10px 0;font-size:13px;font-weight:600}body[data-view] .view-title{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
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
@container board (max-width:340px){.spec-line{flex-wrap:wrap;row-gap:2px}.notes{order:5;flex-basis:100%;padding-left:18px}}
.group-name{display:block;padding:6px 10px 2px;font-weight:500}.group-name.muted{color:var(--muted)}
.bars{display:grid;grid-template-columns:minmax(0,8.5rem) minmax(48px,1fr) 4rem;gap:6px 10px;align-items:center;margin:6px 10px}
.bars li{display:contents}.bar-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{display:block;height:6px;border-radius:3px;background:color-mix(in oklab,var(--bar) 22%,var(--bg));overflow:hidden}
.bar i{display:block;height:100%;border-radius:3px;background:var(--bar)}.bar.near{background:color-mix(in oklab,var(--warn) 22%,var(--bg))}.bar.near i{background:var(--warn)}
.bar-figure{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.usage-note{margin:14px 10px 4px}
footer{padding:12px 10px 4px}
section>details>p{margin:4px 10px}section>details>p.warn{font-size:12px}
#stale{display:none;margin:0 10px 6px;color:var(--warn);font-size:12px}#stale.on{display:block}`;

/** The whole page: the rail, then the board. `refreshSeconds` 0 draws a still snapshot (for T3's html_render) with no script, every view in turn. */
export function renderPage(board: Board, options: { refreshSeconds: number; nonce?: string; note?: string | null; pins?: readonly Pin[]; requests?: RequestsView }): string {
  const live = options.refreshSeconds > 0;
  const script = live ? `<script nonce="${esc(options.nonce ?? "")}">
(() => {
  const root = document.getElementById("board"), stale = document.getElementById("stale"), rail = document.querySelector(".rail"), key = "wizbar-t3-open";
  const saved = () => { try { return JSON.parse(sessionStorage.getItem(key) || "{}"); } catch { return {}; } };
  const restore = () => { const s = saved(); for (const d of root.querySelectorAll("details[data-key]")) if (d.dataset.key in s) d.open = s[d.dataset.key]; };
  root.addEventListener("toggle", (e) => { const d = e.target; if (!d.dataset || !d.dataset.key) return; const s = saved(); s[d.dataset.key] = d.open; try { sessionStorage.setItem(key, JSON.stringify(s)); } catch {} }, true);
  restore();
  // The rail: one view at a time, kept in the address (#view-specs) and for the session.
  const views = ${JSON.stringify(views.map((v) => v.key))}, viewKey = "wizbar-t3-view";
  const fromHash = () => { const m = /^#view-([a-z]+)$/.exec(location.hash); return m && views.includes(m[1]) ? m[1] : null; };
  const show = (v, remember) => {
    document.body.dataset.view = v;
    for (const a of rail.querySelectorAll("a[data-view]")) if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    restore();
    if (remember) { try { sessionStorage.setItem(viewKey, v); } catch {} history.replaceState(null, "", "#view-" + v); }
  };
  let first = fromHash();
  if (!first) { try { first = sessionStorage.getItem(viewKey); } catch {} }
  show(views.includes(first) ? first : "now", false);
  addEventListener("hashchange", () => { const v = fromHash(); if (v) show(v, true); });
  // Icons only under ${narrowPx} px: a long press shows the label and doesn't open the tab.
  const narrow = matchMedia("(max-width: ${narrowPx - 0.02}px)");
  let timer = 0, peeked = null, swallow = false;
  const unpeek = () => { if (peeked) peeked.classList.remove("peek"); peeked = null; };
  document.addEventListener("pointerdown", (e) => {
    clearTimeout(timer); unpeek(); swallow = false;
    const a = e.target.closest && e.target.closest(".rail .tab");
    if (!a || e.pointerType === "mouse" || !narrow.matches) return;
    timer = setTimeout(() => { peeked = a; swallow = true; a.classList.add("peek"); setTimeout(() => { if (peeked === a) unpeek(); }, 1800); }, 450);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) rail.addEventListener(type, () => clearTimeout(timer));
  rail.addEventListener("contextmenu", (e) => { if (swallow) e.preventDefault(); });
  rail.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    if (swallow) { e.preventDefault(); swallow = false; return; }
    if (!a.dataset.view) return;
    e.preventDefault(); show(a.dataset.view, true); scrollTo(0, 0);
  });
  const badges = () => {
    const b = root.querySelector("[data-badges]");
    if (b) for (const el of rail.querySelectorAll("[data-badge]")) { const n = Number(b.dataset[el.dataset.badge]) || 0; el.hidden = n === 0; el.querySelector("b").textContent = String(n); }
  };
  setInterval(async () => {
    try {
      const r = await fetch("/board", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      root.innerHTML = await r.text(); restore(); badges(); stale.classList.remove("on");
    } catch { stale.classList.add("on"); }
  }, ${Math.round(options.refreshSeconds * 1000)});
})();
</script>` : "";
  const rail = renderRail({ pins: options.pins, badges: badges(board), current: live ? "now" : null });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WizBar</title><style>${css}${railCss}</style></head><body${live ? ` data-view="now"` : ""}><div class="shell">${rail}<main><p id="stale">The board server stopped answering; this is the last view.</p>`
    + `<div id="board">${renderBoard(board, { note: options.note ?? null, requests: options.requests })}</div></main></div>${script}</body></html>`;
}
