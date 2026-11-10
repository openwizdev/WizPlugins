# Source and attribution review

Upstream source: `SawyerHood/sawyer-plugins`, commit `d3424f24e2cebe91da4e72cb38feb023da808922`, path `plugins/t3sidebar`. GitHub's public commit archive supplied the comparison tree. The annotated tag reference `t3sidebar/v0.1.0` resolves to tag object `772d93ce9dd474c6c3e2f42cb7ca9617ec9986d6`.

Before preparation, all 32 copied plugin files and the root licence matched the source byte for byte. After preparation, 27 of the 32 files still match exactly. The five differences are:

| File | Reviewed delta |
| --- | --- |
| `app.tsx` | Identity comment and displayed list title only; registrations, local IDs and components retained |
| `package.json` | Independent package/display/source metadata, OpenWiz description and canonical Zap icon; dependency, engine and script entries retained |
| `package-lock.json` | Two root package-name strings only; every dependency entry and resolution unchanged |
| `tsconfig.json` | Include the new identity proof in typecheck |
| `vitest.config.ts` | Test project display name only |

Every file in `wizbar/src/`, including all five upstream test files, remains byte-identical. No upstream file was deleted. The only new plugin files are the authorized identity proof and contract. No footer, command, Cloud/Local row implementation, mute or auto-parking was added. Fleet paths were already relocated on main, so no shared fleet section needed editing. Root README and the independent workflow are outside this change.

The root MIT notice's original **1,068 bytes** remain an exact prefix; the WizBar contributor notice follows it. The plugin licence's entire **1,069 bytes** remain unchanged. The original copyright lines and grant/disclaimer text have not been edited.

| Original notice | SHA-256 |
| --- | --- |
| Root | `8f5af179ec30a8bf55461d301ef7154fe40224deb3cd898ba202f8f6e5a57f82` |
| Plugin | `d10816aa30183af920bdd789a81b16847bcf3e287e1b3419dd7d85f6e3e8e7b0` |

Existing README credit links and names remain untouched. The root README describes the initial unchanged copy and points to the pinned source; #8 owns the final README update.

## Independent helper

One read-only attribution/source helper inspected commit `ea21c78ffd9529f71efa9a4c6b942af2f77753fc` and the concurrent identity changes. Four reported items were used, zero ignored and zero found wrong: original notice bytes retained; existing credit present; all source files unchanged with only the listed identity/config deltas; new-table migration has no seed/import. The helper independently compared the supplied files, not the external archive provenance. Its report does not claim runtime or legal verification.

The helper was archived before the no-push check. Result: `clean #3: nothing changed but the writes you named (branches 0, comments 14)`. No helper GitHub writes occurred.

## Remaining limits

Source review confirms that a newly created lifecycle table has no rows and there is no T3 import. It does not prove allocation of a distinct database on a live host. SDK 0.4.4's backend fake imports the absent optional `cron-parser` peer; no dependency was added to enable a new backend test, and no backend fixture result is claimed. The new proof covers identity through the existing app harness and package metadata. All 80 original tests remain the behavior regression boundary. Final independent PR review and #9's owner-gated live observations remain separate.
