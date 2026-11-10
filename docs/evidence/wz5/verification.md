# WZ5 verification and limits

The target precedes implementation at commit `6f024fd`. It is a generated design,
not a host screenshot. The initial counting stub fails 12 of 18 cases at `9ee3b06`;
the pure implementation passes all 18. The presentation stubs fail all eight
rendered tests at `8fcf1fe`; the candidate presentation then passes. An additional
restoration case catches a stale hover after inputs disappear and return; the
fix resets interaction state while unavailable. Logs are sanitized fixture runs.

## Approved blank production outcome

The latest #6 ruling grants one namespaced custom icon registration and requires
blank output whenever complete global input or in-thread subagent mapping is
unverified. SDK 0.6.33 declares the footer action's icon/title/callback and an
experimental disclosure whose component renders above the row. A disclosure is
not used. A custom icon component could carry artwork, but neither declarations
nor fixture tests establish that its host sizing supports the full presentation.

`FooterCounter` supplies an unknown source to `FooterCounterArtwork`. It never
interprets `activity.backgroundAgents` as in-thread subagents. The pure function
requires explicit completeness and an explicit per-thread subagent map, including
known zero entries; no unknown is rendered as zero. It reuses upstream `isWorking`
and deduplicates stable IDs, refusing contradictory duplicate working states.
Synthetic inputs supply those assertions only for fixture tests and captures.
No production adapter, persistent setting or capability override is introduced.

`app.tsx` registers the namespaced candidate artwork, which returns nothing with
unverified inputs. It deliberately registers no footer action or disclosure:
otherwise the host would draw an empty/icon-only button, contrary to the approved
fallback. Existing sidebar and header registrations are unchanged. There is no
live footer number in this candidate, and no activation claim.

## Proof classes

- W2 fixture: literal table cases cover projects, hidden children, multiple activity
  signals, duplicate rows, idle/waiting state, explicit subagents and unknown inputs.
- W2/W3 fixture: SDK harness covers count updates, dim zero, spinner state, hover
  and focus split, inert clicks, inbox filtering/shelf changes and blank production
  artwork under ready/loading/error feeds. This does not establish host completeness.
- W3 browser presentation: captures render the real candidate React component with
  explicit synthetic inputs. The page is a fixture, not Cloudroom or an installed
  plugin. Zero, positive, hover and production-blank states are captured at 390px
  and 1440px. The shell/colors are synthetic; host footer sizing is unverified.
- W1/W4 regression: full existing plugin tests and typecheck run locally and in CI.
- License/credit: both MIT notices and README attribution are unchanged.

## Build and owner gates

`npm ci` passed with the existing lockfile. `npm run build` invokes the existing
`room-cli plugin build .` script but exits 2: the available CLI does not expose
`plugin`. No alternate executable, dependency, desktop toolchain or live host was
used. Desktop build, complete-source/mapping verification, actual footer sizing,
numerical agreement, installation and replacement remain under #9's owner gate.
Passing `wizbar-checks` proves typecheck/fixture tests, not those live claims.

Helpers: none. Seams: the explicit `RunningCountSource` and candidate artwork
retain the counting/presentation rule for #9's verification; they do not establish
or enable a host data adapter. Independent review remains required at the head.

## Target comparison and browser inspection

Inspected all eight PNGs after capture. The left footer region contains the
spinner/number (zero and positive), split above it (pointer hover), or no content
(blank production fallback). At both viewport widths there is no horizontal
overflow; hover content stays inside the viewport. The generated target uses
larger illustrative crops; the rendered candidate uses the specified 12px text,
14px spinner and 6px gap. The target tooltip pointer is illustrative; the real
compact tooltip has a simple border, matching existing UI patterns. The fixture
shell is separate explanatory context, not a substitute plugin location.

| Fixture region | Foreground / background | Contrast |
| --- | --- | --- |
| Number | (228, 228, 231) / (24, 24, 30) | 13.93:1 |
| Dim zero | (148, 148, 159) / (24, 24, 30) | 5.89:1 |
| Hover split | (228, 228, 231) / (36, 36, 42) | 12.16:1 |

These are measured/specified synthetic fixture colors, not a host contrast claim.
The captures do not establish native footer clipping, accessible host action
wrapping, motion support or live updates on an installed plugin.
