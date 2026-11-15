# #92 reconciliation evidence

All values are synthetic. Fixture and rendered-harness results prove no installation, live send or host behaviour. No live write or steer was made.

## The bug

After the SDK confirms `sent` or `queued`, a failed final record write leaves the backend's `dispatching` record, which a later log read shows as fallback `uncertain`. The panel's log reconciliation replaced the confirmed outcome it already had from the RPC answer, in its remembered records and in both displayed rows (Recent actions and the answer's Earlier line). One operation, one SDK send.

## The fix

`wizbar/src/deck/actions/Actions.tsx`: one `reconcile(known, incoming)` rule, used for RPC answers, applied log reads and the Recent actions row. A confirmed `sent`/`queued` record is never replaced by `uncertain`; any other newer resolving record wins, so an actual later confirmation upgrades uncertainty. The Earlier line reads the same remembered record. No serialized field, status, RPC, storage record, setting or dependency changed; nothing is retried or resent.

## Claims and proof

`wizbar/src/deck/actions/review-round1.test.tsx`, "#92: reconciliation keeps a confirmed delivery": the real WizDeck panel against the real action handlers and KV storage on the SDK's fake host, answering N-12 once.

| Acceptance criterion | Proof |
| --- | --- |
| Sent stays sent after the final write fails and recovery reads uncertain | "a sent confirmation stays sent when the final record write fails and recovery reads uncertain": only the `sent` write is rejected; the backend's own log read is checked to return `uncertain`; then refreshes and two overlapping reads (older answering last) |
| Queued stays queued, not relabelled sent | the same case for `queued` (with the SDK's `queuedMessage` id) |
| Uncertain upgrades on an actual later confirmation | "an uncertain answer upgrades to sent/queued when the actual confirmation arrives later": no host answer within 30 s, then the SDK resolves and the backend saves the late record |
| Remembered and displayed state agree; overlapping reads cannot restore the downgrade | each case asserts the Recent actions row's `data-state` and words and the Earlier line's words |
| One operation ID, one SDK send, no retry or new allocation | each case asserts one `deckSteer` call, one operation id and one SDK send |
| Existing protections remain | the unchanged D2 suites (`Actions.test.tsx`, `review-round1.test.tsx`, `actions-server.test.ts`, Home) pass unchanged |

## Red first

`red.log`: the four cases at commit `57d3c81`, on unchanged production source from `c6b3db6` (PR #85's merge). Both final-write cases fail on their own assertions: the row's state is `uncertain` instead of `sent`/`queued`, and the row and Earlier line both say "Uncertain". The two upgrade cases pass on the baseline: they guard that the fix keeps the upgrade.

`green.log`: the four cases and the full plugin suite at the hand-back commit.

## Supporting edits

- `wizbar/src/deck/actions/review-round1.test.tsx`: the four regression cases only, reusing its existing `realBackend` and `mount` fixtures; existing cases unchanged.
- `changes/92.md`: the approved line. No new test: this changelog line is prose; the behavior has the required regression tests.
- `wizbar/src/deck/actions/Actions.test.tsx`: unchanged.
