# WizBar next-iteration host discovery (WZ10)

Status: contract/report prepared for independent review on #24 under [approved plan revision 8](https://github.com/openwizdev/wizplugins/issues/1#issuecomment-6780025774).

## Proof plan, before the contract

N0 uses the [existing private keeper observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149), public SDK inspection and independent review. No live read is repeated. Only field semantics and synthetic examples belong here.

| Claim | Evidence and boundary |
| --- | --- |
| Preserve the keeper's scope and limits | Independent comparison with that exact private comment; no fixture proves live behavior |
| Identify SDK/footer/source/coverage/update boundaries | Published 0.6.49 declarations plus the keeper record; missing host facts stay Unverified |
| Preserve Cloud/Local and null/startup distinctions | Observed mapping table, synthetic examples, independent review; supported raw lookup remains a gate |
| Consumers have an exact sanitised interface | Compile the documented types and positive/negative examples below |
| Missing data never becomes a proven zero or guessed icon | Type examples reject an empty thread list without ready input, a fabricated subagent zero and a classified unknown machine |
| Downstream claims remain blocked where evidence is missing | Explicit release conditions for #28/#29 and live acceptance #9 |

Plausible regression: a consumer mistakes an unavailable source for zero or a null environment for Cloud. Existing plugin tests exercise synthetic presentation; they do not own this new documentation contract or prove its host inputs.

## Reproducible documentation proof

From the repository root after `cd wizbar && npm ci`, run:

```sh
python3 - <<'PY'
from pathlib import Path
import re, subprocess, tempfile
contract = Path('wizbar/contracts/host-observation.v1.md')
if not contract.is_file():
    print('FAIL N0: host-observation contract absent')
    raise SystemExit(1)
blocks = re.findall(r'```typescript\n(.*?)\n```', contract.read_text(), re.S)
assert len(blocks) == 2, 'Expected interface and synthetic type examples'
with tempfile.TemporaryDirectory() as folder:
    source = Path(folder) / 'contract.ts'
    source.write_text('\n'.join(blocks))
    result = subprocess.run([
        'wizbar/node_modules/.bin/tsc', '--ignoreConfig', '--strict',
        '--noEmit', '--skipLibCheck', '--target', 'es2022', str(source)
    ], capture_output=True, text=True)
    if result.returncode:
        print((result.stdout + result.stderr).replace(str(source), 'contract.ts'))
        raise SystemExit(result.returncode)
print('PASS N0: interface and synthetic type examples compile; host behavior unverified')
PY
```

This checks the consumer type boundary, including rejected unavailable values. It does not validate a transport, runtime payload, live mapping or global completeness.

## Failing-first record

Before adding the contract, the documentation proof above returned exit 1:

```text
FAIL N0: host-observation contract absent
```

The red record is committed before the contract. Independent review, scoped checks and required CI still gate hand-back.

## Discovery result

The [consumer contract](../../wizbar/contracts/host-observation.v1.md) records the exact field semantics and evidence gates. The keeper's one-snapshot agreement is observed; a complete production footer and supported raw Cloud lookup remain Unverified. A [builder question](https://github.com/openwizdev/wizplugins/issues/24#issuecomment-6780292038) requests clarification from existing records without repeating the live read.

No `AGENTS.md` or `CLAUDE.md` exists in this repository or its plugin folder at the baseline read. The repository's `docs/agents/` settings apply. Only this report and the host-observation contract are owned by #24; no consumer code, package pin, baseline contract or build command is changed.

### SDK inspection (public package, not host proof)

Inspected published **@get-bb/plugin-sdk 0.6.49**:

- [Registry metadata](https://registry.npmjs.org/@get-bb%2fplugin-sdk/0.6.49)
- [Archive](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.49.tgz)
- Verified SHA-512 integrity: `sha512-0YCOJm+iKWbmEaUF7JsrxRSWFz5OdOwVxM1KPuek8r55dYCPSgyA9NEdyq8OVlbhXSstF2wGlHXZ2Q9wwdMJzQ==`
- Members inspected: `package/package.json`, `package/bundled-types/bb-plugin-sdk.d.ts`, `package/bundled-types/bb-plugin-sdk-app.d.ts`.

The download matched registry integrity and version metadata. No package was installed for this inspection. To reproduce, download the linked archive, compare its SHA-512 to the registry value, then read the named declarations without executing them. The baseline lockfile installation for checks remains SDK 0.6.33; #27 owns 0.6.49 integration. The exact keeper comment does not name its installed version; this report does not promote the target version to an observed one.

| Boundary / symbol | Declared surface | Observation or limit |
| --- | --- | --- |
| `app.experimental_sidebarFooter.register` | Common `id`, `label`, `icon`; action has `kind: "action"`, `onActivate`; disclosure has `kind: "disclosure"`, `component` | Host-managed icon button; label is tooltip/accessibility text, disclosure content is above the row; no declared inline count field |
| Disclosure controller | `open`, `close`, `toggle` | No declared live-number capability |
| `app.slots.sidebarFooterAction` | Compatibility `id`, `title`, `icon`, `run` | Host-rendered action, not proof of a number |
| `app.experimental_icons.register` | `name`, `component({ className? })` | Custom artwork; does not prove a host footer renders/upgrades the required counter |
| Existing `wizbar/app.tsx` | Registers counter artwork only | No actual footer action/disclosure registration; production source remains null in `FooterCounter` |
| `BbPluginApi.sdk`, frontend `useSdk` | Loopback-bound server SDK and app SDK | Supported SDK entrypoints declared; no real WizBar footer source read established |
| `projects.sidebarBootstrap` | Optional abort signal; bootstrap response | Candidate published bootstrap method; keeper used its installed SDK, but the exact method/field preservation through published plugin APIs is unverified |
| `threads.list` | Array response; offset/limit and scope filters | Keeper observed matching IDs once; exact arguments, defaults, end-of-pagination and all-project/child coverage unrecorded |
| `threads.count` | Active status filter, optional project/parent/host/provider grouping/filtering; result `total`, optional `groups` | Keeper observed matching active count before/after; CLI corroboration alone is insufficient |
| `experimental_useSidebarThreads` | Host cache/realtime subscription, uncapped active lifecycle, optional paginated archive; loading/ready/error | Declared update behavior only; no observed update sequence or source-completeness proof |
| `PluginSidebarThread` | `id`, `projectId`, `parentThreadId`, work/activity/indicator, nullable environment/host | No `executionTarget`; no occurrence of that field in either inspected declaration file |
| `activeBackgroundAgentCount` / projected `activity.backgroundAgents` | Numeric activity signal | Observed zero does not prove complete subagent counting |

Published declarations do not establish a working plugin read of an undeclared raw field, rendered placement or updates. Do not add casts or infer Cloud from projection nulls to fill this gap. The [prior footer discovery](footer-capability.md) and WF1 still apply: no substitute presentation; live rendering remains for #9.

### Preserved observation and unresolved scope

| Topic | Existing keeper evidence | Remains Unverified |
| --- | --- | --- |
| Source agreement | Bootstrap and list ID sets agree; active status/runtime/count agree before and after one stable snapshot | Global completeness beyond that returned set and equivalence to every existing work signal |
| Children | No explicit child coverage recorded | SDK declares parent relationships; observed child inclusion/counting remains unverified |
| Hidden, archived and shelves | Snapshot was unarchived and had no hidden rows | Hidden/archived running boundary, all shelf/muted coverage; do not infer coverage from absence |
| Pagination and filtering | Matching returned sets | Exact call arguments, defaults, all pages and consistency during concurrent change |
| Updates and freshness | One stable snapshot; production footer unwired | Live transitions, reconnect, races, stale/error handling and freshness policy |
| Machine mapping | Raw Cloud target and known Local provider shapes; Local startup can have null environment/host | Supported plugin target lookup and same-ID join; null/empty/unknown variants have no positive mapping |
| Subagents | Background-agent activity summed to zero at that instant | Meaning/completeness for running in-thread subagents |
| SDK/footer | 0.6.49 target; published API inspected here | Installed-version readback from the exact keeper evidence and real inline number rendering |

The mapping and consumer-state rules in the contract are the seams for #28/#29. Their ready examples are explicitly conditional, and unavailable/unknown values have no fabricated number or icon. #25 owns feature visibility/status integration. #9 owns actual host screenshots, updates, complete running counts and final acceptance after merges.

## Green proof and hand-back checks

The same documentation proof passes after adding the contract:

```text
PASS N0: interface and synthetic type examples compile; host behavior unverified
```

This is a type/documentation proof only. Independent comparison with the private keeper record and public SDK remains required. Required `wizbar-checks` CI proves typecheck and fixture tests, not a desktop build or live behavior. Desktop build execution remains with #9 per fleet settings.

Local check receipt (Node 24.22.1, npm 11.19.1): `npm ci` passed on the existing lockfile; `npm run typecheck` passed; `npm test -- --maxWorkers=2` passed all **253 tests in 10 files**. `git diff --check` passed. These checks do not execute a plugin build or contact a live host. No dependency was added. Documentation-only scope needs no changelog line.
