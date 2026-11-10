# WZ15 proof plan

Scope: [#27](https://github.com/openwizdev/wizplugins/issues/27), claim N3 in
[approved plan revision 8](https://github.com/openwizdev/wizplugins/issues/1#issuecomment-6780024061).
Baseline: `0e1cecc81e9e3e9f739d99c6a970e39fcd668290`.

| Claim | Evidence and limit |
| --- | --- |
| Readers find WizBar's own installation, activation and five existing operations, with honest pending-feature/live limits | Before/after documentation review against the root README, source and #9's install kit; independent exact-head PR review required. Documentation does not prove installation or live dispatch. |
| Provenance and both MIT notices remain correct | README credit/link/commit review, unchanged licence bytes; independent PR attribution review required. |
| Manifest and lockfile select exactly published SDK 0.6.49 | `node docs/evidence/wz15/check-pin.mjs`, red before edits and green afterward; registry metadata and installed-package readback. |
| Existing API uses remain source compatible and test meanings remain intact | Inspect actual published 0.6.49 declarations, `npm ci`, `npm run typecheck`, `npm test -- --maxWorkers=2`; source and test files unchanged. These establish fixture compatibility, not host compatibility. |
| Shared edits and dependency changes stay scoped | Diff review: SDK pin only in manifest, SDK package metadata only in lockfile, source/version/toolchain wording only in shared contract; plugin release and unrelated dependencies unchanged. |

The pin proof observes a distribution contract: consumers must install 0.6.49,
not the previous 0.6.33. Existing behavior tests cannot catch an otherwise
compatible wrong pin. No product behavior test or compatibility rewrite is
needed. The documentation red is a review of the actual pre-change README,
recorded separately from executable proof.

#28 and #29 consume this SDK pin for their later footer/icon work. #9 consumes
the resulting source for separately scoped desktop build and live acceptance.
No new code seam, host read, installation or publication is part of WZ15.
