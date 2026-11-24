# WizBar

WizBar is an agent-first Cloudroom sidebar plugin for fleets of agent threads,
version 0.6.0. It keeps T3 Sidebar's cards, which never re-order themselves,
on Pinned, Unread, Snoozed, Muted and Settled shelves: Pinned in the host's
pinned order, Snoozed soonest wake first, and Unread, Muted and Settled newest
first.
v0.3 added richer cards, children on hover, a live running count, drag to pin,
and a `wizbar` CLI with JSON for the sidebar's thread actions. v0.4 added a
Specs section under the list, matrix status marks and a quiet footer with a
hover card. v0.5 fills the Specs section with live data from a specs producer,
matches real fleet thread titles to their spec, shows friendly model and effort
labels, takes the confirmed 0.4 design, splits what needs you into due now and
later, and lets you collapse Pinned, Inbox and Specs. v0.6 sorts the specs by
what needs you, folds finished and idle specs into Quiet, shows which specs are
moving, turns the Inbox into Unread, lets you reorder the sections, makes
Settled one link at the bottom, and keeps the running card steady. The project lives in
[openwizdev/WizPlugins](https://github.com/openwizdev/WizPlugins).

<img alt="WizBar rendered with synthetic example rows" src="../docs/images/wizbar.png" width="300">

The image shows WizBar's real sidebar component and compiled styles in a
headless browser, with synthetic data and a copy of the host's chrome around
it, not an installed app. Everything below is proved by fixture tests in CI unless
it says otherwise. 0.5.0 was installed from source and run on a real Cloudroom
host for its live check; 0.6.0 has not had a live check yet. What is not
covered is under Known limits. The rules and sources
are in the [v0.3 sidebar contract](contracts/sidebar-v3.v1.md) and the
[v0.4 specs section contract](contracts/specs-section.v1.md).

## What v0.6 changes

- **Sections you order.** The sidebar has three sections, Pinned, Specs and
  Unread, top to bottom by default. Drag a section by the faint grip on the left
  of its header (shown on hover), or focus its header and press Alt+Up or
  Alt+Down. The order is saved in the plugin setting `sectionsOrder`. Pinned
  shows while anything is pinned or a card is being dragged; Unread shows
  while it has a thread. Snoozed and Muted stay below the sections.
- **Unread** replaces the Inbox. Of the active, unpinned threads, newest first,
  it lists only one with something new for you (unread, waiting on your input,
  or the host's unread error, unread success or failed-queue marker), itself
  or in a child under its chip, that is not working for a spec (a running
  agent matched to a spec), not a fleet thread titled `Fleet #<N>: …`, and not
  a run of a fleet loop for a bound repository (`launch-fleet <owner>/<repo>`,
  `launch-fleet wakes <owner>/<repo>`, `launch-fleet #<N> <owner>/<repo>`).
  Any other thread is out of Unread until it has something new; search finds
  it. The host does not mark loop runs, so another loop's run with something
  new can still appear. Until the settings and the first specs read are
  known, the list does not fill, so no thread shows and then leaves. While a
  search is active, Unread drops its filter: it shows the matching active,
  unpinned threads in the current project scope, children included, read or
  not; matching snoozed, muted and settled threads stay on their own shelves.
  A 0.5 Inbox collapse carries over as an Unread collapse.
- **Settled** is not a section any more: one quiet `Settled N` link at the
  very bottom of the list opens it, and a search shows its matches.
- **Specs sort by what needs you.** Default order: specs with a ticket due
  now first, then the other unfinished specs, then finished ones, each group
  most recently active first. A small picker at the right of the Specs rule
  offers Needs you first, Recently active, Closest to done (highest done
  share, then fewest tickets left) and Newest (the specs file's order, within
  the main list and within Quiet: the producer lists each bound repository's specs newest first, one repository
  after another in the bound order, so across repositories an older spec can
  come before a newer one). The choice is saved in `specsSort`. A spec's activity is the
  newest of its tickets' last activity, their close times and its running
  agents' updates; a spec with none of these sorts last.
- **Quiet.** A spec with nothing due now that is finished, or has had no
  activity for more than 3 days, folds into one collapsed `Quiet N` group at
  the bottom of the Specs section, in the same order; open it like a spec, and
  its open state is remembered. `Specs N` counts the specs outside Quiet. A
  finished spec is no longer hidden: it is a quiet row, the running card names
  it, and `wizbar spec` accepts it like any other spec. A spec shows open only
  while it has running agents, so `wizbar spec <n> --open` on a finished spec
  with none saves the choice and reports `"open":false`. Only a spec with no
  tickets is hidden. The Quiet group itself opens from the sidebar only.
- **What is moving.** The dot of a ticket whose agent is working (not
  reviewing, not failed) breathes, unless the ticket is done or in review: one
  soft pulse every 2 seconds, every breathing dot in step. A review dot keeps a
  steady ring even while a working agent names its ticket, a done dot stays
  still, and a building ticket no agent is working on is a still ring. The breath stops under reduced motion and pauses while the
  sidebar is hidden or off screen. A spec with no running agents and nothing
  due now shows its name in the muted text colour.
- **A steady running card.** While the card is open, its rows stay in place,
  keyed by thread. Each thread's model and effort is kept for the session and
  shows at once. It is read again for a thread new to the running list, or
  when its last read is at least 5 minutes old (60 seconds when the card is
  reopened). While the card is open, a thread whose last read failed is read
  again once that read is 30 seconds old; these timed reads go out together,
  at most one batch a minute. A failed read never replaces a known label. A thread that stops running fades in place,
  and threads that left are removed together at most once every 3 seconds.
  Through a brief gap, `N running` keeps its last count; after 5 seconds it is
  marked last known while the card is open, and hidden once it is closed.
  The card shows awake, starting and asleep totals and scrolls through every
  running thread. Specs follow the sidebar's sort, with `Other` last. Click a
  group heading to fold or open it for the session. Untitled rows show a role
  and ticket when the fallback names one, or the harness name otherwise.
  The current heading stays visible as you scroll, and a fade shows
  when more rows are available. Run `npm run test:browser` from `wizbar/`
  to run the same Chromium regression as CI. Locally it uses Chrome or
  Chromium when available and skips with a message otherwise. Install
  Chromium with `npx playwright-core install chromium` or set
  `CHROMIUM_PATH` to select a browser. Set `WIZBAR_BROWSER_EVIDENCE=1`
  to save the four screenshots.
- **The producer** adds each ticket's last activity (`updatedAt`, from the
  issue's `updated_at` in the answer it already reads, no added requests) to
  `specs.v2.json` only; `specs.v1.json` is unchanged. WizBar 0.5.0 does not
  accept the new field, so it reads the v1 file instead, where later tickets
  count as needing you.
- **CLI.** `wizbar specs` takes `--sort <needs-you|recent|closest|newest>`
  (without it, the saved sort), lists quiet rows last, adds `sort` to the JSON
  and `quiet` and `activityAt` to each row, and ends a quiet row's text with
  ` · quiet`. `wizbar section` takes `unread` and still accepts `inbox` as the
  same section. The sort picker, the section order, the Quiet group and the
  Snoozed, Muted and Settled shelves' open state have no command.
- **Settings kept.** Every 0.5.0 setting reloads into 0.6.0 unchanged; the
  two new keys, `specsSort` and `sectionsOrder`, start at their defaults.

## What v0.5 added

- **Specs.** Under the thread list, a rule such as
  `Specs 24 · 5 tickets need you (3 specs)`, or `Specs 24 · 5 for you` when the
  full sentence does not fit; it counts only tickets due now. Then one row per
  running spec from the bound factory's specs file. A row leads with a chevron
  when the spec has running agents, then its name; on the right, "K needs you",
  `· N later` and "N done in the last hour", then done/total. One dot per ticket
  sits on the line below: done, done in the last hour (a brighter done dot),
  building (a ring, breathing from 0.6 while its agent is working), review (a
  ring), needs you (solid warning), later (a hollow ring), held (a grey ring),
  not started. From 0.6 finished specs are quiet, not hidden. A
  missing, malformed or stale specs file shows "Specs unavailable", never zero
  (with two files, only when neither is ready; see the producer below).
- **Due now and later.** Only an open ticket labelled `ready-for-human` splits:
  due now (needs you) when it has no open blockers, later when it has open
  blockers. A blocked ticket in any other state keeps that state. Only due-now tickets count in
  the rule and in "K needs you"; later tickets show as hollow rings and
  `· N later`, and `wizbar specs` reports both. When WizBar selects a legacy v1
  specs file, there is no separate later state. The producer folds those
  tickets into needs you in its v1 output.
- **Colours.** Done dots and the section rules use the host's success colour,
  or a neutral when the theme has none. "N done in the last hour" is the host's
  text colour. The warning colour marks needs you; a later ring is the warning
  hue at partial strength, never solid.
- **The specs producer.** Nothing in Cloudroom writes the specs file, so
  WizBar ships a small producer (`tools/specs-producer/`) that writes it from
  GitHub through your local `gh` login, REST only. It writes both
  `.openwiz/specs.v2.json` (with the later state) and `.openwiz/specs.v1.json`
  (as before, for an older WizBar), both or neither. WizBar uses the one that is
  ready when only one is; when both are ready, the newer `generatedAt` wins,
  v2 on a tie; when neither is ready, it shows "Specs unavailable". So the
  producer and WizBar can be upgraded in either order. `--gh`
  names the `gh` to run (default: `gh` on `PATH`). Each run is one complete
  scan, all or nothing: any failed read, or a scan needing more than 59
  requests, writes nothing and keeps the last files. Unchanged pages cost
  nothing against GitHub's rate limit, by ETag, and the run line reports how
  many requests came back 304 unchanged. Run it every 10 minutes as a systemd user timer; how to run
  it once, install the timer, remove it, and how many specs fit in 59 requests
  are in the [specs producer README](tools/specs-producer/README.md).
- **Host file reads.** WizBar reads the specs files and the factory's files
  from the host by absolute path: the bound factory's root joined with the
  file's relative path.
- **Collapsible sections.** Click the Pinned, Unread (0.5: Inbox) or Specs
  header to collapse or expand it; every section starts expanded. The state is
  saved in the plugin setting `sectionsCollapsed`, so it is remembered. While a
  search is active, Pinned and Unread show their matches even when collapsed,
  and their headers do nothing. `wizbar section` does the same from the CLI.
- **Open a spec.** Click a spec to open it in a raised panel with its running
  builders and reviewers; specs start collapsed and each one's open state is
  remembered. Real fleet titles match their spec: `#<N>: …` is ticket N's
  builder, `Review #<P> at <sha>` reviews the ticket whose pull request is P,
  and the children of `Fleet #<S>: …` belong to spec S (the fleet thread
  itself is not listed); the older `Role · CODE: …` form still matches. An
  agent row reads
  `Builder · EN3:` dimmed, then the task, then its age; its second line is the
  harness logo and the model and effort.
- **Model and effort** in friendly words: `Opus 5.5 · High`, `Sol 6.1 · XHigh`,
  from the host's resolved execution options for the thread, whatever source
  the host names for them. When the host answers with no options, the model
  comes from the thread's context snapshot and effort is left out. On cards
  they are quiet text. An unknown model is shown as it is; a missing one is omitted,
  never guessed. JSON keeps the raw ids and adds `modelLabel`.
- **Matrix marks.** A quiet 3 × 3 mark on each running agent row, the footer
  and its card: working is one light chasing round the ring, checks running
  pulses the middle row, reviewing lights the corners and centre, needs you is
  all warning, failed is a red X, done is all the done colour, idle is the
  centre only.
  No mark uses the accent colour. Reduced motion shows the still pattern.
  Thread cards show no mark.
- **Shelves.** Pinned, Unread, Snoozed and Muted use the same done-colour
  rule as Specs. A parked shelf reads `Snoozed 4` with no chevron; a click
  still opens it. A running card shows its age (`now`) in the corner.
- **Footer.** No bolt: a matrix mark and `6 running`, counting threads, never
  subagents. Hover or focus it for a raised card across the sidebar: how many
  threads are waiting on you, the cloud and local split, a bar split by harness
  with each harness's name and count, then the running threads, one line each with its
  mark, role and code, its spec (from 0.6 a finished spec too), and model · effort. A click (or Enter or
  Space) pins the card open and another unpins it; Escape closes it; clicking a
  thread in the card opens it.
- **GitHub** is a quiet hover mark that opens the spec issue or the agent's
  pull request.
- **Theme.** Every colour is a host theme variable, so WizBar follows the
  Cloudroom theme you use; a literal colour appears only as the fallback for a
  missing variable.
- **CLI.** `wizbar specs`, `wizbar spec <n> --open|--close`,
  `wizbar section <pinned|specs|unread> --collapse|--expand`, the extended
  `wizbar stats` and the read-only `wizbar models <id>... [--raw]` return what
  the sidebar shows, as JSON with `--json`.

The matrix status idea is credited to Conductor's workspace status matrix
(Conductor changelog 0.85.0 to 0.96.0); idea only, no code or artwork.

## What v0.3 added

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
- **Running count.** A slim "N running" line stays below the list. A thread is
  running when it has runtime work and is not waiting on you. (v0.3's footer
  bolt and stats panel became v0.4's hover card above.)
- **Drag to pin.** Drag a card into Pinned to pin it, out to unpin it, or
  inside Pinned to reorder it; Alt+Up and Alt+Down do the same from the
  keyboard. WizBar uses the host's own pins and pinned order. Unread (0.5:
  the Inbox) stays newest first.
- **Settings.** Switches for the list-bottom count, Cloud/Local row icons and
  the two header chips.

## Install

**From the BB Marketplace:** 0.6.0 is the release being prepared, not
published. The marketplace serves it only once both hold: the `wizbar/v0.6.0`
release tag exists, and the registry's WizBar entry has the range `^0.6.0`
(this repository's [marketplace entry](../marketplace/wizbar.json) has it).
Until then the listing serves what the registry's current range resolves to.

**From source.** These steps were run for 0.5.0 on a real Cloudroom host for
its live check: build, install, reload, and an upgrade from 0.3.0 that kept
WizBar's settings; they have not been run for 0.6.0 on a real host yet. The
0.5.0 to 0.6.0 settings reload is proved by a fixture test
([`src/upgrade-050.test.ts`](src/upgrade-050.test.ts)). `room-cli plugin build .` builds the plugin into `dist/`.
To fill the Specs section, also set up the
[specs producer](tools/specs-producer/README.md). The
desktop CLI's help supplies these preparation commands. Read the
[install and rollback kit](https://github.com/openwizdev/WizPlugins/issues/9#issuecomment-6768833446)
and current desktop help before running them.

```sh
git clone https://github.com/openwizdev/WizPlugins.git
cd WizPlugins/wizbar
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

The registered namespace is `wizbar` (`room-cli wizbar …`). The commands
cover these sidebar actions: settle, unsettle, snooze, unsnooze, mute,
unmute, pin, unpin and move a thread; list a thread's shelf and its children;
read the running card (`stats`) and the specs (`specs`, in any sort with
`--sort`, without saving it); open or close one spec (`spec`); and collapse or
expand Pinned, Specs or Unread (`section`, with `inbox` as Unread). There is
no command for the Specs sort picker, the section order, the Quiet group, or
opening the Snoozed, Muted and Settled shelves. Every command takes `--json`;
the [parity test](src/cli-parity.test.ts) checks that every WizBar operation
has a command and `--json`, and that `children` and
`stats` JSON equal what the hover list and the running line's hover card show
for the same threads. The row menu's host-owned items are excluded by name (below). Use `--`
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
wizbar specs [--sort <needs-you|recent|closest|newest>] [--json]
wizbar spec <n> (--open | --close) [--json]
wizbar section <pinned|specs|unread> (--collapse | --expand) [--json]
wizbar models <id>... [--raw] [--json]
```

**Exit codes**, every command: `0` success; `1` any thread or the whole command
failed; `2` usage error. The exception is `models`: a failed host read gives
that thread a null model and effort with exit `0`, so check the returned
fields. With `--raw`, the per-thread error status comes from the default
execution-options read. If that read returns null and the context fallback
fails, `contextModel` is null and has no separate error status.
A usage error with `--json` prints
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
  thread to the active list, where Unread shows it if it has something new;
  `unmute` undoes it. See the
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

**`stats`** prints the hover card's data: 0.3's numbers at `version: 2`, plus
the harness split and every running thread with its matrix state, visible spec
and model and effort (null when the host gives none):

```json
{"version":2,"status":"ready","running":{"total":2,"topLevel":0,"children":2,"cloud":2,"local":0,"unknown":0},"waitingOnYou":1,"finishedToday":{"source":"none","count":null},"window":{"timeZone":"UTC","start":1795046400000,"end":1795132800000},"coverage":{"scope":"observable-sidebar","subagents":"not-counted","unseen":"possible"},"harness":[{"providerId":"sample-harness","count":2}],"threads":[{"id":"thr_v4_example","title":"Builder · SP-2: Example work","providerId":"sample-harness","matrix":"working","spec":"example/sample-plans#501","shortName":"Example spec","model":null,"effort":null}]}
```

`window` is today in the server's time zone. A thread names a spec only when
the specs file is ready and the spec is visible. Unreadable thread state prints
`{"error":{"code":"state_unavailable",…}}` with exit 1, never a guessed number.

**`specs`** prints the visible spec rows with their running agents, in the
saved sort or the `--sort` given, quiet rows last; the JSON adds `sort`, and
each row `quiet` and `activityAt` (epoch ms or null). **`spec`** saves one
spec's open or closed state, finished specs included, and reports the state the
sidebar shows: a spec is open only while it has running agents, so `--open` on
a spec with none prints `"open":false` with exit 0. An unavailable specs
file prints `{"error":{"code":"specs_unavailable",…,"reason":…}}` with exit 1.

**`section`** collapses or expands one sidebar section, the same as a click
on its header, and prints `{"section":"unread","collapsed":true}`; `inbox` is
accepted as `unread`. A failed
settings read or write prints `{"error":{"code":"settings_failed",…}}` with
exit 1 and writes nothing from a failed read.

**`models`** is read-only: each thread's model and effort as WizBar reads
them, `{"models":[{"threadId","model","effort","modelLabel"}]}`, `modelLabel`
only when there is a model. With `--raw`
each item adds the host's raw answer and any context fallback model.

The values above are examples. The full JSON shapes and error codes are in
[section 7 of the v0.3 contract](contracts/sidebar-v3.v1.md#7-cli) and
[section 8 of the v0.4 contract](contracts/specs-section.v1.md#8-cli). Live dispatch,
and the CLI matching the hover card on a real host, await #9.

### Host-owned row-menu items

The right-click menu's Pin and Unpin are `wizbar pin` and `wizbar unpin`. Its
other items call the host's own thread actions, not WizBar's, so they have no
`wizbar` command. The parity test lists each by name, and fails on any menu
item that is neither a command nor listed here.

| Menu item | Agent route |
| --- | --- |
| Archive | `room-cli thread archive`, the host's own command. The help read for this change shows only `--self`; archiving another thread by ID is unverified |
| Mark read / Mark unread | **Gap:** no read-state route ([#60](https://github.com/openwizdev/WizPlugins/issues/60), v0.4). For attention, `wizbar settle` and `wizbar mute` move a thread off Unread; neither changes the host's read state |
| Open in split | None: UI-only host navigation |
| Delete | None: UI-only, and it keeps the host's confirmation |

## Known limits

- A finish time and an issue field are not exposed by the host yet; WizBar
  omits or discloses them.
- Subagents are not counted; threads the sidebar does not see may be missing.
- Cloud rows carry no branch or pull request in observed host data.
- The real pinned order, footer placement, the hover card's real look and
  rollback to T3 Sidebar are unverified until #9. PR badges have appeared
  inconsistently on real hosts; a missing badge alone is not a WizBar regression.
- 0.6.0 has not been installed on a real host: the breath, section drag,
  Unread's filter on real threads and the steady card are proved by fixture
  tests only.
- Unread cannot tell another loop's run from a thread you started: the host
  does not mark loop runs.

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
