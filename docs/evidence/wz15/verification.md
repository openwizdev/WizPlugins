# WZ15 — blocked SDK candidate; README prepared

Ticket: [#27](https://github.com/openwizdev/wizplugins/issues/27).
Builder question: [published-declaration incompatibility](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6780348031).

## Results

| Check | Result |
| --- | --- |
| Failing-first distribution proof | Five expected failures on SDK 0.6.33; [red log](pin-red.txt), committed at `d5e28f8` before pin edits |
| Exact 0.6.49 candidate pin | Five checks pass; [pin log](pin-green.txt) proves version, tarball and integrity only |
| Lockfile installation | `npm ci --no-audit --no-fund` passes; [install log](install.txt) |
| Source compatibility | `npm run typecheck` exits 2 with 14 errors; [typecheck log](typecheck.txt) |
| Existing fixture suite | `npm test -- --maxWorkers=2` passes 253 tests in 10 files; [test log](tests.txt) |
| Product build/installation | Not run; desktop execution remains for #9 |

Node 24.22.1, npm 11.19.1. The installed SDK package reports 0.6.49.
No source, test, Vitest configuration, TypeScript configuration, declaration shim
or toolchain file was changed. Passing runtime fixtures do not erase a failed
source typecheck. No ready PR or completion claim is warranted.

## Actual published package inspection

Inspected the package selected by its published registry metadata:
[0.6.49 metadata](https://registry.npmjs.org/@get-bb%2fplugin-sdk/0.6.49),
[archive](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.49.tgz).
The integrity is checked in `check-pin.mjs` against the registry value.
The following are paths inside that published package, not vendored declarations:

| Surface | Inspection |
| --- | --- |
| App entrypoint | `package.json` maps `./app` types to `bundled-types/bb-plugin-sdk-app.d.ts`. That file has zero occurrences of `experimental_useSidebarThreadActions`; its export list at line 21978 omits it. Six existing components import it. |
| App test harness | `./testing/app` maps types to `bundled-types/bb-plugin-sdk-testing-app.d.ts`. That file has zero occurrences of `sidebarActionCalls`; eight existing assertions use it. |
| Runtime versus declarations | `dist/app.js` still defines/exports `experimental_useSidebarThreadActions` (lines 110–111, 197). `dist/testing/app.js` still implements it (2524–2525) and returns `sidebarActionCalls` (3347). This explains why the runtime suite passes while typecheck fails; it is a published declaration/runtime mismatch, not proof that the runtime hook disappeared. |
| Existing app registrations | App declarations retain `experimental_threadList` (20411), `experimental_threadHeaderAction` (20417) and `experimental_icons` (20590). No registration rewrite is needed for these uses. |
| Thread data | App `PluginSidebarThreadActivity` (19192) retains workflows, backgroundAgents, backgroundCommands, planMode and goals; `PluginSidebarThread` begins at 19206. These types do not establish live completeness or execution classification. |
| Server | Root declarations retain `defineRpcContract`, `BbPluginApi`, storage database/migrate (22536/22543), realtime publish (23184), CLI result/registration (23268/23293) and CLI register (23319). The compiler reports no errors on existing server API uses. |
| Backend harness | `bundled-types/bb-plugin-sdk-testing.d.ts` exports `createFakePluginHost` and `makeThreadResponse` (1523); existing server-boundary fixtures pass. |

No compatibility rewrite, alternate pin or local declaration patch was attempted.
The ticket explicitly requires a genuine blocker to be recorded rather than a
different SDK or wider edits. The issue retains `ready-for-agent` and adds
`needs-info` for the required plan/scope decision.

## README review

Compared with the [failing baseline review](readme-red.md), the prepared README:

- Names WizBar and the correct public repository, uses the existing synthetic
  image with an explicit fixture label, and describes the existing shelves.
- Carries the root README/#9 kit's prepared desktop build/install/list and
  activation guidance, with build, install, separate runtime IDs/data and live
  command execution explicitly unverified.
- Lists exactly the five operations registered by `src/command.ts`, including
  per-ID results, JSON, nonzero failure status, future timezone-bearing ISO time
  and the four existing presets.
- States that the production footer is blank and links pending settings, mute,
  running-thread footer and corrected Cloud classification work without claiming
  it has shipped.
- Credits Sawyer Hood's T3 Sidebar, the copied source path/commit and distinct
  tag; links both original MIT notices. Neither licence file is edited.

This is the builder's source/documentation comparison. Independent README and
attribution review on the final green head remains required and has not occurred.
No helpers were used. No product changelog claim is made for a blocked SDK bump.

## Scope and downstream impact

Manifest changes only the exact SDK pin. The lockfile changes only its root SDK
pin and the SDK package's version, tarball and integrity. All unrelated locked
packages and the plugin release version remain unchanged. Shared contract edits
are confined to source/version/toolchain statements; no feature sections change.
README links resolve to existing repository files. No new dependency is added.

#28 and #29 still need a compatible 0.6.49 foundation; #9 still owns desktop
build and live acceptance. No new code seam is added. The public branch preserves
this blocked candidate for inspection, not for merge. A ready PR and its requested
five-minute review/CI loop wait on a scope decision and passing typecheck.
