# WZ15 README verification

## Approved scope

The orchestrator approved the README-only split on 2026-11-11. The SDK remains
exactly 0.6.33. The 0.6.49 upgrade is deferred to a polish follow-up until its
published declarations restore the existing hook and test call-log members.
The ruling directs this ticket to proceed with its README PR.
[Scope ruling](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6782951013).

The saved branch was resumed and main merged. Manifest, lockfile and shared
contract were restored to main before current verification. The resulting
product diff contains only `wizbar/README.md`.

## Proof and results

The documentation baseline review failed before README edits and was committed
at `d5e28f8`. It identifies the copied T3 title, upstream installation guidance,
missing WizBar commands, provenance and live-evidence disclosures.
[Failing-first documentation review](readme-red.md).

The updated README was compared with the root README, `src/command.ts`,
`src/lifecycle.ts`, both licence files and the prepared WZ8 installation kit.

- It names WizBar and openwizdev/wizplugins, with the existing synthetic UI image.
- It gives the prepared desktop build/install/list commands and sidebar
  activation setting, with desktop execution and acceptance explicitly unverified.
- It lists the five registered operations, per-ID results, JSON and failure exit
  status, future timezone-bearing ISO time and the four available presets.
- It discloses the blank production footer, incomplete live Cloud classification
  and pending settings, mute and count work through the relevant tickets.
- It credits Sawyer Hood's T3 Sidebar, the copied source path and snapshot,
  the distinct version tag, and both original MIT notices. Both licence files
  retain their existing bytes.

This is the builder's documentation comparison. Independent exact-head README
and attribution review remains required.

Current lockfile installation, typecheck and bounded full-suite results are
recorded in `readme-checks.txt`. Source files and test meanings match main.
No repository hook or AGENTS.md/CLAUDE.md is present in the checked-out tree.
The checklist was reviewed for scope, evidence accuracy, attribution and privacy.

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
