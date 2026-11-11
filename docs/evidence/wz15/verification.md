# WZ15 README verification

## Approved scope

The orchestrator approved the README-only split on 2026-11-11. The SDK remains
exactly 0.6.33. The 0.6.49 upgrade is deferred to a polish follow-up until its
published declarations restore the existing hook and test call-log members.
The ruling directs this ticket to proceed with its README PR.
[Scope ruling](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6782951013).

The saved branch was resumed and main merged. Manifest, lockfile and shared
contract were restored to the then-current main for the first handback at
`a40414a`. The finite pre-review compatibility correction merges main at
`29f1045` and documents #31's explicit mute. The resulting product diff against
that main contains only `wizbar/README.md`.

## Proof and results

The documentation baseline review failed before README edits and was committed
at `d5e28f8`. It identifies the copied T3 title, upstream installation guidance,
missing WizBar commands, provenance and live-evidence disclosures.
[Failing-first documentation review](readme-red.md).

The updated README was compared with the root README, `src/command.ts`,
`src/lifecycle.ts`, both licence files and the prepared WZ8 installation kit.
The compatibility correction additionally reads the merged command registration,
server guards and exact `mute.v1.md` and `wizbar.v1.md` contract bytes.

- It names WizBar and openwizdev/wizplugins, with the existing synthetic UI image.
- It gives the prepared desktop build/install/list commands and sidebar
  activation setting, with desktop execution and acceptance explicitly unverified.
- It lists all seven registered operations, per-ID results, JSON and failure exit
  status, the option terminator, and snooze-only future timezone-bearing ISO time
  or one of the four available presets.
- It describes the persistent Muted shelf, explicit keeper-selected running mute,
  its verified/unpinned/non-waiting/non-failed eligibility and its attention
  breakthroughs. Ordinary settle/snooze working and waiting refusals remain clear.
- It discloses the blank production footer, incomplete live Cloud classification,
  pending settings/count work and the live mute-mapping and acceptance gaps.
- It credits Sawyer Hood's T3 Sidebar, the copied source path and snapshot,
  the distinct version tag, and both original MIT notices. Both licence files
  retain their existing bytes.

This is the builder's documentation comparison. Independent exact-head README
and attribution review remains required.

## Execution boundaries

`readme-checks.txt` preserves the original 0.6.33 lockfile install, typecheck and
253-test results for the first handback at `a40414a`. Those executions precede
#31 integration. Its successful CI run also belongs to `a40414a`.
[Prior CI run](https://github.com/openwizdev/wizplugins/actions/runs/42930230184).

The compatibility correction uses affected documentation checks only. These
compare command/options and contract wording, validate README links, check scope,
confirm protected file bytes against integrated main and scan outgoing public
text. Results and exact input blobs are in
[mute-compatibility.md](mute-compatibility.md). This correction executes no new
installation, typecheck, runtime suite, desktop build or live command. Required CI
must run afresh for the new head.

Source, tests, manifest, lockfile, contracts and both licences match integrated
main. No repository hook or AGENTS.md/CLAUDE.md is present in the checked-out tree.
The checklist was reviewed for scope, evidence accuracy, attribution and privacy.
The first independent review remains pending and the finding-round count is zero.

## Historical SDK evidence

The original 0.6.49 pin proof, installation, failed typecheck and 253 passing
fixture tests remain available in the historical investigation and linked logs.
`check-pin.mjs` asserts the deferred 0.6.49 distribution and is retained solely
as that investigation's proof. It is outside the current README validation.
[Historical investigation](sdk-0649-investigation.md).

## Limits and downstream work

#9 retains desktop build, installation, activation and live acceptance.
#28 and #29 must account for the deferred SDK upgrade under the scope ruling.
WZ15 adds no code seam. The existing image proves fixture presentation.
Independent review and required CI must pass at the exact PR head.

No helpers were used. This is documentation-only work and needs no product
changelog line. The earlier branch's first-successful-push receipt was unavailable
on resumption, so its original timestamp remains unknown.
