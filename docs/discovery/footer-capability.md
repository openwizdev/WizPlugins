# Footer capability discovery (WZ1)

**Outcome: unclear.** A live number in the footer row has **not** been
demonstrated. [WZ5 (#6)](https://github.com/openwizdev/wizplugins/issues/6) must stop
and return to the owner. Merging this report does not satisfy that ticket's
positive-evidence prerequisite. Do not substitute an icon, disclosure card,
sidebar accessory, overlay, or another location.

Discovery date: 2026-11-10. Scope:
[WZ1 (#2)](https://github.com/openwizdev/wizplugins/issues/2), within the
[approved plan (#1)](https://github.com/openwizdev/wizplugins/issues/1).

## Inspected distribution

The inspected SDK metadata identifies version **0.6.51**. Identifying
installation and application-build details remain in private evidence.
This identifies the inspected SDK generation; it is not the older
`@get-bb/plugin-sdk` 0.4.4 dependency inherited by this repository. No SDK
package was installed or synchronized into a plugin.

Evidence came from the shipped `frontend-core-slots.md` and
`frontend-registration.md` references, bundled frontend registration and
footer-renderer code, and the two artifact metadata records. These are
distribution-relative artifact names, not locations on a discovery machine.
The earlier discovery report describes a private handoff of the raw artifacts
and their SHA-256 hashes; archival has not been verified. Shipped documentation
is summarized here rather than copied into this repository. The
[discovery summary on WZ1](https://github.com/openwizdev/wizplugins/issues/2#issuecomment-6761065879)
records the SDK findings and the unclear outcome.

## SDK and renderer evidence

| Surface | Observed contract in the shipped distribution | What it establishes |
| --- | --- | --- |
| `app.experimental_sidebarFooter.register` | Common fields: `id`, `label`, `icon`. An action adds `kind: "action"` and `onActivate`; a disclosure adds `kind: "disclosure"` and `component`. Registration validates the allowed keys. | Managed icon items exist in the footer. There is no separate row-content or numeric-count field in these registration forms. |
| Disclosure `component` | Receives `dismiss`; the host mounts its content in a section positioned above the footer. | Custom card content is distinct from inline footer-row content. A number in that card would not meet WZ5. |
| Disclosure controller | Provides `open`, `close`, `toggle`, and `setAlert`. The inspected alert renderer draws a dot and places its text in a screen-reader-only status element. | Dynamic alert text is not evidence of a visible numeric badge or count. |
| `app.slots.sidebarFooterAction` | Compatibility form: `id`, `title`, `icon`, `run`; the callback receives `openSettings`. | The compatibility action is an icon trigger, not a declared inline text slot. |
| Footer item renderer | Draws the icon; the item label is screen-reader-only and is also used for the tooltip. The compatibility icon takes a different rendering path from the newer footer registration. | A numeric label or tooltip alone does not prove the required visible number. |
| `app.experimental_icons.register` and `app.contentScripts.register` | The shipped frontend also has custom icon registration and trusted content scripts. | These prevent a blanket claim that all possible rendering techniques are impossible. Neither was exercised, and neither is an approved substitute or positive footer-number proof. |

These are static SDK/implementation observations, **not live rendering
observations**. They support icon/card capability, but do not conclusively
settle the required live-number presentation. The overall outcome therefore
remains **unclear**, rather than asserting a live-confirmed icon/card-only
limit.

## Live observation and limits

Earlier discovery recorded a read-only status response from a real application.
No footer rendering was observed. Identifying provenance and inspection
limitations remain in private evidence. No permission, setting or application
state was changed to obtain additional evidence. Consequently:

- No footer-row number was observed, either at zero or while work was running.
- No live numerical update, spinner, hover split, or inert-click behavior was
  verified.
- No screenshot, DOM snapshot, fixture, or type declaration is offered as proof
  of live footer-number support.

No plugin was installed, enabled, reloaded, built against the live application,
or invoked. No thread or setting was changed. No process performing product
actions, workload, release, publication, or additional paid discovery service
was started. Inspection used read-only commands against existing artifacts and
application status.

This report hand-back performed no additional live access. The separate
read-only footer look remains pending on
[WZ1 (#2)](https://github.com/openwizdev/wizplugins/issues/2); no new rendering
result was posted there at hand-back. Any later result must be recorded with
its evidence class before the outcome or WZ5 gate changes.

## W11 evidence handoff

Private evidence reference: **WZ1-W11-2026-11-10**. The earlier report identifies
the handoff as containing artifact contents and hashes, version metadata,
provenance, and the raw read-only status response. Its contents and retention
have not been independently verified during this hand-back. No identifying
evidence or screenshot is included here.

**Private-record archival is pending.** The orchestrator must archive and verify
the evidence under the existing private-record rules. The opaque reference is
an evidence handoff key, not a claim that archival is complete. W11's
private-record requirement remains open until that handoff is verified; the
handoff remains tracked on [WZ1 (#2)](https://github.com/openwizdev/wizplugins/issues/2).

The outstanding read-only observation is recorded in the
[private coordination record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6761652883).
That pointer records the remaining work; it is not the archived W11 evidence
or proof of live footer rendering.

| Claim | Evidence class | Result |
| --- | --- | --- |
| Inspected SDK generation and footer contracts identified | Shipped artifact inspection | SDK 0.6.51 metadata and the contracts above recorded |
| Earlier discovery reached a real application without product mutation | Reported read-only status and inspection procedure | Recorded in the earlier report; raw evidence readback pending |
| A live number is supported in the footer row | Live observation | Unverified; outcome unclear |
| Raw identifying evidence has a verified private-repository record | Private archival/readback | Pending owner handoff |
| WZ5 may proceed | Plan gate review | No; positive live footer-number evidence is absent |

The next decision belongs to the owner through
[WZ1 (#2)](https://github.com/openwizdev/wizplugins/issues/2). This report grants no
authority to install a probe, modify the footer, or try another presentation.
