// The Specs section's colours (WB4-1): host theme variables only, each with the
// contract's fallback for a host that lacks it (specs-section.v1.md section 9).
export const tokens = {
  accent: "var(--primary, #c0ff04)",
  /** The owner's "olive": section rules and "N done in the last hour". */
  mutedAccent: "color-mix(in oklch, var(--primary, #c0ff04) 45%, var(--sidebar, #161616))",
  warning: "var(--warning, #fc8c45)",
  border: "var(--border, #292929)",
  mutedText: "var(--muted-foreground, #b7b7b7)",
} as const;
