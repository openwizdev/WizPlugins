// The Specs section's colours (WB4-1; 0.5 C, #112): host theme variables only,
// each with the contract's fallback for a host that lacks it (specs-section.v1.md section 9).
const primary = "var(--primary, #c0ff04)";
const sidebar = "var(--sidebar, #161616)";
const warning = "var(--warning, #fc8c45)";
const mutedText = "var(--muted-foreground, #b7b7b7)";
const border = "var(--border, #292929)";
/**
 * Done (0.5.x C2, #155): the host's success colour, else a neutral, never the warning or the accent,
 * so done stays apart from needs-you whatever `--primary` or a theme tint is.
 */
const success = `var(--success, ${mutedText})`;
/**
 * Done tones mix in oklab, not oklch: a host grey written `oklch(L 0 0)` has hue 0, and an oklch mix
 * from green toward it swings through yellow and orange, the needs-you hue (#155).
 */
const done = (percent: number, into: string) => `color-mix(in oklab, ${success} ${percent}%, ${into})`;
export const tokens = {
  accent: primary,
  /** The neutral border rule line beside a section's name. */
  rule: border,
  /** The owner's "olive": done dots and done marks. */
  mutedAccent: done(55, sidebar),
  /** "N done in the last hour": exactly the host's text, so its contrast is the host's own; the dots carry "done" (#155 lead decision). */
  doneNote: "var(--foreground)",
  /** A ticket done in the last hour: a brighter done dot. */
  brightOlive: done(85, sidebar),
  /** Needs-you only. */
  warning,
  border,
  mutedText,
  /** A1 (#186): an active spec's name, the host's text. An inactive one's is `mutedText`. */
  text: "var(--foreground)",
  /** A quiet grey ring: a held ticket. */
  quietRing: `color-mix(in oklch, ${mutedText} 45%, ${sidebar})`,
  /** The raised panel of an open spec. */
  card: "var(--card, #222222)",
} as const;
