# WZ17 verification

Ticket #39: the v0.3 sidebar contract, header-chip settings, types, synthetic fixtures and target pictures.

## Claims and proof

| Claim | Proof |
| --- | --- |
| Every card field, child field and stats number names its exact SDK 0.6.33 or existing-contract source and what shows when it is missing | `wizbar/contracts/sidebar-v3.v1.md` sections 1–4; independent review |
| The CLI section gives usage, `--json` output, error codes and exit codes in the existing command's style | Contract section 7; types in `wizbar/src/v3-types.ts`; independent review |
| The footer keeps the #28/#37 limits: named host icon, fixed label, no label updates | Contract section 6; independent review |
| `childrenChipEnabled` defaults to false and `parentChipEnabled` to true; a missing key reads its default | `wizbar/src/settings.test.ts`, red first (`red.log`), then green |
| Fixtures are synthetic and cover zero, one and many children, Cloud, Local and unknown rows, waiting, failed, finished-today and pinned threads | `wizbar/src/fixtures/v3-fixtures.test.ts`, red first (`red.log`), then green; it checks the hand-worked expectations against the shipped `childrenOf`, `classifyMachine`, `countRunning`, `isWorking` and `hasRuntimeWork`; `thr_v3_active_waiting` is the row where `isWorking` and the shared runtime rule disagree |
| The three target pictures are in `docs/evidence/v0.3/targets/`, unaltered, labelled synthetic | The prepared `v0.3-target-pictures` commit `5aba875263733885033173a78ea380be20008eb6` merged as-is; `git diff 5aba875 HEAD -- docs/evidence/v0.3/targets` is empty |

## Reproduce

From `wizbar/`: `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2`. The proof subset is `npm test -- --maxWorkers=2 src/settings.test.ts src/fixtures/v3-fixtures.test.ts src/SettingsPage.test.tsx`.

## Logs

- `red.log`: the proof subset before the descriptors and fixtures existed: four settings failures (two keys missing) and the fixture module missing. Committed before the fix.
- `read-red.log`: the settings reader before it read the two new keys: six failures. Committed before the fix.
- `review-red.log`: the fixture test after the round-1 test changes, before the fixtures and types: three assertion failures (no counterexample row, total not above the list-bottom count, no drag cases).
- `settings-count-red.log`: `src/SettingsPage.test.tsx` with the old switch count, against this branch: the section now draws 4 switches, so `toHaveLength(2)` fails.
- `green.log`, `typecheck.log`, `full-suite.log`: the same subset passing, typecheck and the full suite at the hand-back commit. Local paths are replaced with `<repo>`.

## Review round 1 (R1–R4 at `b72e849`)

| Finding | Change | Proof |
| --- | --- | --- |
| R1 activity mapping | Contract section 1 maps each `activity.*` field from its nested raw `row.activity.*` counter | Independent review |
| R2 drag into Pinned | Contract section 5: two host calls, no undo, four outcomes; `DragPinCaseV3` and `v3DragPinCases` | `v3-fixtures.test.ts`, red first (`review-red.log`) |
| R3 working parity | One shared fact, `hasRuntimeWork` over `runtimeStatus` and the five counters, for children and stats on both readers; unknown `runtimeStatus` is unavailable; the list-bottom line keeps `isWorking`; counterexample row added | Same test and log |
| R4 finished today | `finishedToday` is `{ source: "none", count: null }` until a host finish time is adopted; other numbers stay ready | Same test and log |

## Ruling after round 1

The orchestrator ruled on #39 that there is one running number everywhere: working (`hasRuntimeWork`) and not waiting on you. It applies to the list-bottom line, `running.total` and `wizbar stats`. Busy-but-waiting threads count only under "waiting on you". "Finished today: not available yet" is accepted. The contract records the rule (section 1). The list line's code and tests change in #41. Fixture `running` is back to 4. Red first: `ruling-red.log` (one assertion failure, 5 expected to be 4).

## Supporting edit outside the listed owned paths

`wizbar/src/SettingsPage.test.tsx`: exactly one assertion, `toHaveLength(2)` → `toHaveLength(4)`. The settings section draws one switch per descriptor, so the two new settings (acceptance criterion 4, owned path `wizbar/src/settings.ts`) make it 4; without this line the full suite fails `wizbar-checks`. Allowed by the [orchestrator ruling on #39](https://github.com/openwizdev/wizplugins/issues/39#issuecomment-6817197383) (option 1), which also accepts the `readWizBarSettings`/`WizBarSettings` reads of the two keys under the existing rule. #43 keeps the rest of that file.

## Limits

Fixtures and the contract prove no host behaviour; the contract's "Evidence limits" list what stays for #9. No build, installation, live read or publication was made. Helpers: none.
