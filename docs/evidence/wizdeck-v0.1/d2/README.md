# D2 (#74) evidence

All values are synthetic. Fixture and rendered-harness results prove no installation, host steer behaviour, queue producer or live reply. No live write or steer was made.

## The route

Every action (answer, Tell the factory, spec action, feedback) calls one plugin RPC, `deckSteer`, which ends in exactly one `bb.sdk.threads.send(steerSendArgs(request))`: `{ threadId: <bound orchestrator>, input: [{ type: "text", text, mentions: [] }], mode: "steer" }`. No `sendAt`, override, attachment or second input; queue mode is never substituted. The operation id (`op-…`) stays inside the plugin: it keys the saved record and appears in the message text, and is never sent as a field or treated as host deduplication.

Before the call the backend:

1. reads the private binding for the requested factory (unknown project: `wrong-project`) and compares the orchestrator the panel showed with the binding (`wrong-target`);
2. for an answer, claims the item and fingerprint synchronously, refuses one already sent, re-reads the Needs-you file through D1's reader and runs C1's `checkSteerDispatch` (revision, item, fingerprint, option and risk; any change cancels);
3. verifies the orchestrator with `bb.sdk.threads.get`: same id, the factory's Cloudroom project, not archived or deleted (`orchestrator-unverified` otherwise);
4. saves the record as `dispatching` in plugin KV storage; a record that cannot be saved is never sent (`not-saved`).

Outcome, via C1's `steerOutcome`: `sent`; `queued` (waiting, not steered); a rejection, an unrecognised result or no answer within 30 s is `uncertain`, never retried. A repeat of the same operation id joins or reads the one record; a new operation for an already-sent answer is refused as `duplicate`. A record still `dispatching` after a restart reads as uncertain. A late confirmation after the 30-second wait may settle an uncertain record as sent or queued; a late failure leaves it uncertain.

**Answers.** A tap first binds the choice (`deckBindAnswer`): a fresh read must show exactly the code, question, options and risk the person saw, and the item must be ordinary. The row then shows `Sending "<choice>"… N s` with Undo for five seconds; no send is attempted before it ends. Undo, a changed question/options/risk, a resolved item, stale or unavailable data, a factory switch, hiding the page or closing the panel cancels, and nothing is sent. The backend re-checks at dispatch, so a revision change during Undo also cancels. Live, release, publish and unknown-risk items have no answer buttons: they show "Gated · <risk>: decide in the orchestrator" and an Open orchestrator button. Ordinary answers need no confirmation dialog.

**Tell the factory and feedback** send at once and list the last five actions with their delivery words. **Spec actions** (Pause, Resume, Prioritise, Ask why) send a message about one spec of the factory's own repositories; Open spec only opens its link. Nothing changes a GitHub label, file or fleet from the plugin.

**Replies.** The SDK's send result carries no turn id and the operation id is not a host key, so no supported correlation exists. WizDeck never shows timeline text as a reply: each delivered action shows "Reply: Open orchestrator" (native `toThread`) and the plain reason.

**Producer absence.** With no readable Needs-you file, answering is off in words; Tell, spec actions and feedback still work when the orchestrator verifies. An unverified orchestrator disables every send, in words.

## Claims and proof

| Acceptance criterion | Proof | Ready |
| --- | --- | --- |
| Undo before five seconds produces zero sends; one valid answer yields exactly one steer to the configured orchestrator | `Actions.test.tsx` "Undo before five seconds sends nothing; one valid answer sends exactly one steer after five seconds"; `actions-server.test.ts` "sends exactly the SDK's three steer arguments to the bound orchestrator" | Fixtures now |
| Stale/project/target/risk changes cancel; duplicates and uncertain outcomes cannot silently retry | `actions-server.test.ts` "stale, changed and wrong-target answers cancel before any send" (7 queue changes, unreadable queue, bind mismatches, unknown project, changed target, four unverified-orchestrator cases) and "duplicates and uncertain outcomes never send twice"; `Actions.test.tsx` four "cancels with no send when…" cases, factory switch/hide/close, double click, uncertain/queued | Fixtures now |
| Queued delivery remains waiting; actual matching response or an honest link is shown | "a queued delivery is waiting, not steered"; "the action log links to the orchestrator and carries no reply text"; "shows delivery at once and links to the orchestrator for the reply, never inventing one" | Fixtures now; live reply observation not authorized |
| Spec actions and feedback steer only the orchestrator; no direct factory or GitHub write | "each makes one steer to the orchestrator and no GitHub, file or thread write" (no fetch, `files.write`, `spawn`, queue or file read); "spec actions and feedback are steers through the one RPC; Open spec only opens the link"; foreign spec refused | Fixtures now |

## Red first

`red.log` (commit `5c8b101`) runs the D2 proofs against six planted bugs, the ones the ticket's proof names; the next commit removes them and changes nothing else:

- P1 send before Undo: the panel's timer fires at once.
- P2 wrong mode and an unsupported field: `mode: "queue"` plus a cast `requestId`.
- P3 stale choice: the dispatch check's refusal is ignored while the item exists.
- P4 double send: no synchronous claim, no operation join, no sent-answer check (backend), no pending guard (panel).
- P5 blind retry: a rejected send is sent again.
- P6 guessed reply: the log carries the orchestrator's latest timeline text.

10 tests fail on their own assertions. The rest pass under the plants and act as guards: the panel's own cancellation cases (not planted), the queue-unavailable, refusal and validation cases, and the panel double-click case, whose disabled buttons still stop the planted guard.

## Revision 4 supporting edits

Approved in revision 4 (plan #71, approval comment 6900008441; release on #74). Each serves the steer path or keeps D1's checks honest beside it:

- `wizbar/src/deck/data/server.ts`: `registerDeckReaders` returns its existing settings handle as `{ settings }`. The SDK lets a setting be defined once, so D2 reads the same `wizdeckFactories` through it; no second declaration and no new setting. The handle and token never go over RPC.
- `wizbar/src/server.ts`: captures that handle and passes it to `registerDeckActions`.
- `wizbar/src/deck/home/Home.tsx`: the intro now reads "WizDeck reads your factory's GitHub plan and its Needs-you file. Its actions only message your orchestrator; it changes nothing on GitHub itself." No new test: prose only.
- `wizbar/src/deck/home/Home.test.tsx`: names the Factory combobox (D2 adds a spec picker); the heading list gains Answer, Tell the factory and Spec actions in source order; the watch cadence is asserted separately, plus exactly one action-log read per mounted panel. The Needs-you row's Open-only assertion and the no-fetch check are unchanged.
- `changes/74.md`: the approved line. No new test: prose only.

Entry proof: `actions-server.test.ts` "defines the settings once, reaches the action RPCs, and never returns the token". It loads the real plugin entry on the fake host with the synthetic token configured, then calls `deckActionLog`, `deckSteer` (a send that rejects with token-bearing text) and `deckBindAnswer` (a queue read that fails with token-bearing text). It checks that every result and every realtime signal is free of the token. Bugs caught: a second settings declaration (the entry throws), unregistered action RPCs, and the token leaking through an action's error. Red: `red-entry.log` (commit `0705ba3`) runs it against the checkpoint's registration: `plugin "wizbar" has no rpc method "deckActionLog"`.

Green: `green.log` is the full plugin suite at the latest hand-back commit.

## Review round 1 (R1–R4)

- **R1, lost response.** The panel keeps every operation it submits under its own id from the moment it is submitted: `pending` while the RPC is out, `unknown` if the answer is lost ("Outcome unknown · … it is not resent"). Only the backend's record of that same id settles it. A failed log read, or a good one without that id, leaves it unknown. The draft moves into the operation at submit, so the same instruction is never offered again as a new operation; a refusal (nothing sent) gives the words back. A lost answer to a decision keeps its row answered by the same rule. Proof: `review-round1.test.tsx` "keeps the same operation, reconciles it from the real backend, and sends once" (the panel against the real action handlers on the fake host, with the response thrown away after the backend accepted it: one SDK send, one operation id, the row settled from the backend's record) and "keeps an unresolved operation uncertain while no log can settle it".
- **R2, revised proposal.** Whether a decision is answered now depends on the exact proposal on screen: code, question, risk and options, recorded by the backend from its own fresh read at dispatch (`answer.shown`), or an unresolved operation of this panel. No fingerprint is guessed and C1's view is unchanged. The backend's bind and dispatch still refuse a second answer under the same fingerprint, sent or uncertain. Proof: "revision 2 → 3 with new options offers the new choices"; "the unchanged proposal stays suppressed after a sent or uncertain answer" (a guard; it passes on both heads). Known limit: if a producer changes only the fingerprint and keeps every shown field the same, the row keeps showing the earlier outcome until the orchestrator resolves or rewords the item. The backend would accept the new fingerprint, but the panel does not offer it again.
- **R3, superseded binding.** Immediately before the SDK call, after verification and the save, the backend reads the factory's binding again and compares the whole binding. If it changed, was removed or cannot be read, the action is cancelled and recorded with zero sends (refusal names restored to existing ones in the final correction below). It is never retargeted. Proof: `actions-server.test.ts` "R3: a binding changed during orchestrator verification cancels with zero sends" and "R3: a factory removed during verification cancels with zero sends".
- **R4, immediate state.** Tell, feedback and spec actions appear in Recent actions at once as `Sending…` (an accessible status, `data-state="pending"`) before the RPC answers, and settle to the backend's sent, queued, uncertain or cancelled state. The backend also publishes its saved `dispatching` record before the SDK call, so other panels show it too. Proof: "shows this operation's pending delivery before the RPC answers, then its real outcome", with a deferred RPC held for 20 s and then settled as queued.
- **Red:** `red-review-1.log` (commit `b78a33c`): the six new regressions fail on their claims against the reviewed head `e6143f5`, nothing planted. After that run, the first R3 test's later log read was fixed. It had reused the held `threads.get` and waited forever; the assertions are unchanged.
- R5/R6 are polish issues #89/#90 and are not changed here.

## Final check correction (orchestrator: fix once more, R1/R2)

- **R1.** A submitted operation keeps its message and known state until a resolving outcome exists: `sent`, `queued`, `uncertain` or `cancelled`, from its RPC answer or an applied log read. A `dispatching` record only updates it ("Sending… the backend has it"). A successful log read without it changes nothing. Log reads are numbered, and a response older than the last one applied is dropped, so an older, overlapping empty response cannot remove a newer `dispatching` state. Proof: `review-round1.test.tsx` "newer dispatching then older empty response keeps the same operation until the backend settles it" (real action handlers on the fake host; the held older log read is released after the newer dispatching read; one operation id, one SDK send, then sent). The earlier R1 tests stay.
- **R2.** Whether a proposal is already answered is now decided only by the backend's current identity. Its existing `deckBindAnswer` re-reads the file and refuses a fingerprint already sent, queued, uncertain or still sending; for a new fingerprint it returns the bound fingerprint and revision. The row keeps its choices and reports the earlier answer ("Earlier: …"). A tap binds first. A refusal starts no Undo, allocates no send operation and sends nothing: the operation id is allocated only when the bind succeeds and Undo begins. Bind answers are checked against the current choice and project, and stale ones are dropped. Nothing polls or guesses a fingerprint. Proof: "identical shown fields with a new backend fingerprint offer the choices and send one new answer" (revision 3, same shown fields: a second send carrying `fp-n12-3`), and "the unchanged proposal stays protected after a sent answer / an uncertain answer: no Undo, no operation, no send". The round-1 R2 tests that hid the controls by shown fields are replaced; `Actions.test.tsx`'s uncertain case now checks the earlier-answer line and no Undo instead of zero buttons.
- **Shapes restored.** `ActionRecordV1.answer` is back to `{ itemId, fingerprint, question }` and `protocol.ts` is identical to `e6143f5`. Displayed-field bookkeeping is private panel state, never sent or saved. R3's zero-send binding re-read keeps its full comparison but uses existing refusals: a removed or unreadable binding is `wrong-project`, any other change is `wrong-target`, with the reason in `detail`. R4's immediate operation-specific pending row is unchanged.
- **Red:** `red-review-2.log` (commit `116c4cb`): the four new regressions fail on their claims at `e413e60`, nothing planted.

## Pictures

`targets/` holds the generated design targets, committed before any visible D2 code (prompts and known defects in `targets/brief.md` and `targets/prompt.txt`). `screenshots/` holds the real `Home` component with D2's actions, rendered at 1440 px and 390 px in a throwaway local harness (Vite, with the SDK's app hooks stubbed to return synthetic backend answers and the host's dark CSS variables approximated; not committed), captured with headless Chromium after the recommended answer was tapped, so the row shows the Undo countdown. They show the real markup, not the installed host's chrome, fonts or panel width.

Compared with the targets: same order (Needs you, Answer, Tell the factory, Spec actions, Running/Merges today/Stalls, Versions) and Ledger treatment (lime only on the recommended answer, the countdown, Undo and progress). Differences: the build keeps every button 44 px tall and 16 px phone padding (the target's are smaller); the spec picker names the repository-qualified spec; delivery words are longer than the target's; a short note explains why no reply is matched.

## Helpers

One swarm, one helper: image generator (Codex Sol 6.1, medium, shared sandbox), slice "target pictures", base commit `109a3bd`. Result: two targets; both used, with the recorded defects not copied. No-push check: clean.

## Not tested

- A live `threads.send` in steer mode, its queued/sent result, its idle-thread behaviour and any timeline reply: no live steer is authorized.
- Installed-host behaviour: KV storage durability across a real restart, `threads.get` fields on a real host, `toThread`, panel placement, fonts.
- The queue producer (OpenWiz #710, held): end-to-end answer acceptance needs a real Needs-you file and is not claimed.
