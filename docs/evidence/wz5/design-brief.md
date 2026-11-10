# WZ5 target brief

Surface: the existing sidebar footer; small addition, no new screen or flow.
Source revision: current WizBar source and WF1 on #6 (2026-11-10).
Decision summary: a compact spinner and one total; dim zero; hover exposes only
the thread/subagent split; no click effect. Live proof belongs to #9.
Private record: https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6768789971

Hard rules: footer only, no substitute icon-only action or popup card. No
Cloud/Local breakdown. Render nothing if current data/content cannot be rendered.
Observed patterns: existing sidebar uses host semantic colors, small text,
rounded shapes and muted idle state. Preserve those patterns rather than applying
a different product's taste profile. No separate mood-board revision exists here.
Rubric: WZ5-v1, unchanged through this implementation.

Person/task: a fleet owner glances at total activity across projects, then hovers
to distinguish working threads from in-thread subagents. No next action.
Type: host inherited sans-serif; 12px label/number, tabular numerals; no new font.
Colors: inherited host foreground/muted-foreground, popover background/border.
Spacing: 6px icon gap, 8px horizontal / 4px vertical padding; 14px spinner.
Composition: inline item in the footer row, compact hover text above it.
Phone (390px): the same item remains inline; desktop (1440px): same sidebar item.
No responsive navigation changes. No invented branding or host features.

Synthetic packet: zero = 0 working threads + 0 subagents; positive = 2 working
threads in two projects (one is a child), plus 3 in-thread subagents = total 5.
Hover copy: `2 threads, 3 subagents`. An idle record and a long-title record do not
add to the number. Empty-ready feed is zero; missing/loading/error feed is blank.
The target illustrates all three states side by side at each intended viewport;
it is design guidance, not a host screenshot or runtime evidence.

Critique: the count remains the only numeric emphasis. The hover is compact and
contains exactly the arithmetic behind it. No clickable styling or action label.

Generation: built-in image tool, ui-mockup, no reference images or API-key runner.
Selected target: `target.png`; inspected for copy, arithmetic and state separation.
The request included the footer caption explaining that production remains blank
while inputs are unverified. The intended spinner fits beside the number; the
hover is guidance rather than a proposal for a disclosure card.

Latest scope ruling on #6 permits namespaced custom artwork but requires the
production display to remain blank while completeness/subagent mapping is
unverified. The presentation can therefore be demonstrated only with explicitly
synthetic complete inputs; it must not be mistaken for the registered live app.
