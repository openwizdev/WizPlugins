// The spec rows (WB4-1): specs-section.v1.md sections 2, 3 and 5. One pure
// computation over the specs file and the sidebar rows, shared by the Specs
// section and `wizbar specs`, so both show the same thing for the same input.
import type { PluginSidebarPullRequest, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { MatrixStateV4, SpecsFileV4, SpecsResultV4 } from "../fixtures/v4";

/** The row fields the spec rows read; the app's rows and the CLI reader both supply them. */
export type SpecsThreadRow = Pick<PluginSidebarThread,
  "id" | "displayTitle" | "parentThreadId" | "providerId" | "status" | "runtimeStatus" | "queuedWork" |
  "hasPendingInteraction" | "activity" | "createdAt" | "updatedAt">;

export function matrixState(_row: SpecsThreadRow, _pullRequest: PluginSidebarPullRequest | null): MatrixStateV4 {
  return "idle";
}

export function specRows(file: SpecsFileV4, _rows: readonly SpecsThreadRow[], _openKeys: readonly string[], now: number): SpecsResultV4 {
  return { version: 1, status: "ready", generatedAt: now, needsYou: 0, specs: [] };
}

export function sectionRule(_result: SpecsResultV4): string {
  return "";
}

/** The spec a running row belongs to (section 3), hidden specs included; null for none. */
export function matchSpec(_file: SpecsFileV4, _row: SpecsThreadRow): string | null {
  return null;
}

/** `Role · CODE: what it does` (section 3); nulls when the title does not parse. */
export function parseTitle(_title: string): { role: string | null; code: string | null } {
  return { role: null, code: null };
}
