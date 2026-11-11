# WZ15 mute documentation compatibility

## Inputs

The source comparison uses merged PR #31 at
`29f10459a932c49cf0ddf1fcd13e31e988a72776` and retained README head
`a40414a354da21a869d3d31c313478de16d45188`. This is a documentation correction
under the existing README-only ruling.
[Scope ruling](https://github.com/openwizdev/wizplugins/issues/27#issuecomment-6782951013).

| Input | Git blob |
| --- | --- |
| `wizbar/src/command.ts` | `73013147dcf33d296fef1d045122cdaa6ce383af` |
| `wizbar/contracts/wizbar.v1.md` | `8093517c3eb259fd8407dc420e037a1d1c1a266f` |
| `wizbar/contracts/mute.v1.md` | `4f1889dc9fe87382204eed071a33d203caee412e` |

## Before correction — FAIL

The retained README lists five operations, describes explicit running-fleet mute
as planned and makes an unqualified working-thread parking prohibition. Merged
#31 registers seven operations, persists explicit mute and adds the Muted shelf.
The existing runtime tests cannot detect this documentation becoming stale.
This failed source/documentation comparison precedes the README correction.

The actual registration lists `settle`, `unsettle`, `snooze`, `unsnooze`, `mute`,
`unmute` and `list`. Every operation accepts IDs and optional `--json`.
`--until` is required for `snooze` and refused for the other operations.
`--` ends option parsing. `src/server.ts` registers this command and keeps the
ordinary `canPark` guard for settle/snooze, with `canMute` used for explicit mute.

The merged contract describes persistence, eligibility and breakthrough rules.
It retains the live-mapping evidence gap and WZ8 acceptance requirement.
Source comparison establishes agreement between documentation and code.
Real-host behavior remains unverified.

## Correction plan

Update only the plugin README and its current evidence to cover all seven
commands, the persistent Muted shelf and the specific running-thread mute
exception. Retain ordinary settle/snooze refusal and the pending settings,
count, Cloud-classification and live-acceptance disclosures.

Current main was merged normally without conflict. The SDK remains exactly
0.6.33. Original red logs, preparation and blocked-SDK evidence are retained.
This pre-review compatibility correction consumes no review finding round.

## After correction — PASS

Manual source/documentation comparison confirms seven command forms with the
registered options, a persistent Muted shelf and explicit running mute with the
contract's eligibility and breakthrough rules. Ordinary settle/snooze guards
remain explicit. The false pending-mute statement is removed. Settings, footer,
Cloud classification and live acceptance retain their actual evidence limits.

Affected documentation checks pass for README relative links, whitespace,
owned paths and outgoing public text. Protected source/tests, dependencies,
declarations, contracts and both licences match integrated main. Manifest and
lockfile read back SDK 0.6.33. Original preparation, red-run, execution logs and
blocked-SDK investigation match `a40414a` byte-for-byte.

These are new documentation checks. Prior install/typecheck/253-test executions
remain recorded at `a40414a`. The corrected head needs fresh required CI and an
independently arbitrated first review. Review finding rounds remain zero.
