# WZ11 settings target brief

Scope: the WizBar plugin settings section in #25, approved by plan revision 8.
No separate WizBar taste profile exists in this repository. Reuse the plugin's
host tokens and compact system-font controls; do not import another product's theme.
Baseline: 0e1cecc81e9e3e9f739d99c6a970e39fcd668290. Rubric: WZ11 v1.

Task: choose which WizBar features are visible and see whether their data is verified.
Reading order: WizBar/version, two switches, source status, live-acceptance limit.
The generated target is design guidance, never a host observation.

Specification: system-ui; title 18px/600, body 14px/20px, secondary 13px/20px.
Host background/foreground/muted-foreground/border tokens. Quiet separators,
24px section padding, 16px row gaps, 8px corner radius, native checkbox switches
with visible keyboard focus. Maximum content width 640px. At 390px the same
reading order wraps in one column; at 1440px it stays left aligned within its host.
No hero, decorative artwork, dashboard counts or fabricated live values.

Synthetic packet: actual manifest version 0.1.0; Footer count enabled,
Cloud/Local row icons enabled. Footer source unavailable (not connected).
Icons source unverified (current mapping awaits authoritative source integration).
PC persistence and presentation unverified until #9. Disabled variant keeps source
status visible. Missing/empty source never shows a count. Long explanations wrap.
A later verified source may explicitly report live; switching on cannot do so.

Pre-generation critique: two simple preference rows meet the requested scope;
separate source lines prevent enabled from being mistaken for live. Native controls
keep keyboard behavior and host palette compatibility without a new dependency.
