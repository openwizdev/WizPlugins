# WZ2 proof plan

Written before implementation. Decisions follow issue #3's SDK/build and path rulings.

| Claim | Observable contract and plausible regression | Evidence |
| --- | --- | --- |
| Identity preparation for W10 | The package identifies WizBar independently of T3 Sidebar and the registered list is titled WizBar. Retaining upstream metadata could overwrite or confuse the original. Existing tests assert a list registration, not its display name or package identity. | New identity test through the SDK app collector and package metadata; red committed before the fix. Live installation remains Unverified. |
| W1, W4 | Ordering, all shelves, wake rules, manual parking and both header chips retain upstream behavior. | All 80 upstream tests unchanged; source diff review. |
| W9 | Both original MIT notices remain byte-identical; changes have a separate notice. | Byte comparison with pinned upstream source; independent review requested on the PR. |
| Initial state | A new WizBar fake host has no parked rows. | Existing server loaded through the SDK backend harness, with no mocked lifecycle result; fixture proof only. |
| Contract | Existing store/RPC/realtime and working inputs are traceable to copied source and published SDK declarations. Unknown capabilities remain Unverified. | Contract source references and review. Future features remain owned by #4–#6. |
| Toolchain | SDK 0.4.4 remains published and exactly pinned. | npm registry, lockfile, npm ci, typecheck and tests. Supported build boundary is Unverified under the issue ruling; legacy build command is not run. |
| Presentation | The changed display name and icon can be read at narrow and wide widths. | Generated target before editing, then Chromium screenshots of a synthetic metadata preview driven by the actual package and SDK registration. The preview does not reproduce host layout or prove activation. |

No application installation, activation, live plugin call, publishing or new dependency is part of this proof.
