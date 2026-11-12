# WZ17 verification

Ticket #39: the v0.3 sidebar contract, header-chip settings, types, synthetic fixtures and target pictures.

## Claims and proof

| Claim | Proof |
| --- | --- |
| Every card field, child field and stats number names its exact SDK 0.6.33 or existing-contract source and what shows when it is missing | `wizbar/contracts/sidebar-v3.v1.md` sections 1–4; independent review |
| The CLI section gives usage, `--json` output, error codes and exit codes in the existing command's style | Contract section 7; types in `wizbar/src/v3-types.ts`; independent review |
| The footer keeps the #28/#37 limits: named host icon, fixed label, no label updates | Contract section 6; independent review |
| `childrenChipEnabled` defaults to false and `parentChipEnabled` to true; a missing key reads its default | `wizbar/src/settings.test.ts`, red first (`red.log`), then green |
| Fixtures are synthetic and cover zero, one and many children, Cloud, Local and unknown rows, waiting, failed, finished-today and pinned threads | `wizbar/src/fixtures/v3-fixtures.test.ts`, red first (`red.log`), then green; it checks the hand-worked expectations against the shipped `childrenOf`, `classifyMachine`, `countRunning`, `isWorking` and `hasRuntimeWork` |
| The three target pictures are in `docs/evidence/v0.3/targets/`, unaltered, labelled synthetic | The prepared `v0.3-target-pictures` commit `5aba875263733885033173a78ea380be20008eb6` merged as-is; `git diff 5aba875 HEAD -- docs/evidence/v0.3/targets` is empty |

## Reproduce

From `wizbar/`: `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2`. The proof subset is `npm test -- --maxWorkers=2 src/settings.test.ts src/fixtures/v3-fixtures.test.ts`.

## Logs

- `red.log`: the proof subset before the descriptors and fixtures existed: four settings failures (two keys missing) and the fixture module missing. Committed before the fix.
- `green.log`, `typecheck.log`, `full-suite.log`: the same subset passing, typecheck and the full suite at the hand-back commit. Local paths are replaced with `<repo>`.

## Limits

Fixtures and the contract prove no host behaviour; the contract's "Evidence limits" list what stays for #9. No build, installation, live read or publication was made. Helpers: none.
