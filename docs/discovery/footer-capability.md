# Footer capability discovery (WZ1)

**Outcome: unclear.** A plugin-drawn live number in the footer row has not been
demonstrated. **No agent-run live look was done.** Public SDK declarations and
the owner observations below do not prove live rendering.

Report date: 2026-11-10. Scope:
[WZ1 (#2)](https://github.com/openwizdev/wizplugins/issues/2), under
[plan #1, revision 7](https://github.com/openwizdev/wizplugins/issues/1).

## Current decision (WF1)

The 2026-11-10 [orchestrator ruling](https://github.com/openwizdev/wizplugins/pull/10#issuecomment-6768825294)
records the owner's decision to proceed with [WZ5 (#6)](https://github.com/openwizdev/wizplugins/issues/6)
through the pinned SDK's footer registration without waiting for this spike.
If that slot cannot display a live-updating number, the plugin renders nothing
there. Live proof belongs to the owner's installation in
[WZ8 (#9)](https://github.com/openwizdev/wizplugins/issues/9). This report records
what is established and what remains unverified; it does not claim footer
implementation or live acceptance, or authorize another presentation.

## Public, reproducible SDK evidence

The SDK inspected for this revision is the published **`@get-bb/plugin-sdk`
0.6.33**, also pinned by the plugin on main. This is public package inspection,
not evidence of the SDK shipped by any live application. It replaces the
previous report's unverified shipped-distribution attribution and renderer
claims.

- [Registry metadata](https://registry.npmjs.org/@get-bb%2fplugin-sdk/0.6.33)
- [Tarball](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.33.tgz)
- Integrity: `sha512-cqEte+M3dSmR1YIJTc/k4r4Uv8ER1gXiNbyImTLqpG8C/2qHMZSxZH1alnWVmRkTaXJB80nxWO9Y4EKaEIEs9w==`
- Inspected archive members: `package/package.json`,
  `package/bundled-types/bb-plugin-sdk-app.d.ts` and
  `package/bundled-types/bb-plugin-sdk.d.ts`.

The downloaded archive's SHA-512 matched that integrity value, and its package
metadata identifies the name and version above. To reproduce without installing
or executing the package, read and verify the archive in memory:

```python
import base64, hashlib, io, json, tarfile, urllib.request
url = "https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.33.tgz"
expected = "sha512-cqEte+M3dSmR1YIJTc/k4r4Uv8ER1gXiNbyImTLqpG8C/2qHMZSxZH1alnWVmRkTaXJB80nxWO9Y4EKaEIEs9w=="
data = urllib.request.urlopen(url).read()
actual = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
assert actual == expected
with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
    metadata = json.load(archive.extractfile("package/package.json"))
    assert metadata["name"] == "@get-bb/plugin-sdk"
    assert metadata["version"] == "0.6.33"
    for name in ["bb-plugin-sdk-app.d.ts", "bb-plugin-sdk.d.ts"]:
        print(archive.extractfile("package/bundled-types/" + name).read().decode())
```

## SDK declarations and limits

The root and app declarations agree on these footer contracts:

| Surface | Published contract | What it establishes |
| --- | --- | --- |
| `app.experimental_sidebarFooter.register` | Shared fields `id`, `label`, `icon`; action adds `kind: "action"` and `onActivate`; disclosure adds `kind: "disclosure"` and `component`. | Declared host-managed footer items; these forms have no inline row-content or numeric-count field. |
| `ExperimentalSidebarFooterItemBase.label` | Documented as tooltip and accessible text for a host-rendered icon button. | A label alone does not establish a visible number. |
| Disclosure `component` | Documented as plugin content above the footer row; props provide `dismiss`. | A number in disclosure content would not demonstrate inline footer-row rendering. |
| `ExperimentalSidebarFooterDisclosureController` | `open`, `close`, `toggle`. | Controls disclosure visibility; this version declares no `setAlert` member here. |
| `app.slots.sidebarFooterAction` | Compatibility registration has `id`, `title`, `icon`, `run`; context supplies `openSettings`. | The documented compatibility surface is a host-rendered icon action. |

These are static declarations and their documentation, not observations of a
running renderer. They establish the documented icon/disclosure interfaces,
but cannot prove a live number works or that every possible technique is
impossible. The outcome therefore remains **unclear**.

## Owner observations (separate from agent evidence)

Two sanitised observations recorded on #2 describe the owner's application:

- [Footer appearance](https://github.com/openwizdev/wizplugins/issues/2#issuecomment-6766179261):
  the owner saw a card-style row with text, a changing account-state number,
  a button and a progress bar, plus a lower row of icon buttons and compact
  controls. This shows that the footer region contains numbers and text;
  it does not identify which elements use plugin APIs.
- [Preference descriptions](https://github.com/openwizdev/wizplugins/issues/2#issuecomment-6766196172):
  the owner observations include preferences for ordering built-in and plugin
  footer actions and moving them into the overflow menu. They establish that
  plugin actions participate in footer organization, not that they can render
  a live number.

Neither observation establishes a plugin-drawn number updating in the footer
row. They are owner observations, not an agent-run live inspection or agent
rendering proof.

## Live evidence and W11 status

No agent-run live look was done. No identifying live evidence was collected.
**There is no private evidence record.** There is no artifact archive or
handoff awaiting verification for this report. The public package and the
linked owner observations are the evidence available here; the previous
status-response and private-archive claims are withdrawn.

No plugin was installed, enabled, reloaded or invoked for this report. No
thread, setting or live application state was changed. No product action,
publishing, or paid discovery service was started.

| Claim | Evidence class | Result |
| --- | --- | --- |
| Published SDK footer API identified | Public package inspection with verified integrity | SDK 0.6.33 contracts above are reproducible |
| SDK actually shipped by the owner's application identified | Agent live inspection | Not established |
| Footer region contains text and numbers | Owner observation | Reported appearance; plugin ownership not established |
| Plugin footer items share ordering and visibility preferences | Owner observation | Preference descriptions recorded on #2 |
| A plugin can draw a live number in the footer row | Agent live inspection | Not performed; outcome unclear |
| W11 live capability proven | Live rendering evidence | Unverified; proof remains for #9 under WF1 |
| WZ5 may proceed without this spike's live proof | Owner decision, WF1 | Yes, under the render-nothing rule; no substitute location |
