# C1 (#72) evidence

All values are synthetic. These are fixture results only: they prove no installation, host reachability or live behaviour.

## Claims and proof

| Acceptance criterion | Claim | Evidence | Ready |
| --- | --- | --- | --- |
| Types, schema, fixtures and stubs agree; importing enables no effect | One synthetic queue file reaches `needsYouViewStub` with every answer disabled; `dispatchSteerDisabled` makes no call; the published JSON Schema equals the validator's | `factory-contract.test.ts`, "traces one synthetic queue…" and "publishes exactly the validator's JSON Schema" | Now |
| Wrong project, duplicate item, unknown schema and stale proposal are rejected | Each reads as unavailable with its reason and a null count; a changed fingerprint, a changed revision or a resolved item cancels a pending answer | "rejects a … file", "cancels a send on a …" | Now |
| Activity and threshold recorded, or the gap explicit; no guessed stall | Timeline row times are host event record times, and no factory idle policy exists, so stall is unavailable; a long tool is `operation-pending`; a stale observation and an absent policy are unavailable | "Activity and stall: no guessed amber"; source findings in `wizbar/contracts/factory-view.v1.md` section 8 | Now (the gap stays open) |

Further cases: the steer arguments are exact, sent, queued and uncertain stay distinct, absent inventory is not empty, delivered children carry no total, and status comments fall back to `Not estimated`.

## Red first

- `red.log`, at commit `571a758`: the tests run against planted bugs. The validator checked only the schema; the dispatch check skipped revision and fingerprint; queued counted as sent; absent inventory read as empty; amber was computed from row record times with an invented 30-minute default; zoneless and foreign status comments were trusted. 15 tests failed on their own assertions. The 16 that passed pin cases those bugs did not touch.
- `red-repeated-key.log`, at commit `f059167`: a queue file with a repeated `project` key was accepted. The fix is the next commit.
- `green.log`: the same proofs pass.

## Checks at hand-back

- `npm run typecheck`, from `wizbar/`: passed.
- `npx vitest run --config vitest.config.ts --maxWorkers=2`, from `wizbar/`: 24 files, 793 tests passed.

## Helpers

None started; no swarm, so no no-push check was needed.

## Not tested

- The prose contract, which is checked by review only.
- No fake-SDK or React test: C1 registers no RPC and renders nothing. D1 and D2 own those seams. There is no visible change, so no target pictures.
