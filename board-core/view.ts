// The board core's view interface. Every board view is written against it:
// a view has an id, its rail label, an optional count, and a function from its
// data to HTML in which every value goes through `esc`. A view never sees an
// unavailable input: the core draws the reason for it, so "can't read" is
// never shown as zero. FD3 (#3411) moves the board's readers and views onto
// these shapes, which follow the view and rail model of draft WizPlugins#255.

/** The one escaper. Every value a view draws, text or attribute, goes through it. */
export const esc = (value: string | number): string =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** What every view reads: its data, or unavailable with the plain reason why. Never zero in its place. */
export type Input<T> =
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "unavailable"; readonly reason: string };

export const ready = <T>(data: T): Input<T> => ({ status: "ready", data });

/** A missing, broken or stale source. The reason is shown to the owner, so it must say something. */
export function unavailable<T = never>(reason: string): Input<T> {
  if (reason.trim() === "") throw new Error("unavailable needs a reason to show");
  return { status: "unavailable", reason };
}

/** One board view. */
export interface View<T> {
  /** Stable key: the rail's `#view-<id>` and `data-view`. Lowercase words joined by `-`. */
  readonly id: string;
  /** The rail's label and the view's title. Plain text; the core escapes it. */
  readonly label: string;
  /** The rail badge, from ready data only. Zero hides the badge. */
  readonly count?: (data: T) => number;
  /** The view's body. Every value in it goes through `esc`. */
  readonly render: (data: T) => string;
}

/** A view of any data, as the rail holds it. */
export type AnyView = View<any>;

/** The view's count for this input, or null when there is no number to show (no count, or no data). */
export function countOf<T>(view: View<T>, input: Input<T>): number | null {
  if (input.status !== "ready" || !view.count) return null;
  return view.count(input.data);
}

/** A view drawn from its input: its title, then its body, or its reason when unavailable. */
export function renderView<T>(view: View<T>, input: Input<T>): string {
  const body = input.status === "ready"
    ? view.render(input.data)
    : `<p class="unavailable">${esc(view.label)} unavailable: ${esc(input.reason)}</p>`;
  return `<div class="view" id="view-${esc(view.id)}" data-view="${esc(view.id)}"><h2 class="view-title">${esc(view.label)}</h2>${body}</div>`;
}
