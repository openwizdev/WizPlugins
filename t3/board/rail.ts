// The board's own vertical tab rail, on the page's left edge: WizBar's views
// (Now, Specs, Agents, Usage), then links the user pins with --pin. T3's own
// panel tabs are T3's to draw; this rail is the board's. Under 420 px it shows
// icons only, with each label on hover, keyboard focus or a long press.

export const views = [
  { key: "now", label: "Now" },
  { key: "specs", label: "Specs" },
  { key: "agents", label: "Agents" },
  { key: "usage", label: "Usage" },
] as const;
export type ViewKey = (typeof views)[number]["key"];

/** A link the user pinned to the rail: `--pin 'Slack=https://…'`. */
export interface Pin { label: string; url: string }

/** The page's one escaper; render.ts uses it too. */
export const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only plain web links, with no login in them; anything else is not a pin. */
export function pinUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname || url.username || url.password) return null;
  return url.href;
}

/** `Label=URL`, split at the first `=`. Throws a plain reason when it isn't a pin. */
export function parsePin(text: string): Pin {
  const at = text.indexOf("=");
  const label = at < 0 ? "" : text.slice(0, at).trim();
  const raw = at < 0 ? "" : text.slice(at + 1).trim();
  if (!label || !raw) throw new Error(`--pin needs Label=URL, as in --pin 'Slack=https://example.slack.com/'`);
  if ([...label].length > 24 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error(`--pin label "${label.slice(0, 40)}" must be at most 24 characters, on one line`);
  const url = pinUrl(raw);
  if (!url) throw new Error(`--pin ${label}: the link must be an http or https address with no login in it`);
  return { label, url };
}

/** The pin's icon: its label's first letter. */
export const monogram = (label: string) => ([...label.trim()][0] ?? "?").toLocaleUpperCase();

// 16 px line icons, drawn for this page in the stroke weight of T3's own.
const icon = (body: string, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const icons: Record<ViewKey, string> = {
  now: icon(`<circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/>`),
  specs: icon(`<path d="M6.5 4.5h6M6.5 8h6M6.5 11.5h6"/><path d="M3.5 4.5h.01M3.5 8h.01M3.5 11.5h.01" stroke-width="2"/>`),
  agents: icon(`<rect x="3" y="5.5" width="10" height="7.5" rx="2"/><path d="M8 5.5V3M6.25 9v.5M9.75 9v.5"/>`),
  usage: icon(`<path d="M3.5 13V9M8 13V3.5M12.5 13V6.5"/>`),
};
const outIcon = icon(`<path d="M6.5 3.5h6v6M12.5 3.5 5 11"/>`, "out");

/** What the rail's badges count; the page refreshes them with the board. */
export interface Badges { now: number; agents: number }
const badgeWords: Record<keyof Badges, string> = { now: "need you", agents: "running" };
const badge = (key: keyof Badges, n: number) =>
  `<span class="badge ${key}" data-badge="${key}"${n > 0 ? "" : " hidden"}><b>${n}</b><span class="sr"> ${badgeWords[key]}</span></span>`;

/** The rail. `current` marks the open view (none on a still page, which shows every view). */
export function renderRail(options: { pins?: readonly Pin[]; badges: Badges; current: ViewKey | null }): string {
  const tabs = views.map(({ key, label }) => {
    const n = key === "now" || key === "agents" ? badge(key, options.badges[key]) : "";
    return `<a class="tab" href="#view-${key}" data-view="${key}"${options.current === key ? ` aria-current="page"` : ""}>`
      + `${icons[key]}<span class="label">${label}</span>${n}</a>`;
  });
  const pins = (options.pins ?? []).flatMap((pin) => {
    const href = pinUrl(pin.url);
    if (!href) return [];
    return [`<a class="tab pin" href="${esc(href)}" target="_blank" rel="noopener noreferrer">`
      + `<span class="mono" aria-hidden="true">${esc(monogram(pin.label))}</span><span class="label">${esc(pin.label)}<span class="sr"> (opens a new tab)</span></span>${outIcon}</a>`];
  });
  return `<nav class="rail" aria-label="Board views">${tabs.join("")}${pins.length > 0 ? `<hr class="rail-rule">${pins.join("")}` : ""}</nav>`;
}

/** Under this width the rail shows icons only. */
export const narrowPx = 420;

// T3's dark surfaces lay white over the canvas at a few percent: 4% to hover, 8% for a line.
export const railCss = `
.shell{display:flex;align-items:flex-start;min-height:100vh;min-height:100dvh}
.rail{position:sticky;top:0;flex:none;display:flex;flex-direction:column;gap:2px;width:128px;height:100vh;height:100dvh;overflow-y:auto;
  padding:10px 6px 10px max(6px,env(safe-area-inset-left));border-right:1px solid var(--line);background:var(--bg)}
.tab{position:relative;display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:8px;color:var(--muted);font-size:12px;
  font-weight:500;white-space:nowrap;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.tab:hover{text-decoration:none;background:var(--hover);color:var(--fg)}
.tab[aria-current="page"]{background:var(--active);color:var(--fg)}
.tab:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
.tab .icon{flex:none;opacity:.9}.tab[aria-current="page"] .icon{opacity:1}
.tab .label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.badge{flex:none;font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted)}.badge.now{color:var(--warn)}.badge b{font-weight:500}
.mono{flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:4px;box-shadow:inset 0 0 0 1px currentColor;font-size:10px;font-weight:600;line-height:1}
.out{flex:none;width:12px;height:12px;opacity:.7}
.rail-rule{width:100%;border:0;border-top:1px solid var(--line);margin:6px 0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
@media (max-width:${narrowPx - 0.02}px){
  .rail{width:45px;align-items:center;overflow:visible;padding:10px 6px}
  .tab{width:32px;height:32px;padding:0;justify-content:center}
  .tab .label{position:absolute;left:calc(100% + 10px);top:50%;z-index:2;flex:none;max-width:60vw;padding:4px 8px;border-radius:6px;
    background:var(--pop);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 4px 12px rgb(0 0 0/.35);font-size:12px;
    opacity:0;pointer-events:none;transform:translate(-4px,-50%);transition:opacity .12s,transform .12s}
  .tab:focus-visible .label,.tab.peek .label{opacity:1;transform:translate(0,-50%)}
  .badge{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--warn);overflow:hidden;color:transparent}
  .badge.agents{display:none}.out{display:none}
}
@media (max-width:${narrowPx - 0.02}px) and (hover:hover){.tab:hover .label{opacity:1;transform:translate(0,-50%)}}
@media (max-height:480px){.rail{position:static;height:auto;min-height:100vh}}
@media (prefers-reduced-motion:reduce){.tab .label{transition:none}}`;
