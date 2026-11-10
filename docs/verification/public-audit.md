# WZ7 public audit

## Proof plan and baseline review

Review date: 2026-11-10. Source baseline: `25c45af54ed613a92ebbe015666f0615203f0310`.
This is a documentation change; no product behavior or test contract changes.

Before editing the README, review found that it still described completed identity,
SDK and feature work as planned. It had no implemented-command usage, installation
status, sidebar selection instructions, picture, source tag or known-unknowns note.
`docs/images/wizbar.png` and this audit were absent. That is the failing baseline
for the documentation acceptance criteria, rather than a new product regression.

| Claim | Planned evidence |
| --- | --- |
| Short, accurate usage and explicit Unverified installation | Compare README with merged source, #8 observations and #9's preparation-only install kit |
| Real sanitized picture, no live claim | Reuse and inspect the existing WZ4 actual React fixture screenshot; retain original target and captures |
| W8 privacy | Inspect tracked files, public branch/tag history including metadata and old blobs, PR text/comments and referenced images; independent Codex second pass |
| W9 provenance and notices | Compare both notices with pinned upstream bytes and retain the existing credit; record source path, tag and commit |
| Regression status | Existing lockfile install, typecheck and bounded full plugin tests; attempt the existing build script and state any boundary failure |

#9 consumes the documentation/audit and owns live acceptance. No new code seam is
needed. Product source, dependency files, upstream README and both LICENSE files
are outside this change. Documentation needs no product changelog line.

Results and independent review are pending; no clean-audit conclusion yet.
