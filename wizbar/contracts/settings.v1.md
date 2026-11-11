# WizBar settings v1 — WZ11 / #25

Status: consumer seam defined before controls. Fixture behavior is not PC-host
acceptance. #9 owns live persistence and presentation. Plan revision 8 on #1
supersedes historical no-settings assumptions.

## Keys and persistence

| Exact key | Type | Default | Label | Consumer |
| --- | --- | --- | --- | --- |
| `footerCountEnabled` | boolean | true | Footer count | #28 footer visibility |
| `machineIconsEnabled` | boolean | true | Cloud/Local row icons | #29 row visibility |

Defaults preserve the existing features' visibility policy; they never enable a
data source. In particular an enabled footer still renders nothing without a
verified source. Missing keys use these defaults. Present non-boolean values
fail closed to false; strings such as `"true"` are not booleans.

`wizbarSettingDescriptors` in `src/settings.ts` is the single declaration. It is
registered with `bb.settings.define` in the existing backend factory (approved by the
2026-11-10 orchestrator ruling on #25). No manifest-only settings API is assumed.
The host persists non-secret values in its plugin settings store, scoped to this
plugin ID. These are plugin-wide preferences across projects, not lifecycle rows,
localStorage, a component's lifetime or settings in another plugin.

The settings section uses the published `app.slots.settingsSection` surface;
`useSettings()` supplies effective non-secret values. A custom switch writes only
its one key with `useSdk().plugins.updateSettings({ pluginId, values })`, obtaining
the plugin ID through `experimental_usePluginId()`. A write is acknowledged only
after a successful response. The returned effective values update all mounted
WizBar consumers sharing the current host snapshot; a newer host snapshot wins.
This in-memory acknowledgement bridges host-hook refresh and is not persistence.
Reopening reads host values again. Rejected writes keep prior visibility and show
an inline error. Controls stay mounted, disabled during a save, and keep focus.
Closing the last consumer retains a pending save's lock until settlement. A
reopened section stays disabled during that request. Settlement publishes to
current consumers, or clears the acknowledgement when no consumers remain.
Save progress and outcome share that snapshot, so the reopened section receives
the inline rejection alert or successful-save feedback. Starting a new save
clears the previous outcome. The outcome also clears at the last-consumer
lifetime boundary once the request has settled.
Unavailable/loading settings disable writes; no save success is invented.

## Visibility consumer interface

`useWizBarSettings()` (exported by `src/SettingsPage.tsx`) reads these two boolean
preferences. `FooterCounterArtwork` and `MachineIcon` apply only a visibility
guard; #28 and #29 retain ownership of source/count/classification behavior.
Do not gate source subscription on visibility: a disabled feature's source status
must stay independently observable. Do not infer a number or icon from a switch.

## Source status consumer interface

`Feature = "footer" | "icons"`; `SourceStatus = "live" | "unavailable" |
"unverified"`. No enabled flag is part of this type. Status is session-local,
never persisted: a prior live session must not become a claim about a new one.

`useFeatureSourceStatus(feature, status)` (exported by `SettingsPage.tsx`) lets
#28/#29 publish status from their actual source adapters while mounted. It
registers a report through `reportFeatureSourceStatus(pluginId, feature, status)`
in `settings.ts`, and removes it on status change/unmount. Publish from the
source adapter even when the feature is hidden. Multiple reports aggregate
conservatively: unavailable, then unverified, then live. No reports means footer
unavailable or icons unverified. The page observes the same plugin-scoped store.

- `live`: only an adapter actually reading the verified authoritative source
  with current, complete inputs may report this; fixtures can simulate it but
  prove no host behavior. A toggle never publishes it.
- `unavailable`: no connected source, loading, error, stale or incomplete data.
- `unverified`: data/mapping exists but its authority/coverage is not established.

Initial production status: footer unavailable (unwired), icons unverified
(existing mapping awaits #29). The page separately renders Enabled/Disabled and
Live/Not connected yet, even while a feature is disabled. Both unavailable and
unverified use Not connected yet with a short reason. Internal status values
retain the distinction for consumers. It reads
`package.json`'s actual version; there is no version bump or release claim.

## SDK compatibility and limits

Inspected published SDK 0.6.33 declarations and the integrity-verified 0.6.49
archive: `PluginSettingsState`, `PluginSettingsSectionRegistration`,
`PluginSettingsUpdateArgs`, `PluginSettings.define`, `useSdk`, and
`experimental_usePluginId` support this boundary. #27 alone owns the SDK pin.
Public package source: https://registry.npmjs.org/@get-bb%2fplugin-sdk/0.6.49
The SDK documents backend settings declarations and settings-section placement;
the host also renders its declarative form above custom sections. This section
uses the same keys; it introduces no independent settings store.

N1: rendered-app proofs cover registration, read/write acknowledgement, reopening,
both feature guards, failures and status truthfulness. Backend settings fixture
proof establishes declaration and durable reload behavior in the SDK fake.
N1-live: PC persistence, host invalidation, exact placement and presentation remain
Unverified until #9. No live application access or installation is authorized here.
