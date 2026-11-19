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

The factory map's specs file lists the running specs and their tickets. Its producer runs on the owner's computer and refreshes it every 10 minutes. This contract fixes the format WizBar reads; WB4-4 step 1 deploys the producer that writes it (with close times) and confirms it.

**Location and read.** UTF-8 JSON at `.openwiz/specs.v1.json`, relative to `home.rootPath` of the one factory bound in the `wizdeckFactories` setting (factory-view.v1.md section 1). WizBar's server reads it with `bb.sdk.files.read({ hostId, rootPath, path })`, the factory contract's read, at most once per 60-second shared refresh. With no bound factory, or more than one, the result is unavailable (`no-binding`).

**Fields** (`SpecsFileV4`). Every object is closed: an unknown field is malformed.

| Field | Rule |
| --- | --- |
| `schema` | Exactly `openwiz.specs.v1` |
| `generatedAt` | UTC ISO timestamp ending `Z`: when the producer wrote the file |
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
| `code` | The ticket code (`^[A-Z][A-Z0-9]*-[0-9]+$`, for example `WB4-1`), or null. Distinct within its spec when not null |
| `title` | Nonempty |
| `state` | `done`, `building`, `review`, `needs-you`, `held` or `not-started` (below) |
| `closedAt` | The close time, a UTC ISO timestamp ending `Z`, for `done`; null for a `done` ticket closed before close times were recorded; always null for every other state |

Ticket states, set by the producer: `done` closed as completed; `building` a builder works on it; `review` its pull request is in review; `needs-you` it waits on the owner; `held` it carries the `held` label; `not-started` anything else that is open. A ticket closed as not planned is left out of the file.

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

**Hidden.** A spec is hidden when `total === 0` or `done === total` (finished). A hidden spec has no row and counts nowhere, in the UI and the CLI.

**Section rule.** `Specs N` where N is the number of visible rows, then ` · M need you` when M (the sum of `needsYou` over visible rows) is over zero.

## 3. Matching running threads to a spec

The input is the 0.3 rows (sidebar-v3.v1.md section 1). Only **running** rows match: working by the shared fact and `hasPendingInteraction` false.

**Title parse** (the thread-naming rule `Role · CODE: what it does`): the `displayTitle` matches `^(.+?) · ([A-Z][A-Z0-9]*-[0-9]+): (.+)$` (the separator is a space, U+00B7, a space). Group 1 is the role, group 2 the code. Anything else gives no role and no code.

**Which spec,** first match wins:

1. **Fleet parent.** The specs whose `fleetThreadId` equals the row's `parentThreadId`. Exactly one: that spec. Several: the one among them with a ticket whose `code` equals the title code; if not exactly one, no spec.
2. **Ticket code.** The specs with a ticket whose `code` equals the title code. Exactly one: that spec. Zero or several: no spec.

Hidden specs take part in matching, so an agent of a finished spec is matched to it and appears in no spec row (the hover card lists it with no spec). A row matching no spec appears in no spec; it still counts in "N running" and the hover card (section 7). The fleet thread itself matches only by rule 2.

**Each agent** (`SpecAgentV4`): `threadId`, `title` (the `displayTitle`), `role` and `code` (from the parse, or null), `ticket` (the spec's ticket with that code, or null), `providerId` (the row's harness), `model` and `effort` (section 6), `matrix` (section 5), `createdAt` and `updatedAt`. Order: `createdAt` ascending, then `threadId`.

A visible spec with no agents still has its row; it shows no chevron and cannot open.

## 4. The open-state setting

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `specsOpen` | string | `"[]"` | A JSON array of the spec keys (`owner/name#N`) that are open |

Declared in `wizbarSettingDescriptors` (by WB4-1) with the settings.v1.md store and write rule; this contract is the key's record, and settings.v1.md is not changed here. Every spec starts collapsed. A key missing from the array, a missing setting, or a value that is not a JSON array of strings reads as collapsed for every spec (fail closed). Opening adds the key once; closing removes it; both are idempotent. Keys of specs no longer listed are kept and ignored, so a spec that comes back keeps its state.

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

A running row is working and not waiting, so inside a spec and in the hover card only `reviewing` and `working` occur; the CLI and the app therefore agree there. The pull-request states appear only on 0.3 cards in the app.

**Marks** (row-major masks, `1` lit; unlit dots use the border token). Reduced motion (`prefers-reduced-motion: reduce`) shows every mark static.

| State | Mask | Colour | Animated |
| --- | --- | --- | --- |
| `working` | `111111111` | accent | yes |
| `reviewing` | `111101111` | accent | yes |
| `checks-running` | `000111000` | accent | yes |
| `needs-you` | `010111010` | warning | no |
| `failed` | `101010101` | destructive | no |
| `done` | `000010000` | muted accent | no |
| `idle` | `000000000` | border | no |

## 6. Harness, model and effort

- **Harness:** the row's `providerId` (the sidebar row's provider). This contract adds one row to sidebar-v3's CLI mapping: `providerId` from the raw row's same-named field (`threadResponseSchema.providerId`). The app shows the provider's logo and `displayName` from `experimental_useProviders()`; the JSON carries the ID.
- **Model and effort source:** `bb.sdk.threads.defaultExecutionOptions({ threadId })`, the host's resolved execution options (`ResolvedThreadExecutionOptions | null`). WizBar uses `model` and `reasoningLevel` only when the result is not null and its `source` is exactly `client/turn/start` (the latest turn start); any other source or null gives nulls. Served through 0.3's `cardModels` RPC.
- **Adoption gate:** `modelSourceV4.adopted` is `false`. While it is false the RPC keeps `source: "none"` and every model and effort is null, exactly as 0.3. It turns true only after WB4-4 observes, on the owner's computer, a thread started with a known harness, model and effort and finds the resolved options equal to what it runs. If they differ, it stays false and the host ask is filed. **Needs the live observation; not claimed here.**
- **Display:** `<model> · <Effort>` with a capital first letter (the 0.3 model chip rule); model alone when effort is null; nothing when model is null. Missing values are omitted, never guessed.

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
| `settings_failed` | The host refused or failed the settings write | `spec` |

`state_unavailable` (0.3) still means the thread rows could not be read; `specs` needs both the file and the rows.

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

Exactly one spec reference and exactly one of `--open`/`--close`, else usage. `<n>` is `owner/name#N`, or a bare `N` that matches exactly one visible spec's number. It needs a ready specs file. It writes the `specsOpen` setting (section 4) and reports the state read back.

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

- **Muted accent** (the owner's "olive"): `color-mix(in oklch, var(--primary, #c0ff04) 45%, var(--sidebar, #161616))`. It colours section rules and "N done in the last hour".
- **Dots:** `done` muted accent, filled; `done-recent` muted accent with a 1 px accent ring; `building` accent, filled; `review` hollow, a 1 px accent ring; `needs-you` warning, filled; `held` hollow, a 1 px muted-text ring; `not-started` border, filled. "K needs you" uses warning text.
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
