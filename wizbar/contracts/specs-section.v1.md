# WizBar specs section contract v1 — WB4-0 / openwizdev/OpenWiz#1434

Status: the contract-first record for WizBar 0.4 (spec openwizdev/OpenWiz#1433, plan revision 1). It defines shapes, sources and rules before any 0.4 code. Fixtures prove no host behaviour: everything about the real host, the real specs file and the owner's theme stays Unverified until the live check (WB4-4, openwizdev/OpenWiz#1438).

Relies on [sidebar-v3.v1.md](sidebar-v3.v1.md): its input rows, both readers, the shared working fact, the running rule, the `cardModels` RPC, the children list, stats and the CLI conventions. Nothing here changes the 0.3 thread list (Pinned, Inbox, Settled) or any 0.3 rule unless a section says so.

Sources, read 2026-11-19 from the locked packages in `wizbar/package-lock.json`:

- **SDK 0.6.33** declarations in `@get-bb/plugin-sdk/bundled-types/`: `bb-plugin-sdk.d.ts` (`ThreadsArea.defaultExecutionOptions`, `resolvedThreadExecutionOptionsSchema`, `FilesArea.read`, `threadResponseSchema.providerId`) and `bb-plugin-sdk-app.d.ts` (`PluginSidebarThread`, `PluginSidebarPullRequest`, `openUrl`). The SDK declares **no CSS variable names**.
- **bb-app 0.37.0** (the locked dev dependency): its app stylesheet defines the theme variables named in section 9. That is a package observation, not an SDK declaration.
- Existing contracts: [sidebar-v3.v1.md](sidebar-v3.v1.md), [settings.v1.md](settings.v1.md), [factory-view.v1.md](factory-view.v1.md) (the factory binding and its file read).
- The ticket's Theme bullet (the owner, 2026-11-19), with the owner's sampled sidebar values.

Shapes and synthetic fixtures with hand-worked expected values: `src/fixtures/v4.ts`, checked by `src/fixtures/v4-fixtures.test.ts`. The section numbers below are the ones the fixtures and tests cite.

## 1. The specs file

The factory map's specs file lists the running specs and their tickets. Its producer runs on the owner's computer and refreshes it every 10 minutes. This contract fixes the format WizBar reads. The producer is `wizbar/tools/specs-producer/` (0.5.0 A, openwizdev/WizPlugins#110; its README says how it reads GitHub and how to run it on a timer); installing it on the owner's computer stays the owner's step.

**Location and read.** UTF-8 JSON at `.openwiz/specs.v1.json`, relative to `home.rootPath` of the one factory bound in the `wizdeckFactories` setting (factory-view.v1.md section 1). WizBar's server reads it with `bb.sdk.files.read({ hostId, rootPath, path })`, the factory contract's read, at most once per 60-second shared refresh. With no bound factory, or more than one, the result is unavailable (`no-binding`).

**Fields** (`SpecsFileV4`). Every object is closed: an unknown field is malformed.

| Field | Rule |
| --- | --- |
| `schema` | Exactly `openwiz.specs.v1` |
| `generatedAt` | UTC ISO timestamp ending `Z`: how fresh the file's data is. The 0.5.0 producer writes the read time of the oldest GitHub page whose data is in the file |
| `specs` | The running specs, in the producer's order; may be empty |

Each spec (`SpecEntryV4`):

| Field | Rule |
| --- | --- |
| `spec` | Repository-qualified issue, `owner/name#N` (N a positive safe integer, no leading zero). Distinct within the file |
| `shortName` | 1–40 characters after trimming: the row's name |
| `url` | `https://github.com/<owner>/<name>/issues/<N>`, matching `spec` |
| `fleetThreadId` | The spec's fleet thread ID, or null |
| `tickets` | The spec's tickets, in the spec's order; may be empty |

Each ticket (`TicketEntryV4`):

| Field | Rule |
| --- | --- |
| `ticket` | `owner/name#N`, distinct within its spec |
| `code` | The ticket code (`^[A-Z][A-Z0-9]*-?[0-9]+$`, for example `KN3` or `WB4-1`), or null. Distinct within its spec when not null |
| `title` | Nonempty |
| `state` | `done`, `building`, `review`, `needs-you`, `held` or `not-started` (below) |
| `closedAt` | The close time, a UTC ISO timestamp ending `Z`, for `done`; null for a `done` ticket closed before close times were recorded; always null for every other state |
| `pulls` | Optional (additive, 0.5.0 A): the numbers (positive safe integers) of the open pull requests in the ticket's repository that close it |

Ticket states, set by the producer, first match wins: `done` closed (as completed); `needs-you` the `ready-for-human` label; `held` the `held` or `needs-info` label; `review` an open pull request closes it; `building` only draft pull requests close it; `not-started` anything else that is open. A ticket closed as not planned is left out of the file. The producer writes `fleetThreadId` null (it reads GitHub only), a spec's `shortName` from its title after `spec: ` and before the next `: `, and a ticket's `code` from the `[A-Z]{1,3}[0-9]+` just before its title's first `:`.

**Reading** (`readSpecsFile(read, now)`), first match wins. Every failure is unavailable, never zero:

| Input | Result |
| --- | --- |
| No binding, or several | `unavailable`, `no-binding` |
| The file does not exist | `unavailable`, `missing` |
| The read failed | `unavailable`, `unreadable` |
| Not JSON, a repeated key in any object, a top level that is not an object, or no `schema` string | `unavailable`, `malformed` |
| A `schema` string other than `openwiz.specs.v1` | `unavailable`, `unknown-schema` |
| Once the schema matches: wrong shape, an unknown field, a broken field rule above, or `generatedAt` more than 5 minutes after `now` | `unavailable`, `malformed` |
| `now − generatedAt` over 30 minutes (exactly 30 minutes is fresh) | `unavailable`, `stale` |
| Otherwise | `ready`, with the file |

An unavailable file shows "Specs unavailable" and no rows, never "Specs 0". A ready file with no specs, or with only hidden ones, shows the section rule with no rows (`Specs 0`).

## 2. The spec row

One row per visible spec, in file order (`SpecRowV4`). All counts are over the spec's tickets at `now`:

| Field | Exact definition |
| --- | --- |
| `spec`, `shortName`, `url` | From the file |
| `done` | Tickets in state `done` |
| `total` | All tickets in the file for this spec |
| `doneLastHour` | `done` tickets whose `closedAt` is not null and `closedAt > now − 60 minutes` (a close time just after `now`, from clock skew, counts) |
| `needsYou` | Tickets in state `needs-you` |
| `dots` | One dot per ticket, ordered by dot state (below), then by file order |
| `agents` | The spec's running agents (section 3) |
| `open` | The open-state setting for this spec (section 4) |

**Dot states,** in this order: `done` (done, not in the last hour, including a null `closedAt`), `done-recent` (done in the last hour), `building`, `review`, `needs-you`, `held`, `not-started`. "Being worked on" is `building` and `review`; "the owner's" is `needs-you`.

**Text.** `N done in the last hour` appears only when `doneLastHour > 0`; `K needs you` (amber) only when `needsYou > 0`; done/total is `<done>/<total>`.

**Layout (display only, 0.5.0 C, #112).** A spec row leads with a chevron (`›` closed, `⌄` open) only when the spec has agents, and a placeholder of the same width otherwise, so names line up. The name sits on the left; on the right come `K needs you`, then `N done in the last hour`, then done/total. The dots sit on the line below. An open spec and its agents sit in one raised panel (the card colour, rounded corners). An agent row's first line is its matrix mark, its title with `Role · CODE:` dimmed and the task in the foreground colour, and its age on the right; its second line is quiet: the harness logo (its display name as the logo's label), then the shared model label, omitted when unknown.

**Hidden.** A spec is hidden when `total === 0` or `done === total` (finished). A hidden spec has no row and counts nowhere, in the UI and the CLI.

**Section rule.** `Specs N` where N is the number of visible rows, then ` · M need you` when M (the sum of `needsYou` over visible rows) is over zero. On screen (0.5.0 C) the label is about 11.5 px, weight 500, in muted text, the count is faint, ` · M need you` is in the warning colour, and an olive rule line follows.

## 3. Matching running threads to a spec

The input is the 0.3 rows (sidebar-v3.v1.md section 1). Only **running** rows match: working by the shared fact and `hasPendingInteraction` false.

**Title parse** (the thread-naming rule `Role · CODE: what it does`): the `displayTitle` matches `^(.+?) · ([A-Z][A-Z0-9]*-?[0-9]+): (.+)$` (the separator is a space, U+00B7, a space). Group 1 is the role, group 2 the code.

**Real titles** (additive, 0.5.0 A), tried first: a title in a real form is never read as the form above, even when its free text holds ` · CODE:`.

| Title | Role | Names |
| --- | --- | --- |
| `^Fleet #([1-9][0-9]*): (.+)$` | none | Spec S's fleet thread. It is never an agent and matches no spec |
| `^#([1-9][0-9]*): (.+)$` | `Builder` | The ticket whose issue number is N |
| `^Review #([1-9][0-9]*) at [0-9a-f]{7,40}( .*)?$` | `Reviewer` | The ticket whose `pulls` holds P |

Anything else gives no role and no code. A real title's code is its ticket's `code` in the matched spec. A spec holds the title's ticket when any of its tickets matches; the agent's `ticket` (and its code) is set only when exactly one does, so a pull closing two tickets of one spec keeps its reviewer there with no ticket.

**Which spec,** first match wins:

1. **Fleet parent,** only when the row's `parentThreadId` is not null. The specs whose `fleetThreadId` is not null and equals it; when there are none, and the parent row is titled `Fleet #S: …`, the specs whose issue number is S. Exactly one: that spec. Several: the one among them holding the title's ticket; if not exactly one, no spec. None, or a top-level row: rule 2. A missing ID never matches a missing ID.
2. **The title's ticket.** The specs holding the ticket the title names: by `code` (`Role · CODE:`), by issue number (`#N:`) or by `pulls` (`Review #P at`). Exactly one: that spec. Zero or several: no spec.

Hidden specs take part in matching, so an agent of a finished spec is matched to it and appears in no spec row (the hover card lists it with no spec). A row matching no spec appears in no spec; it still counts in "N running" and the hover card (section 7). The fleet thread itself matches only by rule 2.

**Each agent** (`SpecAgentV4`): `threadId`, `title` (the `displayTitle`; for a real `#N:` or `Review #P at` title whose ticket is in the spec, `<Role> · <code>: <ticket title without its version and code>`, with `#N` in place of a null code), `role` and `code` (from the parse, or the ticket's code, or null), `ticket` (the spec's ticket the title names, or null), `providerId` (the row's harness), `model` and `effort` (section 6), `matrix` (section 5), `createdAt` and `updatedAt`. Order: `createdAt` ascending, then `threadId`.

A visible spec with no agents still has its row; it shows no chevron and cannot open.

## 4. The open-state setting

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `specsOpen` | string | `"[]"` | A JSON array of the spec keys (`owner/name#N`) that are open |

Declared in `wizbarSettingDescriptors` (by WB4-1) with the settings.v1.md store and write rule; this contract is the key's record, and settings.v1.md is not changed here. Every spec starts collapsed. A key missing from the array, a missing setting, or a value that is not a JSON array of strings reads as collapsed for every spec (fail closed). Opening adds the key once; closing removes it; both are idempotent. Keys of specs no longer listed are kept and ignored, so a spec that comes back keeps its state.

**Effective open state** (`effectiveOpen` in `wizbar/src/specs/open-state.ts`): a visible spec shows open exactly when its key is in the array and it has at least one agent (section 3). A spec with no agents shows closed whatever is stored; its stored key stays, so it opens once agents run. The row's `open` (section 2) is the stored state; the sidebar and `wizbar spec` both report the effective one.

**Changing it.** Each change reads the stored array, then writes it back with only that spec's key added or removed, one change at a time on the server, so overlapping changes keep each other's key. A settings read that fails never becomes a write: a change fails with `settings_failed` and the stored array is unchanged. Only display falls back to every spec collapsed.

## 5. Matrix status

A small 3 × 3 dot mark on each running thread (inside an open spec, and on the 0.3 running thread cards). Inputs: the row, and in the app only, the row's pull request (`experimental_useSidebarThreadPullRequest(id).pullRequest`; the server has no pull request, so it passes null). First match wins:

| State | Rule |
| --- | --- |
| `needs-you` | `hasPendingInteraction` |
| `failed` | `status === "error"`, `runtimeStatus === "error"` or `queuedWork === "failed"` (the mute failure rule) |
| `reviewing` | Working (shared fact) and the parsed role is exactly `Reviewer` |
| `working` | Working (shared fact) |
| `failed` | Pull request `open` or `draft` with `experimental_checks.state === "failing"` |
| `checks-running` | Pull request `open` or `draft` with `experimental_checks.state === "pending"` |
| `done` | Pull request `merged` |
| `idle` | Otherwise |

A running row is working and not waiting, so it never shows `needs-you`, and it still counts as running when it shows `failed`: inside a spec, in the hover card and in `wizbar stats --json`, a running row shows `failed` (an error status or failed queued work), else `reviewing` or `working`. The server and the app compute these rows alike, so the CLI and the app agree there. The pull-request states appear only on 0.3 cards in the app.

**Marks** (0.5: quiet grey marks, idea credited to Conductor's workspace status matrix). Each mark is 3 × 3 dots in an 11 px square. Masks are row-major, `1` lit, and give the still pattern. Unlit dots are dim, a visible grey. No mark uses the accent: only needs you, failed and done are coloured.

| State | Mask | Colour | Motion |
| --- | --- | --- | --- |
| `working` | `100000000` | bright | `chase`: a bright lead dot steps clockwise round the outer ring (0, 1, 2, 5, 8, 7, 6, 3), 150 ms a step, with a tail of two fading dots behind it (muted text, then faint); every other dot stays dim |
| `checks-running` | `000111000` | muted text | `pulse`: the middle row pulses, left to right |
| `reviewing` | `101010101` | muted text | none |
| `needs-you` | `111111111` | warning | none |
| `failed` | `101010101` | destructive | none |
| `done` | `111111111` | muted accent | none |
| `idle` | `000010000` | faint | none |

`reviewing` (corners and centre) and `failed` (an X) share a shape and differ by colour. Reduced motion (`prefers-reduced-motion: reduce`) shows each still pattern: `working` shows the chase's first frame, its lead on dot 0 and its tail on dots 3 and 6. Colours: muted accent and warning are section 9's tokens; bright is `var(--foreground)`; muted text is `var(--muted-foreground, #b7b7b7)`; faint is `color-mix(in oklch, var(--muted-foreground, #b7b7b7) 65%, var(--sidebar, #161616))`; dim is `color-mix(in oklch, var(--muted-foreground, #b7b7b7) 35%, var(--sidebar, #161616))`; destructive is `var(--destructive)`. Each fixture row keeps `animated` (true when it has motion) and adds `motion` (`chase`, `pulse` or null) and `tail` (the chase's fading colours, lead first; empty otherwise).

## 6. Harness, model and effort

- **Harness:** the row's `providerId` (the sidebar row's provider). This contract adds one row to sidebar-v3's CLI mapping: `providerId` from the raw row's same-named field (`threadResponseSchema.providerId`). The app shows the provider's logo and `displayName` from `experimental_useProviders()`; the JSON carries the ID.
- **Model and effort source:** `bb.sdk.threads.defaultExecutionOptions({ threadId })`, the host's resolved execution options (`ResolvedThreadExecutionOptions | null`). WizBar uses `model` and `reasoningLevel` only when the result is not null and its `source` is exactly `client/turn/start` (the latest turn start); any other source or null gives nulls. Served through 0.3's `cardModels` RPC.
- **Adoption gate:** `modelSourceV4.adopted` is `true` from WizBar 0.5.0 (#111). The RPC serves `source: "host"`: each thread's resolved model and effort under the rule above, and nulls for a thread the host has no options for (or whose read fails). The live check is the owner's look at the 0.5.0 candidate: a thread started with a known harness, model and effort shows them. Until then it is **not claimed live**; if they differ, the gate closes again and the host ask is filed.
- **Display:** `<Model> · <Effort>` in friendly names from one module (`src/model-names.ts`), e.g. `Opus 5.5 · High`, `Sol 6.1 · XHigh`; model alone when effort is null; nothing when model is null. Missing values are omitted, never guessed.
- **Friendly names:** `claude-<family>-<major>-<minor>` → `<Family> <major>.<minor>` for `opus`, `sonnet`, `haiku` and `fable` (`claude-opus-5-5` → `Opus 5.5`); `gpt-<version>-<family>` → `<Family> <version>` for `sol` and `terra` (`gpt-6.1-sol` → `Sol 6.1`). Any other id is shown as it is (trimmed), never mapped to another model. Effort `low|medium|high|xhigh|max` → `Low|Medium|High|XHigh|Max`; other levels capitalised. Harness `claude-code` → `Claude Code`, `codex` → `Codex`, any other id title-cased word by word (`harnessName`, exported for the hover card).
- **JSON:** the `cardModels` RPC and the `children`, `stats` and `specs` JSON keep the raw `model` and `effort` ids. The three CLI bodies add `modelLabel` (the display string) beside them on each child, running thread and agent, present only when the model is known.

## 7. Footer and hover card

- **No bolt.** WizBar registers no `experimental_sidebarFooter` item. The 0.3 `stats` disclosure and its `Zap` icon go; sidebar-v3 section 6 is replaced by this section.
- **"N running"** stays the list-bottom line: `running.total` by the 0.3 running rule, threads only. Subagents (background agents) are never counted: a thread running background agents counts once (`thr_v4_builder_a` in the fixtures). `footerCountEnabled` still gates it; it is hidden while unavailable, as #37 left it.
- **Hover card data** is exactly `wizbar stats --json` (section 8, `StatsV4`) for the same rows, at the same `now`:
  1. one line: `<W> waiting on you · Cloud <C> · Local <L>`, then ` · Unknown <U>` only when U > 0;
  2. the harness split: `harness`, running rows counted by `providerId`, count descending, then `providerId` ascending;
  3. every running thread (`threads`): matrix mark, title, its spec's `shortName` (or nothing when it matches no spec, including a hidden spec), and model · effort when present. Order: `createdAt` ascending, then ID.
- **Hover and pin** (`v4CardPinCases`). The card is `closed`, `hover` or `pinned`. On "N running": pointer enter or keyboard focus opens `closed` to `hover`; pointer leave or blur closes `hover`; a click (or Enter or Space) pins `closed` or `hover`, and unpins `pinned` to `hover`; leave and blur keep `pinned`; Escape closes either. Clicking a thread in the card opens it with `experimental_useSidebarThreadActions().open(id)`.

## 8. CLI

Extends the `wizbar` registration under sidebar-v3 section 7: same parser, `--json` once, `--` before literal arguments, unknown flags and missing arguments are usage errors. Every 0.3 operation is unchanged except `stats`, extended below. Exit codes are 0.3's: `0` success, `1` failure, `2` usage.

New error codes:

| Code | Meaning | Commands |
| --- | --- | --- |
| `specs_unavailable` | The specs file is unavailable (section 1); the JSON adds `reason` | `specs`, `spec` |
| `unknown_spec` | No visible spec matches | `spec` |
| `ambiguous_spec` | A bare number matches visible specs in several repositories | `spec` |
| `settings_failed` | The settings read failed (nothing is written), or the host refused or failed the settings write | `spec` |

`state_unavailable` (0.3) still means the thread rows could not be read; `specs` and `spec` need both the file and the rows (`spec` reads the rows before it writes).

### `wizbar specs [--json]`

No arguments, else usage. The visible rows of section 2 with their agents.

```json
{"version":1,"status":"ready","generatedAt":1795089300000,"needsYou":1,"specs":[{"spec":"example/sample-plans#501","shortName":"Sample palette","url":"https://github.com/example/sample-plans/issues/501","done":2,"total":6,"doneLastHour":1,"needsYou":1,"open":true,"dots":[{"ticket":"example/sample-plans#502","code":"SP-0","state":"done"}],"agents":[{"threadId":"thr_v4_builder_a","title":"Builder · SP-2: Sample add keyboard paths","role":"Builder","code":"SP-2","ticket":"example/sample-plans#504","providerId":"sample-harness","model":null,"effort":null,"matrix":"working","createdAt":1795081200000,"updatedAt":1795089540000}]}]}
```

(The example's `dots` and `agents` are shortened.) `generatedAt` is epoch ms. Unavailable file: `{"error":{"code":"specs_unavailable","message":"Specs unavailable.","reason":"stale"}}`, exit 1. Text:

```text
Specs 1 · 1 need you
example/sample-plans#501 Sample palette: 2/6 · 1 done in the last hour · 1 needs you · 1 running
```

The two middle parts appear only when non-zero; `· N running` only when agents exist. Unavailable: `Specs unavailable (stale)` on stderr, exit 1.

### `wizbar spec <n> (--open | --close) [--json]`

Exactly one spec reference and exactly one of `--open`/`--close`, else usage. `<n>` is `owner/name#N`, or a bare `N` that matches exactly one visible spec's number. It needs a ready specs file and the thread rows. It changes the `specsOpen` setting as section 4 says and reports the effective open state (section 4) from the value read back, so it says what the sidebar shows: on a visible spec with no agents, `--open` saves the key and reports `"open":false`, exit 0 (`v4SpecOpenCases`).

```json
{"spec":"example/sample-plans#501","open":true}
```

Text: `example/sample-plans#501: open` or `: closed`. Errors: `{"error":{"code":"unknown_spec","message":"Unknown spec."}}` and the other codes above, exit 1.

### `wizbar stats [--json]` (extended)

`StatsV4` is 0.3's `StatsV3` with `version: 2` and two more fields, both null when `status` is `unavailable`:

- `harness`: `{ providerId, count }[]` (section 7).
- `threads`: `{ id, title, providerId, matrix, spec, shortName, model, effort }[]`; `spec` and `shortName` null for a thread matching no visible spec.

```json
{"version":2,"status":"ready","running":{"total":2,"topLevel":0,"children":2,"cloud":2,"local":0,"unknown":0},"waitingOnYou":1,"finishedToday":{"source":"none","count":null},"window":{"timeZone":"UTC","start":1795046400000,"end":1795132800000},"coverage":{"scope":"observable-sidebar","subagents":"not-counted","unseen":"possible"},"harness":[{"providerId":"sample-harness","count":2}],"threads":[{"id":"thr_v4_builder_a","title":"Builder · SP-2: Sample add keyboard paths","providerId":"sample-harness","matrix":"working","spec":"example/sample-plans#501","shortName":"Sample palette","model":null,"effort":null}]}
```

(The example's `threads` is shortened.) Text: the 0.3 lines, then `Harness: sample-harness 2`, then one line per thread, `"<id>": <matrix> <title> [<shortName>]`.

## 9. Theme

WizBar matches the host's theme, not the Ember map palette. Every colour is a host theme variable (a CSS custom property the host provides), so WizBar follows whichever theme the owner picks.

| Role | Host variable | Fallback, only when the variable is missing | Fallback source |
| --- | --- | --- | --- |
| surface | `--sidebar` | `#161616` | The owner's sample: background |
| card | `--card` | `#222222` | The owner's sample: card |
| edge | `--background` | `#0f0f0f` | The owner's sample: outer edge |
| accent | `--primary` | `#c0ff04` | The owner's sample: the running dot |
| warning | `--warning` | `#fc8c45` | bb-app 0.37.0 dark `--warning` (`oklch(75% .16 50)`) |
| border | `--border` | `#292929` | bb-app 0.37.0 dark `--border` (14% ink over canvas) |
| text | `--foreground` | none | — |
| muted | `--muted` | `#3a3a3d` | WizDeck's existing progress-track fallback for this variable |
| muted text | `--muted-foreground` | `#b7b7b7` | bb-app 0.37.0 dark `--muted-foreground` (`oklch(78% 0 0)`) |
| destructive | `--destructive` | none | — |

- **Muted accent** (the owner's "olive"): `color-mix(in oklch, var(--primary, #c0ff04) 60%, var(--sidebar, #161616))`, raised from 45% in 0.5.0 (#112) so "N done in the last hour" reads clearly on `#161616` (about 5.5:1 with the fallbacks). It colours "N done in the last hour", `done` dots and done marks.
- **Rule line:** `color-mix(in oklch, var(--primary, #c0ff04) 40%, var(--sidebar, #161616))`, a quieter olive for the line beside a section's name (`tokens.rule`).
- **Bright olive:** `color-mix(in oklch, var(--primary, #c0ff04) 85%, var(--sidebar, #161616))`, for `done-recent` dots.
- **Quiet ring:** `color-mix(in oklch, var(--muted-foreground, #b7b7b7) 45%, var(--sidebar, #161616))`, a grey ring for `held` dots.
- **Dots:** `done` muted accent, filled; `done-recent` bright olive, filled; `building` hollow, a 1 px muted-text ring that pulses (still under reduced motion); `review` hollow, a 1 px muted-text ring, still (no lime rings); `needs-you` warning, filled; `held` hollow, a 1 px quiet ring; `not-started` border, filled. "K needs you" uses warning text.
- **Open-spec panel:** the card variable, `var(--card, #222222)`.
- **Accent variable: Unverified.** Which host variable carries the owner's lime is not declared anywhere; `--primary` is this contract's choice. WB4-4 reads the owner's theme; if the lime is another variable, a contract revision swaps that one row.
- **The check.** `src/fixtures/v4-fixtures.test.ts` (run by `npm test`, so by `wizbar-checks`) fails on any hard-coded colour in WizBar's non-test source (`*.ts`, `*.tsx`, `*.css` under `wizbar/`, except `node_modules/` and `src/fixtures/`). A hard-coded colour is a hex literal, a colour function (`rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`), a Tailwind palette class (`text-amber-500`, `bg-black`), an arbitrary colour class (`bg-[#…]`), or a colour keyword as a style value, JSX colour attribute (`fill="red"`) or CSS declaration (`color: red;`); `transparent`, `currentColor`, `inherit`, `initial`, `unset` and `none` are not colours. The only literals it passes are `var(<variable>, <fallback>)` exactly as in the table; there are no exceptions. Comments are ignored. An arbitrary class holding a keyword (`text-[red]`), side and offset prefixes (`border-x-black`, `ring-offset-white`) and every `*Color` style key (`borderTopColor`) count too.
- **Pre-0.4 colours moved to host variables** (F4 ruling on openwizdev/OpenWiz#1434): the per-thread disc in `src/Disc.tsx` mixes the accent into muted text by the thread's hash (`color-mix(in oklch, var(--primary, #c0ff04) <35–94>%, var(--muted-foreground, #b7b7b7))`), and WizDeck's `LIME` in `src/deck/home/sections.tsx` is the accent, `var(--primary, #c0ff04)`. WizDeck's progress track keeps `var(--muted, #3a3a3d)`, the `--muted` row's fallback.

## Seams

| Seam | For |
| --- | --- |
| `SpecsFileV4`, `readSpecsFile` result reasons, `SpecRowV4`, dot states and order, hidden rule, section rule, `specsOpen`, `wizbar specs`, `wizbar spec`, `v4SpecsFile`, `v4SpecsReadCases`, `v4SpecRows` | WB4-1 (#1435) |
| Title parse, matching, `SpecAgentV4`, matrix rules and marks, `modelSourceV4`, `v4TitleCases`, `v4Matching`, `v4Matrix` | WB4-2 (#1436) |
| No footer registration, `StatsV4`, the hover card, pinning, `v4Stats`, `v4CardPinCases` | WB4-3 (#1437) |
| The producer's format (section 1), the model-source observation (section 6), the accent variable (section 9) | WB4-4 (#1438) |
| Theme tokens, fallbacks and the check | Every 0.4 ticket |

## Evidence limits

- The specs file's location and the producer's conformance, the host's resolved execution options against what a thread runs, which host variable carries the owner's lime, the real look of dots, marks and the hover card, and the owner's sampled values stay Unverified until WB4-4.
- The theme variables are read from the locked bb-app 0.37.0 stylesheet, not from an SDK declaration; a newer host may rename them, and then the fallbacks apply.
- The JSON timestamps in this document are examples; tests use the fixtures.
