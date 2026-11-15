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

## Pictures

`targets/` holds the generated design targets, committed before any visible D2 code (prompts and known defects in `targets/brief.md` and `targets/prompt.txt`). `screenshots/` holds the real `Home` component with D2's actions, rendered at 1440 px and 390 px in a throwaway local harness (Vite, with the SDK's app hooks stubbed to return synthetic backend answers and the host's dark CSS variables approximated; not committed), captured with headless Chromium after the recommended answer was tapped, so the row shows the Undo countdown. They show the real markup, not the installed host's chrome, fonts or panel width.

Compared with the targets: same order (Needs you, Answer, Tell the factory, Spec actions, Running/Merges today/Stalls, Versions) and Ledger treatment (lime only on the recommended answer, the countdown, Undo and progress). Differences: the build keeps every button 44 px tall and 16 px phone padding (the target's are smaller); the spec picker names the repository-qualified spec; delivery words are longer than the target's; a short note explains why no reply is matched.

## Helpers

One swarm, one helper: image generator (Codex Sol 6.1, medium, shared sandbox), slice "target pictures", base commit `109a3bd`. Result: two targets; both used, with the recorded defects not copied. No-push check: clean.

## Not tested

- A live `threads.send` in steer mode, its queued/sent result, its idle-thread behaviour and any timeline reply: no live steer is authorized.
- Installed-host behaviour: KV storage durability across a real restart, `threads.get` fields on a real host, `toThread`, panel placement, fonts.
- The queue producer (OpenWiz #710, held): end-to-end answer acceptance needs a real Needs-you file and is not claimed.
