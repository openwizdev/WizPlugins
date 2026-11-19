// The specs file reader (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md section 1.
import type { SpecsFileReadV4, SpecsReadV4 } from "../fixtures/v4";

/** Where the specs file lives, relative to the bound factory's home root. */
export const specsRelativePath = ".openwiz/specs.v1.json";

/** Section 1's reading table, first match wins. Every failure is unavailable, never zero. */
export function readSpecsFile(read: SpecsFileReadV4, _now: number): SpecsReadV4 {
  return { status: "unavailable", reason: read.kind === "content" ? "malformed" : read.kind };
}
