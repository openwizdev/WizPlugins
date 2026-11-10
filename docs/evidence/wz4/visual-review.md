# WZ4 rendered-app evidence

The generated target was committed at `1506c16` before row implementation.
`target.png` is the selected concept; `target-v1.png` retains the corrected-away
first attempt. The content packet, both prompts and their inspection are in
`proof-plan.md`. The target is illustrative, not a browser capture.

## Real synthetic render

`preview.html`, `preview.mjs` and `preview.css` render the actual registered app
through the SDK's fixture harness. Six synthetic rows match the target packet.
The app's real `ThreadCard`, `SlimRow`, `MachineIcon` and Hugeicons artwork render
in Chromium; no substitute marker or pre-rendered UI image is supplied. The
fixture stylesheet supplies a small subset of the host's utility classes and
neutral tokens for layout inspection. It is evidence-only and does not ship in
the plugin or establish actual host styling. No app connection, installation,
RPC transport or live thread is used.

The standard screenshot script captured the ready fixture at 390 x 844 and
1440 x 900, scale 1, reduced motion. Both captures were opened and inspected.
`screenshots/capture.json` records their URL, readiness selector, viewports and
content dimensions. Both content widths equal their viewport widths; no
horizontal overflow. `phone.png` and `desktop.png` are the matching normal state.

The `?long=1` fixture variant substitutes the packet's long parser title.
Additional real captures: `phone-hover-long.png` (Local card hovered) and
`desktop-focus-long.png` (Cloud compact row's existing restore control reached
with Tab). Both were inspected. These supplemental states use the same document
at the corresponding viewport dimensions.

## Target comparison

- Both normal viewports show the same two Inbox cards, two Snoozed compact rows
  and two Settled compact rows, with three Cloud and three Local markers.
- Cloud/laptop silhouettes sit immediately left of status/wake/control areas.
  Browser geometry confirms 14 x 14px boxes. The marker does not yield with the
  park/status cell, and long titles truncate before its column.
- The rendered hierarchy, 32px compact rows, typography and spacing follow the
  existing source; the generated concept's larger text and loose top spacing
  are illustrative deviations already recorded in the target inspection.
- The real app's Snoozed and Settled chevrons, rather than the image's approximate
  chevron orientation, follow the existing source. The preview's ground/panel
  roles are intentionally close neutral tones, with the first row selected.
- The preview has no added footer, search input, command panel or header chip.
  Existing filtering, collapse, parent/child and header behavior is covered by
  the app tests; WZ4 changes no such logic.

## Browser interaction and dark craft checks

`browser-checks.json` retains the measured values and assertions:

- Six markers remain visible at both widths with the long title, each inside the
  viewport. A Local card retains its laptop while its park controls appear.
- A pointer click in the marker area hits the underlying row anchor and produces
  the same SDK action sequence as a pointer click on the ordinary title area.
  The existing SDK/anchor path records pointer-down and click opens in both
  areas; this check claims preserved navigation, not a new single-open rule.
- A real Tab key reaches the compact Cloud row's restore button; the focus ring,
  button and machine marker remain visible. The adjacent time/control treatment
  is the unchanged source behavior.
- Browser-resolved colors measured with WCAG 2 relative sRGB luminance:

| Pair | Foreground | Background | Contrast |
| --- | --- | --- | --- |
| Primary text / ground | rgb(241, 243, 245) | rgb(24, 25, 28) | 15.80:1 |
| Metadata and marker / ground | rgb(185, 192, 202) | rgb(24, 25, 28) | 9.59:1 |
| Metadata and marker / selection | rgb(185, 192, 202) | rgb(44, 46, 52) | 7.40:1 |
| Shelf text / ground | rgb(146, 152, 161) | rgb(24, 25, 28) | 6.05:1 |

These inspected fixture pairs exceed 4.5:1; they do not certify the host's theme
or native controls. CSS uses dark `color-scheme` and theme color. Menus, scrollbars,
other platforms and live host icon fidelity are uninspected. The generic SDK
icon registry does not supply a guaranteed default sidebar Cloud/Local component
or name in its published contract; the existing Hugeicons cloud/laptop entries
provide the approved visual equivalent without a dependency or metadata lookup.

No helper was used. No host screenshot, live classification verification,
installation, activation or supported build is claimed by these fixtures.
