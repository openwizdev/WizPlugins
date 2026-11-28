// The board's rail, as a stub: registering a view as one rail entry, the
// decided order, which view the board opens on, and a minimal page that draws
// one registered view with synthetic data, for view tests and screenshots.
// FD3 (#3411) fills in the real rail and render behind these same exports.
import { countOf, esc, renderView, type AnyView, type Input, type View } from "./view.ts";

/** The decided rail: these four first, in this order. Later views follow in the order they register, then the pins. */
export const decidedOrder = ["needs-you", "specs", "agents", "usage"] as const;

/** The board opens here. */
export const openingView = "needs-you";
/** Shown only when the owner opens it: the board never opens on it. */
export const neverOpens = "agents";

/** A link the owner pinned to the rail, as in #255's `--pin 'Slack=https://…'`. */
export interface Pin { readonly label: string; readonly url: string }

export type RailEntry =
  | { readonly kind: "view"; readonly id: string; readonly label: string }
  | { readonly kind: "pin"; readonly label: string; readonly url: string };

export interface Rail {
  /** Adds a view as one rail entry. A second view with the same id throws. */
  register(view: AnyView): void;
  /** The registered views, if any, by id. */
  view(id: string): AnyView | undefined;
  /** The rail in order: the decided views, later views, then the pins. */
  entries(): RailEntry[];
  /** The view the board opens on: Needs you, else the first view in rail order that isn't Agents, else none. */
  opening(): string | null;
}

/** Only plain web links with no login in them; anything else is not a pin. */
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

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const rank = (id: string) => {
  const at = (decidedOrder as readonly string[]).indexOf(id);
  return at < 0 ? decidedOrder.length : at;
};

export function createRail(options: { pins?: readonly Pin[] } = {}): Rail {
  const registered: AnyView[] = [];
  const pins = (options.pins ?? []).flatMap((pin): RailEntry[] => {
    const url = pinUrl(pin.url);
    return url ? [{ kind: "pin", label: pin.label, url }] : [];
  });
  // Stable sort: decided views by their place, later views keep their registration order.
  const ordered = () => registered.map((view, at) => ({ view, at })).sort((a, b) => rank(a.view.id) - rank(b.view.id) || a.at - b.at).map((e) => e.view);
  return {
    register(view) {
      if (!idPattern.test(view.id)) throw new Error(`view id "${view.id}" must be lowercase words joined by -`);
      if (registered.some((v) => v.id === view.id)) throw new Error(`a view with id "${view.id}" is already on the rail`);
      registered.push(view);
    },
    view: (id) => registered.find((v) => v.id === id),
    entries: () => [...ordered().map((v): RailEntry => ({ kind: "view", id: v.id, label: v.label })), ...pins],
    opening() {
      if (registered.some((v) => v.id === openingView)) return openingView;
      return ordered().find((v) => v.id !== neverOpens)?.id ?? null;
    },
  };
}

const pageCss = `
:root{color-scheme:dark;--bg:#0f0f10;--fg:#ececee;--muted:#9a9aa2;--line:rgb(255 255 255/.08);--active:rgb(255 255 255/.08);--warn:#e5a54b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.45 system-ui,sans-serif}
.shell{display:flex;align-items:flex-start;min-height:100vh}
.rail{flex:none;display:flex;flex-direction:column;gap:2px;width:128px;padding:10px 6px;border-right:1px solid var(--line);min-height:100vh}
.tab{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:12px;font-weight:500}
.tab[aria-current="page"]{background:var(--active)}.tab .label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.badge{flex:none;font-size:11px;font-variant-numeric:tabular-nums;color:var(--warn)}
main{flex:1;min-width:0;padding:12px 16px}.view-title{margin:0 0 8px;font-size:13px}.unavailable{color:var(--muted)}`;

/**
 * A still page with one view: the rail holds that view's entry alone, and the
 * view is drawn from the given input. No script and no outside requests.
 * For view tests and screenshots until FD3 lands the board's own render.
 */
export function renderPage<T>(view: View<T>, input: Input<T>): string {
  const n = countOf(view, input);
  const badge = n !== null && n > 0 ? `<span class="badge">${esc(n)}</span>` : "";
  const tab = `<a class="tab" href="#view-${esc(view.id)}" data-view="${esc(view.id)}" aria-current="page"><span class="label">${esc(view.label)}</span>${badge}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(view.label)}</title><style>${pageCss}</style></head>`
    + `<body data-view="${esc(view.id)}"><div class="shell"><nav class="rail" aria-label="Board views">${tab}</nav><main>${renderView(view, input)}</main></div></body></html>`;
}
