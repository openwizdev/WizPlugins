// The Specs section's colours (WB4-1; 0.5 C, #112): host theme variables only,
// each with the contract's fallback for a host that lacks it (specs-section.v1.md section 9).
const primary = "var(--primary, #c0ff04)";
const sidebar = "var(--sidebar, #161616)";
const warning = "var(--warning, #fc8c45)";
const mutedText = "var(--muted-foreground, #b7b7b7)";
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
  /** The done rule line beside a section's name: quieter than the done dots. */
  rule: done(40, sidebar),
  /** The owner's "olive": done dots and done marks. */
  mutedAccent: done(55, sidebar),
  /**
   * "N done in the last hour": mostly the host's text, a quarter done, so it keeps about two thirds of the text's own
   * contrast on any sidebar or card, tinted too: 4.5:1 or better wherever the host text is 6.7:1 or better (#159 R1).
   */
  doneNote: done(25, `var(--foreground, ${mutedText})`),
  /** A ticket done in the last hour: a brighter done dot. */
  brightOlive: done(85, sidebar),
  /** Needs-you only. */
  warning,
  border: "var(--border, #292929)",
  mutedText,
  /** A quiet grey ring: a held ticket. */
  quietRing: `color-mix(in oklch, ${mutedText} 45%, ${sidebar})`,
  /** The raised panel of an open spec. */
  card: "var(--card, #222222)",
} as const;
