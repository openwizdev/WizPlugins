// WizBar v0.4 contract shapes and synthetic fixtures (WB4-0, openwizdev/OpenWiz#1434).
// The rules behind every shape are in contracts/specs-section.v1.md. Every id,
// title, repository, number and URL here is made up. Expected values are worked
// out by hand from the contract, never by running v0.4 code, so later tickets
// test their computations against them.

// ---- Theme -----------------------------------------------------------------

/** One host theme variable WizBar may read, with its fallback for a host that lacks it. */
export interface HostTokenV4 {
  role: "surface" | "card" | "edge" | "accent" | "warning" | "border" | "text" | "muted-text" | "destructive";
  /** The host CSS custom property. */
  variable: `--${string}`;
  /** The only literal colour allowed for this variable, as `var(<variable>, <fallback>)`; null: no fallback. */
  fallback: string | null;
}

/** Contract section 9. Fallbacks are the owner's sampled sidebar values, else the locked bb-app 0.37.0 dark value. */
export const hostTokensV4: readonly HostTokenV4[] = [
  { role: "surface", variable: "--sidebar", fallback: "#161616" },
  { role: "card", variable: "--card", fallback: "#222222" },
  { role: "edge", variable: "--background", fallback: "#0f0f0f" },
  { role: "accent", variable: "--primary", fallback: "#c0ff04" },
  { role: "warning", variable: "--warning", fallback: "#fc8c45" },
  { role: "border", variable: "--border", fallback: "#292929" },
  { role: "text", variable: "--foreground", fallback: null },
  { role: "muted-text", variable: "--muted-foreground", fallback: "#b7b7b7" },
  { role: "destructive", variable: "--destructive", fallback: null },
];

/**
 * Hard-coded colours that predate 0.4, each named by file and exact text. The
 * theme check passes them and fails on any other literal; the list may only
 * shrink (contract section 9).
 */
export const themeExceptionsV4: ReadonlyArray<{ file: string; text: string; why: string }> = [];
