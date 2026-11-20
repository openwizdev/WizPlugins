// The Specs section's colours (WB4-1; 0.5 C, #112): host theme variables only,
// each with the contract's fallback for a host that lacks it (specs-section.v1.md section 9).
const primary = "var(--primary, #c0ff04)";
const sidebar = "var(--sidebar, #161616)";
export const tokens = {
  accent: primary,
  /** The olive rule line beside a section's name: quieter than the text olive. */
  rule: `color-mix(in oklch, ${primary} 40%, ${sidebar})`,
  /** The owner's "olive", raised to read on the sidebar: "N done in the last hour", done dots and done marks. */
  mutedAccent: `color-mix(in oklch, ${primary} 60%, ${sidebar})`,
  /** Bright olive: a ticket done in the last hour. */
  brightOlive: `color-mix(in oklch, ${primary} 85%, ${sidebar})`,
  warning: "var(--warning, #fc8c45)",
  border: "var(--border, #292929)",
  mutedText: "var(--muted-foreground, #b7b7b7)",
  /** A quiet grey ring: a held ticket. */
  quietRing: `color-mix(in oklch, var(--muted-foreground, #b7b7b7) 45%, ${sidebar})`,
  /** The raised panel of an open spec. */
  card: "var(--card, #222222)",
} as const;
