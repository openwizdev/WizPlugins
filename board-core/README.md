# WizBar board core

The one core every WizBar board surface shares (FD3 of OpenWiz spec #3408). This first piece is the **view interface**: the types every view is written against, how a view joins the rail, and a minimal page to draw one view. The file readers, the moved views and the real render come with FD3 (openwizdev/OpenWiz#3411), behind the same exports.

Node 24's standard library only. No install step: the typecheck uses WizBar's locked TypeScript, so run `npm ci` in `../wizbar` first.

```sh
cd board-core
npm test            # node --test
npm run typecheck   # ../wizbar's tsc, strict
```

## The interface

- **`view.ts`**
  - `View<T>`: an `id`, its rail `label`, an optional `count(data)` for the rail badge, and `render(data)`, which returns HTML.
  - `Input<T>`: what every view reads. It's `ready(data)`, or `unavailable(reason)` when a source is missing, broken or stale. An unavailable input is never drawn as zero: the core shows `<Label> unavailable: <reason>`, never calls the view's `render`, and shows no badge.
  - `esc`: the one escaper. Every value a view draws, text or attribute, goes through it.
  - `renderView(view, input)`: the view's title, then its body or its reason.
- **`rail.ts`** (a stub for now)
  - `createRail({ pins })`: `register(view)` adds a view as one rail entry. A second view with the same id throws.
  - `entries()`: the decided order **Needs you, Specs, Agents, Usage**, then later views in the order they registered, then the pinned links (plain `http`/`https` links only).
  - `opening()`: the board opens on **Needs you**, and never on **Agents**.
  - `renderPage(view, input)`: a still page with that one view, for view tests and screenshots.

## Adding a view

A view is one file under `board-core/views/` plus one rail entry. Here is a synthetic example.

`board-core/views/queue.ts`:

```ts
import { esc, type View } from "../view.ts";

export interface Queue { items: { title: string; age: string }[] }

export const queueView: View<Queue> = {
  id: "queue",
  label: "Queue",
  count: (data) => data.items.length,
  render: (data) => data.items.length === 0
    ? `<p class="meta">Nothing queued.</p>`
    : `<ul>${data.items.map((i) => `<li>${esc(i.title)} <span class="meta">${esc(i.age)}</span></li>`).join("")}</ul>`,
};
```

The one rail entry, where the board builds its rail:

```ts
rail.register(queueView);
```

Queue is not one of the decided four, so it sits after Usage and before the pins. To see or test it without the board, draw it with synthetic data:

```ts
import { renderPage } from "../rail.ts";
import { ready, unavailable } from "../view.ts";
import { queueView } from "./queue.ts";

renderPage(queueView, ready({ items: [{ title: "Review <the> look", age: "3m" }] }));
// …<span class="label">Queue</span><span class="badge">1</span>…<li>Review &lt;the&gt; look …
renderPage(queueView, unavailable("no file yet"));
// …<p class="unavailable">Queue unavailable: no file yet</p>… (no badge, never "0")
```

Put the view's test next to it as `views/queue.test.ts`. `npm test` finds it.

## Proof

`evidence/red.txt` is `npm test` against an empty interface. `evidence/green.txt` is the passing run and a clean typecheck.
