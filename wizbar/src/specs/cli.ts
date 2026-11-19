// `wizbar specs` and `wizbar spec` (WB4-1): specs-section.v1.md section 8.
import type { PluginCliResult } from "@get-bb/plugin-sdk";

export interface SpecsCommands {
  /** Runs `specs` or `spec`; null means a usage error. */
  run(argv: readonly string[], json: boolean, signal?: AbortSignal): Promise<PluginCliResult | null>;
}

export function createSpecsCommands(): SpecsCommands {
  return { async run() { return null; } };
}
