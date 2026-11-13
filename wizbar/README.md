# WizBar

WizBar is an agent-first Cloudroom sidebar plugin for fleets of agent threads,
version 0.3.0. It keeps T3 Sidebar's flat list of cards, newest first, that
never re-orders itself, with Inbox, Snoozed, Settled, Muted and Pinned shelves.
v0.3 adds richer cards, children on hover, a live running count with a stats
panel, drag to pin, and a `wizbar` CLI command with JSON for every sidebar
action. The project lives in
[openwizdev/wizplugins](https://github.com/openwizdev/wizplugins).

![WizBar rendered with synthetic example rows](../docs/images/wizbar.png)

The image shows the React UI rendered with synthetic fixture data and styling,
not an installed app. Everything below is proved by fixture tests in CI unless
it says otherwise. **Behaviour on a real host awaits the live check in
[#9](https://github.com/openwizdev/wizplugins/issues/9).** The rules and sources
are in the [v0.3 sidebar contract](contracts/sidebar-v3.v1.md).

## What v0.3 shows

- **Cards.** The third line shows the issue or pull request as a link and a
  child count, hidden at zero. The pull request comes from the host's sidebar
  state. With no host issue field, the issue number is parsed from a
  `room/<N>-…` branch name and shown only when it parses. The branch shows on
  hover only. Model and effort are omitted until the host exposes them; nothing
  is shown in their place. Cloud rows currently carry no branch or pull request
  in the observed host data, so they show no link.
- **Children.** Hover or focus the child count to list the children with
  status, title and age, in spawn order; click one to open it, or open the
  parent. In the thread header, the parent's children chip is off by default
  and a child's chip back to its parent is on by default; each has a setting.
- **Running count and stats.** A slim "N running" line stays below the list. A
  thread is running when it has runtime work and is not waiting on you. The
  footer bolt opens a stats panel: running threads split into top-level and
  children, Cloud, Local and unknown, plus threads waiting on you. It discloses
  that subagents are not counted and some threads may be unseen. "Finished
  today" says "not available yet": the host gives no finish time.
- **Drag to pin.** Drag a card into Pinned to pin it, out to unpin it, or
  inside Pinned to reorder it; Alt+Up and Alt+Down do the same from the
  keyboard. WizBar uses the host's own pins and pinned order. The Inbox stays
  newest-first.
- **Settings.** Switches for the list-bottom count, Cloud/Local row icons and
  the two header chips.

## Install

**From the BB Marketplace: not listed yet.** Publication waits for Jake's
go-ahead in [#45](https://github.com/openwizdev/wizplugins/issues/45); once
listed, install WizBar from the marketplace in the BB app or in Cloudroom.

**From source: Unverified.** Build, installation beside T3 Sidebar,
activation and live command execution remain unverified pending #9. The
desktop CLI's help supplies these preparation commands. Read the
[install and rollback kit](https://github.com/openwizdev/wizplugins/issues/9#issuecomment-6768833446)
and current desktop help before running them.

```sh
git clone https://github.com/openwizdev/wizplugins.git
cd wizplugins/wizbar
npm ci
room-cli plugin build .
room-cli plugin install .
room-cli plugin list
```

Record the current sidebar settings first. Select WizBar in
**Settings → Appearance → Sidebar**, or use
`room-cli settings ui set sidebar.threadListProvider "<wizbar-plugin-id>"`
with its ID from `plugin list`. Change `sidebar.navigationProvider` only if
T3 Sidebar is selected there. Keep T3 Sidebar installed until replacement is
accepted. Follow #9 for disabling it and rollback. WizBar imports no T3 parked
rows. Separate runtime IDs and data still need live verification.

## CLI

The registered namespace is `wizbar` (`room-cli wizbar …`). Every WizBar
action in the sidebar has a command, and every command takes `--json`; the
[parity test](src/cli-parity.test.ts) checks both, and that `children` and
`stats` JSON equal what the hover list and the stats panel show for the same
threads. The row menu's host-owned items are excluded by name (below). Use `--`
to end options before literal IDs.

```text
wizbar settle <id>... [--json]
wizbar unsettle <id>... [--json]
wizbar snooze <id>... --until <time> [--json]
wizbar unsnooze <id>... [--json]
wizbar mute <id>... [--json]
wizbar unmute <id>... [--json]
wizbar list <id>... [--json]
wizbar pin <id>... [--json]
wizbar unpin <id>... [--json]
wizbar move <id> (--before <id> | --after <id> | --first | --last) [--json]
wizbar children <id> [--json]
wizbar stats [--json]
```

**Exit codes**, every command: `0` success; `1` any thread or the whole command
failed; `2` usage error. A usage error with `--json` prints
`{"error":{"code":"usage","message":"<usage>"}}`.

**Per-ID commands** (`settle` to `unpin`) handle each ID on its own: one
failure never hides the others, and gives exit 1.

- `settle`, `unsettle`, `snooze`, `unsnooze`, `mute`, `unmute` and `list`
  print `{"results":[{"threadId","ok":true,"shelf","snoozedUntil"}]}`; a
  failed ID is `{"threadId","ok":false,"error":{"code","message"}}`. `list`
  reports the resolved shelf and snooze wake time.
- Only `snooze` takes `--until`: a future ISO timestamp with a timezone, or a
  sidebar preset `hour`, `evening`, `tomorrow` or `next-week`.
- `mute` is the running-thread exception for keeper-selected fleet work: it
  needs a running, unpinned thread with no pending input or failure. A
  question, failure or stopped work with newer unread attention returns the
  thread to the Inbox; `unmute` undoes it. See the
  [mute contract](contracts/mute.v1.md).
- `pin` and `unpin` print `{"results":[{"threadId","ok":true,"pinned":true}]}`.
  Pinning a pinned thread, or unpinning an unpinned one, succeeds and changes
  nothing.

**`move`** takes one pinned thread and one position and prints
`{"results":[{"threadId","ok":true,"pinned":true,"pinnedOrder":[…]}]}`, the
pinned order read after the move. Its errors include `not_pinned` and
`invalid_anchor`.

**`children <id>`** prints the thread's children, oldest first:

```json
{"parentThreadId":"thr_example_p","children":[{"id":"thr_example_c","status":"working","title":"Example child","model":null,"effort":null,"updatedAt":1794484800000}]}
```

Status is the first of `waiting`, `failed`, `working`, `unread`, `idle` that
holds. An unknown ID prints `{"error":{"code":"unknown_id",…}}` with exit 1.

**`stats`** prints the stats panel's numbers:

```json
{"version":1,"status":"ready","running":{"total":7,"topLevel":4,"children":3,"cloud":6,"local":1,"unknown":0},"waitingOnYou":2,"finishedToday":{"source":"none","count":null},"window":{"timeZone":"UTC","start":1794441600000,"end":1794528000000},"coverage":{"scope":"observable-sidebar","subagents":"not-counted","unseen":"possible"}}
```

`window` is today in the server's time zone. Unreadable thread state prints
`{"error":{"code":"state_unavailable",…}}` with exit 1, never a guessed number.

The values above are examples. The full JSON shapes and error codes are in
[section 7 of the contract](contracts/sidebar-v3.v1.md#7-cli). Live dispatch,
and the CLI matching the panel on a real host, await #9.

### Host-owned row-menu items

The right-click menu's Pin and Unpin are `wizbar pin` and `wizbar unpin`. Its
other items call the host's own thread actions, not WizBar's, so they have no
`wizbar` command. The parity test lists each by name, and fails on any menu
item that is neither a command nor listed here.

| Menu item | Agent route |
| --- | --- |
| Archive | `room-cli thread archive`, the host's own command. The help read for this change shows only `--self`; archiving another thread by ID is unverified |
| Mark read / Mark unread | **Gap:** no read-state route ([#60](https://github.com/openwizdev/wizplugins/issues/60), v0.4). For attention, `wizbar settle` and `wizbar mute` move a thread off the Inbox; neither changes the host's read state |
| Open in split | None: UI-only host navigation |
| Delete | None: UI-only, and it keeps the host's confirmation |

## Known limits

- Model and effort, a finish time and an issue field are not exposed by the
  host yet; WizBar omits or discloses them.
- Subagents are not counted; threads the sidebar does not see may be missing.
- Cloud rows carry no branch or pull request in observed host data.
- The real pinned order, footer placement and the stats panel's real look are
  unverified until #9. PR badges have appeared inconsistently on real hosts; a
  missing badge alone is not a WizBar regression.

## Credit and licence

Derived from Sawyer Hood's T3 Sidebar, copied from `plugins/t3sidebar` at commit
`d3424f24e2cebe91da4e72cb38feb023da808922`. The source tag is
`t3sidebar/v0.1.0` (a different commit from that copied snapshot). WizBar starts
with a fresh history and adds its own changes after the copy.
[Upstream source](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar).

The MIT licences retain Sawyer Hood's original notice at the repository root
and Michael Yong's original plugin notice in this folder. The root licence adds
the WizBar notice. See the [root LICENSE](../LICENSE), [plugin LICENSE](LICENSE)
and [public privacy and attribution audit](../docs/verification/public-audit.md).
