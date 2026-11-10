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

## W8: bounded privacy result

No confirmed identifying data or credentials were found in the inspected scope.
This is a bounded audit result, not a guarantee of absence or publication approval.

- Base snapshot: 9 public branch heads, no repository tags; 54 reachable commits,
  217 trees, 197 distinct blobs (468 objects), and 141 tracked files at the base.
  The eight published PR head refs already point into that reachable history.
- Method: enumerate advertised heads/tags and all reachable objects; scan historical
  filenames, commit messages, raw author/committer metadata and text blobs for
  thread/runtime identifiers, personal emails, private absolute paths, machine
  labels, credential formats and related keywords. Review candidate matches in
  context. Scan the new documentation separately before committing.
- Current GitHub scope: 8 PR bodies, 118 repository issue/conversation comments,
  0 inline review comments and 0 formal reviews. The helper also searched all 22
  issue/PR body records. Referenced images resolve to reachable repository blobs;
  no additional external attachment content was identified.
- Images: the independent helper visually opened all 18 distinct historical PNGs
  and the candidate copy, and inspected their chunks. No text or EXIF metadata
  was present. They contain synthetic targets or fixture renders.
- Classification: thread-shaped IDs are synthetic fixtures, including inherited
  upstream tests and intentionally synthetic WZ4 examples. The generic upstream
  machine-label fixture was checked at the pinned source and is not a newly
  disclosed machine. SVG numeric paths and loopback capture URLs are non-identifying.
  Existing commit identities use GitHub noreply metadata; copyright holders and
  public project attribution are retained. No real thread identifier, private
  absolute path, personal email value or credential-pattern hit was confirmed.
- Policy/source links already identify public decisions and private-record
  pointers; their linked private contents were not copied into the README/audit.

Searches can miss unusual or encoded secrets and context-dependent disclosures.
Visual inspection cannot exclude steganography. Deleted/edited earlier GitHub
text, inaccessible attachments, server-retained unreachable objects, other
repositories and future refs/comments are outside this snapshot. The retired
repository was never fetched. Any later confirmed privacy finding stops this
work for owner review; history rewriting and force-pushing are not authorized.

## W9: provenance and attribution

Compared directly with `SawyerHood/sawyer-plugins` at
`d3424f24e2cebe91da4e72cb38feb023da808922`:

| Material | Result | SHA-256 of original bytes |
| --- | --- | --- |
| Root MIT notice | Original 1,068 bytes remain intact; existing project notice follows | `8f5af179ec30a8bf55461d301ef7154fe40224deb3cd898ba202f8f6e5a57f82` |
| `plugins/t3sidebar/LICENSE` | All 1,069 bytes equal `wizbar/LICENSE` | `d10816aa30183af920bdd789a81b16847bcf3e287e1b3419dd7d85f6e3e8e7b0` |
| Upstream plugin README | Byte-identical in `wizbar/README.md`; left unchanged | `94483e19bae9e6f240a11b48d142887f3072f225b93d98b9b45525ad6877df2c` |

The root README preserves its original source-credit/link wording and both
notice-credit sentences, and now records the source path and version tag.
The upstream tag `t3sidebar/v0.1.0` resolves to
`8b535729dd2251ceb293c7caf74e43e477f942a3`; the copied source snapshot is the
separately pinned `d3424f24e2cebe91da4e72cb38feb023da808922`. They are not asserted
to be the same commit. Neither LICENSE nor the upstream README changed here.

## Picture and documentation review

`docs/images/wizbar.png` is an unchanged copy of the WZ4 desktop capture:
SHA-256 `97e625319803d48e00f3227812a2b72350feedc22fee609d733eeedef28b84ed`.
The builder inspected it: it shows real rendered `ThreadCard`, `SlimRow` and
Cloud/Local artwork with synthetic example rows and styling. It qualifies here
as a picture of the implemented React UI, not an installed-host observation.
The independent helper confirmed its provenance and privacy but deferred this
acceptance interpretation to the builder/reviewer. Original target-before and
real-render-after artifacts remain untouched on their UI PRs (#17 and #20).

After review: the README documents the implemented shelves, five registered
operations, per-ID results, JSON/exit status and future/preset snooze times.
Source checks used `command.ts`, `server.ts`, `MachineIcon.tsx`, `app.tsx` and the
footer verification report. Installation/activation forms come from #9's
preparation-only kit; every execution/live claim remains Unverified. The README
records the uncertain PR badge, observed header support, observed provider mapping
and blank production footer. It does not present fixture totals as global host data.

## Independent second pass and checks

One read-only Codex helper (`gpt-6.1-terra`, high reasoning), role: independent
privacy/attribution search; slice: whole repository/history and public GitHub
text/images; base: `25c45af54ed613a92ebbe015666f0615203f0310`, plus candidate
README/image/proof plan. Result: no confirmed privacy issue, intact notices,
explicit evidence limits. Used all 7 reported classification/accuracy items;
ignored 0, found wrong 0. The builder retained all acceptance judgments and wrote
all changes. Helper archived; no-push check:
`clean #8: nothing changed but the writes you named (branches 0, comments 2)`.
This is W8/W9 second-pass evidence, not the fresh exact-head PR review or approval.

Scoped regression checks with the unchanged lockfile and product source:

- `npm ci`: passed (Node 24.22.1, npm 11.19.1).
- `npm run typecheck`: passed.
- `npm test -- --maxWorkers=2`: all 253 tests in 10 files passed.
- `npm run build`: exit 2; the available CLI reports `Unknown command plugin`.
  The existing desktop build boundary remains Unverified; no alternate toolchain,
  dependency, plugin installation or execution was substituted.
- `git diff --check`: passed; changes confined to the three ticket-owned paths.

No behavior changes require a new regression test. The failing documentation
review above precedes the README change in history. The matching after-review is
this source/kit/picture comparison. No product changelog is required for docs.
CI's required `wizbar-checks` proves typecheck/tests at the PR head, not a desktop
build or live acceptance. Build execution, installation, activation, separate
runtime IDs/data, real command/refresh behavior, global inputs and live footer
capability remain #9 owner gates. Releases and publishing remain gated.
