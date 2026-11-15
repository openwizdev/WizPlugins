# B1 (#76): explicit Needs-you focus — host trace and proposals

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

## 5. Round 2: two mounted panels and the recipient (Option 3)

The orchestrator rejected Option 2: a plugin-wide event matched by factory/item does not isolate its recipient. Round 2 evidence is in a scratch copy of B1 head `ea1d2d3`; nothing is applied to the branch.

### Who receives an open, by existing public information (Cloudroom `827a3d03`)

| Fact | Source |
| --- | --- |
| A panel's public identity is only its `threadId` and `params` props | SDK 0.6.33 `bb-plugin-sdk-app.d.ts`, `PluginThreadPanelProps` (lines 18122-18130); the opener returns only a boolean (`BbNavigate.openThreadPanel`) |
| Panel tab state is kept per thread | `views/thread-detail/ThreadDetailView.tsx:656`, `798-799` (`panelStateId: threadId`) |
| A thread is open in at most one pane: opening an open thread focuses its pane | `lib/split-layout/openThreadInSplit.ts:41-43`; `lib/split-layout/ops.ts` `findPaneByThread`; drag-drop "Already open — focus pane" (`lib/split-drag/zones.test.ts:102-110`) |
| Focusing a pane moves the route to that pane's thread | `views/thread-detail/SplitThreadArea.tsx:392-406` (`focusPane` → `navigate(paneContentRoute(...))`); also `422-426`, `439-443`, `513-518` |
| `useBbContext()` is the route's project and thread | `lib/plugin-sdk-hooks.ts:292-298` (`useRoomContext`) |
| Only the focused thread view publishes its panel opener | `views/thread-detail/ThreadDetailView.tsx:2528` (`usePublishThreadPanelOpener(handleOpenTimelinePluginPanel, isFocused)`); `components/plugin/plugin-thread-panel-navigation.tsx:38-64` |

So the thread whose panel an accepted open reaches is the focused pane's thread, which is the route's `threadId` at the click, and a mounted panel can compare that with its own `threadId` prop. No pane id, tab id or new host field is needed. Two limits: this relies on the host's route-follows-focus convention as read in source, and today the sidebar has no opener at all (finding 4), so the "focused pane" routing models the proposed upstream fix (resolved at invocation), not current behaviour. Not exhaustively proven: `navigateInPane` to a thread already open in another pane; the phone drawer; split secondary panes inside one thread view (one tab id renders in one place).

### Option 3: thread-addressed, claimed once — NEW interface (the user's boundary)

- `openWizDeck(navigate, focus, routeThreadId)`: a new third argument, the caller's `useBbContext().threadId`. After an accepted focused open with a non-null route thread it publishes `WizDeckFocusEventV1 { seq, threadId, focus, claimed }`, a new plugin-local event with an explicit thread field. Only the newest event exists. Never persisted or sent; params, `FocusRequestV1`, SDK, host and RPC are unchanged.
- `useWizDeckFocusEventSeq()` re-renders on a new event; `claimWizDeckFocus(threadId, focus)` returns the focus once, only to a panel of the addressed thread whose params carry that focus, and marks it claimed.
- `Home` gains a `threadId` prop (from `WizDeckPanel`'s own prop). It acts only on a claimed event. It selects a configured factory through D1's existing `select` (stale answers and the other factory's rows dropped), and focuses its own row (scoped to its root, since two panels can repeat an element id) once that view loads. It does not move focus if the route has left its thread meanwhile. Params alone (a restored tab), refreshes, rerenders, selection and manual switches never move focus. The picker is named "Factory".
- `NeedsYouEntry` (B1) passes `useBbContext().threadId`.
- D1 behaviour change: a tab restored with focus params no longer focuses on mount. D1's test "focuses only the item an explicit Needs-you open names" changes to an explicit open (`proposal-option3.diff`).

Files and sections: `wizbar/src/deck/selection/selection.ts` (`openWizDeck`, new event type and two functions); `wizbar/src/deck/home/Panel.tsx` (`WizDeckPanel` passes `threadId`); `wizbar/src/deck/home/Home.tsx` (props, the focus section, root ref, picker `aria-label`); `wizbar/src/deck/home/Home.test.tsx` (that one D1 test); new `wizbar/src/deck/home/focus-recipient.test.tsx`; `wizbar/src/sidebar-v4/NeedsYouEntry.tsx` (B1-owned; the route thread argument).

### Two-panel host-equivalent tests (`focus-recipient.test.tsx`)

The model has tab state per thread, a tab id from serialized params with reactivation, active-only rendering under a constant slot key, params memoized by `paramsJson`, a route equal to the focused pane, and an opener in mode `focused` (proposed upstream fix), `none` (today's sidebar) or `declined`. Each case names its bug:

1. Two mounted panels hold the same focus; a click switches and focuses only the focused pane's panel. Repeated identical clicks reuse each thread's one tab. Nothing scrolls.
2. No handler and declined opens publish nothing and change nothing.
3. A pane change while the requested data loads still selects the factory but never pulls focus back, even after a background refresh.
4. A click accepted while the panel is unmounted is delivered once on mount, never twice, and a disposed panel never acts.
5. Ordinary selection, rerenders, refreshes and manual switches never switch, scroll, steal focus or navigate.
6. An unknown factory is refused, and a late answer for the old factory never paints.

| Implementation | Result |
| --- | --- |
| Current D1 Home | `two-panel-red-current-home.log`: 5 of 7 fail on their claims; the two refusal cases pass as guards |
| Option 2 (global event) | `two-panel-red-option2-global.log`: 3 fail. Focus lands in the other pane's matching panel (line 171), focus is pulled back after a pane change, and the click replays on remount |
| Option 3 | `two-panel-green-option3.log`: all Home and two-panel tests pass (24); scratch full suite 898/898, typecheck clean; `git apply --check` passes on the branch |

Planted breaks against Option 3, each caught by exactly its own case: the claim ignoring the thread (case 1), focus ignoring a pane change (case 3), and an event never marked claimed (case 4). A true opener result is not proof of focus: every case asserts the focused element itself. All of this is a fixture model of cited host code, not the host.
