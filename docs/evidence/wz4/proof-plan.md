# WZ4 target and proof plan

Status: row implementation and synthetic fixture verification, 2026-11-10.
The target-stage plan below is retained with its later SDK/mapping ruling.
Live host acceptance and exact host-icon fidelity remain Unverified.
Source baseline: `9ee3e843220968ab9e997cda16a25854921f1d26`.
The [scope ruling](https://github.com/openwizdev/wizplugins/issues/5#issuecomment-6762459842)
authorizes this target and plan while the field decision remains blocked.

## App brief

Surface: WizBar's existing thread list. A person scanning a synthetic fleet needs
to see where each visible thread runs beside its status, then open the thread or
use the existing parking controls. Keep the three-line Inbox cards and compact
Snoozed/Settled rows. No independent WizBar taste profile or mood-board revision
is supplied; preserve the existing source design rather than importing a profile
from another product. Brief revision: WZ4 target v1.

Hard rules, from [#5](https://github.com/openwizdev/wizplugins/issues/5) and the
[shared contract](../../../wizbar/contracts/wizbar.v1.md): a cloud or laptop marker
beside the status slot on every applicable visible row; status, navigation,
shortcuts, controls and child/header behavior retained; no footer change. The
host's actual default icons must eventually be reused or visually matched after
authorized observation. This target uses illustrative silhouettes, not a verified
host asset. The execution field remains Unverified; no hostname, branch or null
host heuristic and no invented SDK property is proposed.

Observed patterns: `ThreadCard.tsx` uses three lines (project/status, title,
branch/activity/provider), a full-row navigation anchor beneath controls, 10px
horizontal padding and 8px vertical padding. `SlimRow.tsx` is a 32px single line
with a trailing status/wake slot. `StatusSlot.tsx` reserves a fixed 28px status
column and 14px glyph boxes. A collapsed shelf shows its existing count header
and hides its child rows; opening it reveals compact rows. This plan adds no
marker to an aggregate header and does not change collapse behavior.

## Design specification and critique before generation

- Type: existing host sans-serif; row titles 14px, compact rows 12px, metadata and
  time labels at the existing `text-2xs` scale. Branches retain monospace. No font
  file or font dependency is added; actual host font loading is Unverified.
- Color: inherit `text-foreground`, `text-muted-foreground`, sidebar background,
  sidebar accent and border roles. Concept colors are neutral charcoal ground,
  a slightly lifted selected row, off-white primary text and readable gray
  metadata/markers. These are illustrative roles, not new production tokens.
- Layout: retain 6px list gutters, approximately 10px row padding, small existing
  corners and compact gaps. A fixed 14px machine-glyph box sits immediately left
  of the existing status/control area. It stays present on hover and keyboard
  focus while existing park/restore controls use their current cell. Titles
  truncate before they can consume the marker/status space.
- Phone: at 390 CSS px the list uses available drawer width; no added column,
  navigation, wrapping rule or control. Desktop: at 1440 CSS px the sidebar stays
  narrow beside a neutral content area; cards do not stretch across the page.
- Identity: WizBar heading and existing list structure. No new badge system,
  execution text on every row, count, footer contribution or marketing treatment.
- Critique: a small neutral silhouette should remain distinguishable from the
  status glyph without competing with the title. Keeping it outside the yielding
  status cell protects its visibility on hover. Long-title and keyboard-focus
  checks are still required in real HTML. Generated legibility cannot establish
  contrast, actual dimensions, focus behavior or exact host icon fidelity.

## Synthetic content packet

These are presentation examples, not SDK data or a proposed schema. Future
fixtures may use the same literals only after an authoritative field is ruled.
All ages share a frozen clock; snoozed rows wake exactly 24 hours later, giving
`1d` under the existing relative wake rule. No real project, host, thread or account is used.

| Example key | Project | Shelf/form | Title | Execution illustration | Branch | Status/wake |
| --- | --- | --- | --- | --- | --- | --- |
| sample-a | Orchard | Inbox card | Review parser | Cloud | feature/parser | working spinner |
| sample-b | Harbor | Inbox card | Write guide | Local | none | 7m |
| sample-c | Orchard | Snoozed compact | Parser follow-up | Cloud | feature/parser | 1d |
| sample-d | Harbor | Snoozed compact | Guide follow-up | Local | none | 1d |
| sample-e | Orchard | Settled compact | Parser notes | Cloud | feature/parser | 2h |
| sample-f | Harbor | Settled compact | Guide notes | Local | none | 2h |

Both viewports use the same six rows: two Inbox cards, two Snoozed rows and two
Settled rows. Both shelves are expanded in the target; separate tests will
exercise collapse/reopen. Sample-b's missing branch leaves the third line sparse;
no host name is invented. A neutral provider glyph remains at each card's third
line edge. Supplemental desktop detail may show the same sample-b hovered, with
its laptop marker still present beside park controls; this is not a seventh row.

Edge variants for later rendered proofs:

- Empty: no threads; retain the existing `No threads yet` presentation and no
  per-row markers. A search with no matches retains `No threads found`.
- Zero: no parked threads; retain the current absent parked shelves and do not
  fabricate count rows. No footer count is introduced by this ticket.
- Long: use `Review parser compatibility and documentation across workspaces`
  for sample-a; clip the title without clipping the machine/status area.
- Sparse: sample-b alone, still with a laptop beside the status slot.
- Missing: branch absent remains independent of execution. An unreadable or
  absent execution discriminator has no approved UI treatment yet: keep that
  case blocked for the owner rather than assign a Cloud or Local value.

## Generated target prompt and route

Route: built-in OpenAI image tool, no API-key runner. New image, no image input.
Reference role: existing source layout described above; no screenshot or private
material is supplied. `target.png` is a paired target concept, not a screenshot
and not literal CSS-pixel capture evidence.

Prompt:

> Use case: ui-mockup. Create one landscape design target sheet for a very small
> change to WizBar, an existing compact dark sidebar. Label the sheet "WZ4 target
> concept". Show two clearly labelled viewport concepts: "390 CSS px" and
> "1440 CSS px". The phone concept is a full-width narrow sidebar; the desktop
> concept has the same narrow sidebar at its left with a plain empty charcoal
> content area to its right. Preserve the same six-row packet in both views.
> Neutral charcoal surfaces, off-white text, legible muted gray metadata,
> system sans-serif, restrained small rounded corners; no decorative dashboard.
> Sidebar heading "WizBar", project scope label "All projects". Inbox has two
> three-line cards. Card one: project "Orchard" at top left, small outline cloud
> immediately left of working spinner at top right; title "Review parser";
> branch "feature/parser" at bottom left, small neutral provider glyph at right.
> Card two: project "Harbor", small outline laptop immediately left of "7m" at
> top right; title "Write guide"; sparse third line and provider glyph at right.
> Then an expanded "Snoozed" shelf with two 32px compact rows: "Parser follow-up",
> cloud, "Tomorrow"; "Guide follow-up", laptop, "Tomorrow". Then an expanded
> "Settled" shelf: "Parser notes", cloud, "2h"; "Guide notes", laptop, "2h".
> On compact rows the machine icon is immediately left of the fixed trailing
> status/wake area. Thin outlines distinguish cloud and laptop, same neutral
> size/color, about 14px; never color-code execution. Keep shelf chevrons and
> grouping separators. Desktop may include one small labelled "Hover detail"
> showing the same Write guide top line with laptop still visible beside clock
> and check parking controls, clearly separate from the six-row list. This is
> a proposed marker-placement target only: exact host icons and execution data
> mapping remain unverified. Include the small caption "Illustrative icons;
> field mapping unverified" outside the UI. No footer, count, command panel,
> host names, identifiers, usernames, private paths, photographs or live content.
> Keep all titles and trailing markers unclipped and legible. No additional UI
> features, fake product claims or testimonials.

## Claims and planned evidence

No test is added or changed in this preparation-only commit. For each future
regression case, run the proof red before its fix and commit the synthetic red
log before implementation. Expected labels and counts come from the literal
packet and ticket, not from the implementation under test.

| Claim / criterion | Public boundary and evidence | Plausible break / current gap |
| --- | --- | --- |
| Authoritative field maps Cloud and Local | Separately authorized real-host observation, raw evidence private, public sanitized conclusion with verified private-record pointer | Pinned SDK has no discriminator; fixture success cannot close this gap. Blocked. |
| Both icons appear on each card | Render registered thread list with both ruled execution kinds, assert each named row has exactly its expected accessible marker; include branch/no-branch cases | Existing 82 tests do not assert machine markers; a branch-dependent rendering condition could omit one. |
| Both icons appear on compact Snoozed and Settled rows | Render registered list with controlled lifecycle results; expand each shelf, assert each visible row's marker; collapse and reopen to verify retained presentation and existing hidden-row behavior | Cards alone miss SlimRow; hidden rows must not create duplicate accessible markers. |
| Search/project filtering preserves the surviving row's marker | Drive existing search prop and scope control through registered list; check literal surviving titles and exact per-row marker count | An input path could drop classification or attach another row's marker. |
| Existing interaction and header behavior is preserved | Registered rendered-app assertions for normal/modifier navigation, shortcut attributes, status/wake labels, park/restore callbacks, keyboard focus, and parent/child behavior; unchanged upstream suite | A marker could intercept the full-row anchor, be replaced on hover, displace controls, or accidentally change the child/header presentation. |
| Visual marker persists at rest, hover and focus | Real synthetic HTML screenshots at 390 x 844 and 1440 x 900, compare against target; inspect both types, long title, controls and actual resolved color pairs | jsdom cannot establish clipping, contrast, hover layout or measured visual placement. Host icon fidelity still requires authorized observation. |
| Footer remains outside this change | Scoped diff review of owned paths; no footer registration/count edit | No fixture claim of a global live count. |

Owning proof location: rendered registration/slot boundary using the existing SDK
app harness. New cases belong to the ticket-owned `ThreadCard.test.tsx`,
`SlimRow.test.tsx` and `MachineIcon.test.tsx`; reuse their fixture setup rather
than copy a behavior inventory. Existing tests stay unchanged in meaning. If the
public app boundary needs another owned path, ask before editing it. Never add a
test-only production seam or mock that supplies the asserted classification.

Later scoped commands from `wizbar/`: `npm ci`, `npm run typecheck`,
`npm test -- --maxWorkers=2`, plus the red/green proof during each slice.
The supported build remains Unverified under #3's ruling; the inherited legacy
build command must not be run. Baseline receipts already observed at the source
revision: install and typecheck pass; 82 tests pass in six files. These are
baseline results, not proof of WZ4 behavior. This target-only change needs image,
Markdown, privacy and owned-path inspection; it does not change runtime code.

Downstream: #8 will use the eventual finished row UI and sanitized screenshots.
No new API seam is proposed. Installation, running the plugin, live screenshots,
new dependencies, publication and spending remain owner gates. No PR is opened
until a further ruling permits implementation and the field prerequisite is met.


## Target iteration record

Initial generation is retained as `target-v1.png`; the selected corrected image
is `target.png`. The original prompt above describes the first generation.
The packet table and the correction below specify the intended existing wake
format, not the first generation's longer label.

First-image inspection: both viewport concepts show the six intended rows and
cloud/laptop placement. Four details diverged from the existing source: verbose
Tomorrow labels, provider-brand silhouettes instead of neutral dots, a toggled
Inbox heading, and a hover inset retaining age beside park controls. Decorative
row borders also overstated the source treatment. These are image defects, not
requests to change existing behavior.

Correction prompt (built-in image edit; `target-v1.png` is the sole edit target):

> Edit this WZ4 target concept sheet, keeping both viewport panels, all six row
> identities, the exact cloud/laptop marker positions, the overall composition
> and all other text. Correct only these details to match the existing sidebar:
> (1) Replace every Tomorrow wake label in BOTH panels with 1d, since wake times
> remain the existing short relative labels. (2) Replace the four GitHub-like
> provider logos at the ends of the two cards in both panels with tiny neutral
> gray dots. No new provider brand. (3) In BOTH lists, remove the collapsible
> Inbox heading and its chevron; retain plain spacing above the first card,
> since Inbox is not a toggled shelf in this state. Keep Snoozed and Settled as
> the only expandable shelves. (4) For the separate Hover detail inset: show the
> card's TOP metadata line, so the left label is Harbor rather than Write guide.
> At right the laptop stays visible, followed by small clock then check icons as
> compact unboxed controls. Remove 7m from this hover-only inset because the
> park controls replace the status cell. Keep 7m in the normal unhovered Harbor
> cards. (5) Remove decorative visible borders from all list cards and compact
> rows, retaining only a very subtle selected fill on Review parser and the
> existing shelf separators. Keep the illustrative cloud/laptop glyphs same
> neutral small size. This is a target concept only, do not add screenshots or
> product claims. Preserve the heading and bottom caption, no footer, no private
> data.

Selected-image inspection: both labelled viewport concepts retain the six exact
row titles, the two execution silhouettes beside each status/wake slot, `1d`
wake labels, `7m` and `2h` ages, neutral provider dots and unchanged shelf names.
The hover inset keeps the laptop while clock/check controls replace age. No
footer, execution count or private content is pictured. The generated sheet is
1536 x 1024 and represents the intended viewport compositions; it is not a
390px/1440px browser capture. Row heights, top spacing, corner shapes and text
sizes are illustrative: the existing source dimensions remain authoritative.
Actual host assets, resolved color contrast, keyboard behavior and responsive
HTML screenshots remain Unverified until their separate proofs are permitted.

## Implementation proof slice after SDK merge

2026-11-10: #13 merged as `19c0ceefde9af81f18f57973d476225bdda65b60`;
that main was merged into this branch before implementation. The installed
published SDK is 0.6.33. Its app declaration for `PluginSidebarThread` has a
nullable `environment` containing `providerId: string | null`. The sidebar hook
returns that declared thread type. The older prerequisite statements above are
historical; the latest [proceed ruling](https://github.com/openwizdev/wizplugins/issues/5#issuecomment-6763874405)
permits implementation using WD5's nested field rule.

WD5's approved observed pattern: a present environment with null or empty
provider ID is Cloud; a set string is Local. Missing environment or missing/
unreadable provider ID yields no icon. This is an owner-approved mapping from
an observed desktop pattern, not a classification guaranteed by SDK docs.
Private record: https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6763200469

Before writing tests: the observable claim is each applicable visible row's
accessible Cloud/Local marker, with no marker for unknown data. A plausible bug
is treating a missing environment as Cloud, relying on branch presence or host
name, or inserting the marker in cards but omitting compact rows. The existing
188 tests do not assert these markers. One table at the registered thread-list
boundary owns the mapping across Inbox, Snoozed and Settled forms, with a frozen
clock and controlled lifecycle rows. It also covers branch/no-branch, filtering,
collapse/reopen and navigation/park/restore regression checks. No fixture computes
its expected label with the implementation's classification logic.

Icon source: the copied plugin uses Hugeicons for its named icons. The SDK has a
generic named icon renderer but does not publish an exported default sidebar
Cloud/Local component or guarantee a Cloud registry name. Use the existing icon
library's neutral outline cloud and laptop as the visual equivalent, matching
the target's silhouette. This adds no dependency or host lookup. Live host icon
fidelity remains a separate observation; no exact-host-artwork claim is made.
