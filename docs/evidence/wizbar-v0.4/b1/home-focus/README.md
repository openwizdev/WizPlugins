# B1 (#76): repeated explicit Needs-you focus — host trace and proposal

Status: **proposal only.** Nothing here changes product code on the B1 branch. `wizbar/src/deck/home/` and `wizbar/src/deck/selection/` are D1's paths with no B1 grant. Every result below is a synthetic fixture run in a scratch copy of B1 head `2227e57`; none is live or installed-host proof.

## 1. Host source trace (Cloudroom, immutable commits)

Read at `827a3d03198db81a5eea1942833ecc81ee88fd9a`; the opener rows were also re-read at #160's head `fec35c49dfdd454a8e028c0536a5a07190fee26d`, with identical lines.

| Fact | Source (path:lines at `827a3d03`) |
| --- | --- |
| Params are serialized with `JSON.stringify` before a panel opens | `gui/apps/app/src/lib/plugin-json-value.ts:4-17`; called at `gui/apps/app/src/views/thread-detail/ThreadDetailView.tsx:1630-1646` |
| The tab id includes that serialized string: `${pluginId}:${actionId}:${paramsJson}` | `gui/packages/client-core/src/panel/fixed-panel-tabs-state.ts:537-555` (line 548) |
| An existing tab with that id is reactivated, not recreated | `gui/apps/app/src/components/secondary-panel/useThreadFileTabs.ts:848-875` (lines 860-870) |
| Only the active tab's content renders, placed unkeyed | `gui/apps/app/src/components/secondary-panel/ThreadSecondaryPanel.tsx:664-681`, `801` |
| A plugin tab's slot is keyed by plugin/action/generation, not tab id; params are memoized by `paramsJson` | `gui/apps/app/src/components/plugin/PluginPanelActions.tsx:260-265`, `280`, `287-293` |
| `useBbNavigate().openThreadPanel` calls the context handler, else returns `false` | `gui/apps/app/src/lib/plugin-sdk-hooks.ts:307`, `368-370` |
| That context is provided only inside the thread view and message directives | `gui/apps/app/src/views/thread-detail/ThreadDetailView.tsx:3403-3409`; `gui/apps/app/src/components/ui/markdown-message-directives.tsx:318-322`; definition `gui/apps/app/src/components/plugin/plugin-thread-panel-navigation.tsx:20-36` |
| The sidebar's thread-list slot is mounted by the app sidebar, outside the thread view | `gui/apps/app/src/components/sidebar/AppSidebar.tsx:70`, `296`; mounted from `gui/apps/app/src/components/layout/AppLayoutSidebar.tsx:34`, `63` |

What follows from it:

1. **Tabs.** Each distinct focus (`{focus:{A,n12}}`, `{focus:null}`, …) is its own tab. Clicking the same item again reactivates that tab, so repeated clicks on one item make no new tab. Different items do make one tab each; that is existing D1 opener behaviour, not B1's.
2. **Panel lifetime.** Moving between two WizDeck tabs keeps the same mounted Home and only swaps its `params`. Moving to a non-plugin tab and back remounts it.
3. **The missing event.** Suppose the item's tab is already active and the person changes factory inside it. A repeated identical open then changes no host state: same id, already active, same memoized `params`. Nothing reaches the mounted panel. A fresh props object in a test is not evidence of a host event.
4. **Sidebar opener (new, acceptance-relevant).** By source, a sidebar slot has no thread-panel opener handler, so `openThreadPanel` from WizBar's sidebar returns `false` at both commits. WizBar's Needs-you entry then shows "Open a thread to see WizDeck beside it." and opens nothing. The SDK declaration (`bb-plugin-sdk-app.d.ts`, `BbNavigate.openThreadPanel`) says it opens in "the current surface's side panel". This is a source reading, not an installed observation. Making the sidebar open a thread panel is a host change (Cloudroom), outside every WizPlugins ticket.

## 2. Options

| Option | Interface | Result in the host-equivalent harness |
| --- | --- | --- |
| Current Home | none | first click from factory B: not selected or focused (`red-current-home.log`, 3 of 3 fail; also steals focus when the person switches back by hand) |
| **1. No new interface** (`option1-no-interface.diff`, Home + Panel) | none: reacts to mount and tab activation (new `params` object) only | everything passes except a repeated click on the same item after switching factory inside the active tab (`red-option1-no-interface.log`, fails at `Home.test.tsx:328`) |
| **2. Option 1 + plugin-local focus event** (`proposal-option2.diff`) | **NEW plugin-local interface** in `selection.ts`: `openWizDeck` publishes `WizDeckFocusEventV1 { seq, focus }` once per accepted explicit open; `useWizDeckFocusEvent()` subscribes. Never persisted, never sent; params, `FocusRequestV1`, SDK, host and RPC unchanged | all pass (`green-option2.log`, 20/20); full suite 894/894 in scratch, typecheck clean |

No existing plugin-local mechanism carries the repeated click: the shared selection store is highlight-only by contract (factory-view.v1.md section 6), and the persisted params cannot change without creating new tabs. Option 2's event is a **new interface and is the user's call**. It is not claimed as internal permission.

Rejected: a nonce in params (a new tab per click); timers or polling; DOM-selection hacks; switching the factory on ordinary selection; a permanent factory/item dedupe key. Option 2 applies each click once by its sequence number, and an event published before a panel mounts is already carried by that panel's params.

## 3. Proposal 2, exact files and sections

- `wizbar/src/deck/selection/selection.ts`: `openWizDeck` publishes the event when the host accepted a focused open; new `WizDeckFocusEventV1`, `useWizDeckFocusEvent`.
- `wizbar/src/deck/home/Panel.tsx`: `WizDeckPanel` memoizes the focus per host `params` object.
- `wizbar/src/deck/home/Home.tsx` (D1 shell, focus section only): a request per tab open/reactivation or matching event; only a configured factory is selected (through D1's existing `select`, which drops the other factory's rows and in-flight answers); focus once per request after that factory's view loads; refreshes, rerenders, ordinary selection and manual factory switches never move focus; the picker gets `aria-label="Factory"` so D2's controls can coexist.
- `wizbar/src/deck/home/Home.test.tsx`: a host-equivalent tab model (serialized params, tab id with params, reactivation, active-only rendering, constant slot key, params memoized by `paramsJson`) driven by the real `openWizDeck`, and three named tests:
  - "selects the requested factory and focuses its exact item on every deliberate click, without new tabs". Bug: a click for factory A, with the panel on B, does not show or focus the item, and a second click after switching away does nothing. It also checks that the same item stays one tab and that a reactivated tab focuses again.
  - "never switches, scrolls or steals focus without a deliberate click". Bug: ordinary selection, a rerender, a background refresh or a manual switch back moving the factory, scrolling or taking focus.
  - "refuses an unknown factory and never shows a stale answer for the old factory". Bug: switching to an unconfigured factory, or a late answer for the old factory painting under the requested one.

## 4. Requirements and limits

- **User boundary:** Option 2's plugin-local `WizDeckFocusEventV1` / `useWizDeckFocusEvent` (a new interface).
- **Host boundary:** the sidebar → thread-panel opener (finding 4) needs a Cloudroom change before WizBar's Needs-you entry can open WizDeck at all. Option 2 makes the deck correct once the opener accepts; it cannot make the host accept.
- The harness models the cited host code; it is not the host. Split panes (one Home per pane) were not modelled.
