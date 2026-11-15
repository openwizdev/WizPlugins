# D1 (#73) evidence

All values are synthetic. Fixture and rendered-harness results prove no installation, host reachability, GitHub account access or live behaviour.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| One mounted home works on desktop and phone, switches projects without leaking rows, and opens real issue/PR links | One `threadPanelAction` (`wizdeck`) from WizBar's runtime renders Home; a factory switch drops the old factory's rows even when its answer lands late; issue, PR, spec and Needs-you links go through the host URL opener; the New thread screen asks for a thread | `wizbar/src/deck/home/Home.test.tsx`: "registers one WizDeck right-panel action…", "switches projects without leaking rows…", "renders verified progress and opens issue and PR links…", "asks for a thread…"; `deck-server.test.ts` "switching projects returns only the selected factory's rows and queue"; screenshots below | Fixtures now; live open on desktop and phone needs installation (not authorized) |
| Two consumers share one 60-second refresh; conditional requests/backoff retain stale partial data honestly | Two leases cause one GitHub read and one queue read per 60 s; the refresh button respects the interval; timers stop when unused; status comments re-read with `If-None-Match`; rate-limit reset and `Retry-After` stop reads; last-good rows stay, marked stale; a partial page is a gap, not a count | `deck-server.test.ts` "one shared 60-second GitHub refresh" and "failure keeps last-good data stale, never zero"; `Home.test.tsx` "two mounted panels only renew leases…" | Now |
| Only verified merged PRs advance progress; timezone merges-today derives from cached merge timestamps | A ticket counts only when closed and closed by a merged PR in a configured repository; merges today is computed per viewer time zone from one cached read | `deck-server.test.ts` "counts only closed tickets with a merged PR…" and "derives each viewer's local day…" | Now |
| Queue/status unavailable and complete empty are distinct; no GitHub mutation or host send occurs | Offline host, missing file, forbidden root, malformed JSON, stale producer, project mismatch, hash mismatch and a different returned file are unavailable with answers disabled; a fresh complete empty queue is the only zero; only GitHub GETs and GraphQL queries are made; `files.write` is never called; the token never leaves the backend | `deck-server.test.ts` "Needs-you queue host read" and "makes only GitHub reads and never returns the token"; `Home.test.tsx` "keeps a missing queue unavailable…" | Synthetic now; live queue acceptance open (below) |

## Queue-host access

Every read is `bb.sdk.files.read({ hostId, rootPath, path: ".openwiz/needs-you.v1.json" })` with the binding's explicit host and root; there is no call without a `hostId`. The root must be absolute and normal (no `.`, `..`, empty or `~` segment, not a filesystem root, no trailing separator); anything else is refused before the SDK call. The returned path must be that file, and the SHA-256 of the returned bytes must equal the host's reported `sha256`. No credential, mount or file-write route was added.

**Live queue acceptance stays open.** The real binding and an installed plugin backend are not available to the builder, and no producer file exists yet (OpenWiz #710 is held). The exact missing binding and the read-only probe plan are recorded privately:
Private record: https://github.com/jparker2006/ClosedWiz/issues/3007#issuecomment-6898648383

## Red first

- `red-data.log`, at commit `97ff882`: the backend proofs run against planted bugs. P1: every watch reads GitHub and the host itself; P2: a failure drops last-good data and ignores back-off; P3: a closed ticket counts as progress; P4: merges today uses the UTC day; P5: a missing or unreachable queue reads as empty and the root is not checked. 16 tests failed on their own assertions. The next commit removes the plants.
- `red-home.log`, at commit `dc710d8`: the Home proofs run against planted bugs. U1: the previous factory's rows stay after a switch; U2: links bypass the host URL opener; U3: an unavailable queue shows "Needs you · 0"; U4: a mounted panel fetches GitHub. 5 tests failed on their own assertions. The next commit removes the plants.

## Pictures

`targets/` holds the generated design targets (made before any visible code). `screenshots/` holds the real `Home` component rendered at 1440 px and 390 px in a throwaway local harness: Vite with the SDK's app hooks stubbed to return one synthetic backend answer built by `buildHomeView`, the host's dark CSS variables approximated. The harness is not committed. These show the real markup and layout, not the installed host's chrome, fonts or panel width.

Comparison with the targets: same order (Home and factory picker, first-open note, Needs you, Running/Merges today/Stalls row, Versions with spec rows, refresh footer), same Ledger treatment (dark surface, thin rules, lime only on progress). Deliberate differences: Needs-you rows show code and question (the C1 view item has no separate title); version headings show verified merged/total tickets; the phone stacks each spec row and every button is 44 px tall; the factory picker shows the project key.

## Helpers

One swarm, one helper: image generator (Codex Sol 6.1, medium, shared sandbox), slice "target pictures", base commit `1107b4b`. Result: two targets; used both, with the recorded defects not copied. No-push check: clean.

## Not tested

- Installed-host behaviour: panel placement, the real phone panel, host fonts and colours, `openUrl` and `openThreadPanel` acceptance.
- A live GitHub account read and real rate-limit headers.
- The live queue read (above).
