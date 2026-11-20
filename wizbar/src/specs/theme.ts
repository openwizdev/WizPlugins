// The Specs section's colours (WB4-1; 0.5 C, #112): host theme variables only,
// each with the contract's fallback for a host that lacks it (specs-section.v1.md section 9).
const primary = "var(--primary, #c0ff04)";
const sidebar = "var(--sidebar, #161616)";
const warning = "var(--warning, #fc8c45)";
/** The accent warmed by the warning (0.5 P, #130), so its mixes into the sidebar read olive, not lime-green. */
const warmAccent = `color-mix(in oklch, ${primary} 85%, ${warning})`;
export const tokens = {
  accent: primary,
  /** The olive rule line beside a section's name: quieter than the text olive. */
  rule: `color-mix(in oklch, ${warmAccent} 40%, ${sidebar})`,
  /** The owner's "olive": done dots and done marks. */
  mutedAccent: `color-mix(in oklch, ${warmAccent} 55%, ${sidebar})`,
  /** A brighter olive for "N done in the last hour", 4.5:1 or better on the sidebar and the open card (#131 R1). */
  doneNote: `color-mix(in oklch, ${warmAccent} 75%, ${sidebar})`,
  /** Bright olive: a ticket done in the last hour. */
  brightOlive: `color-mix(in oklch, ${primary} 85%, ${sidebar})`,
  warning,
  border: "var(--border, #292929)",
  mutedText: "var(--muted-foreground, #b7b7b7)",
  /** A quiet grey ring: a held ticket. */
  quietRing: `color-mix(in oklch, var(--muted-foreground, #b7b7b7) 45%, ${sidebar})`,
  /** The raised panel of an open spec. */
  card: "var(--card, #222222)",
} as const;
