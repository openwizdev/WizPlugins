// The specs reader on WizBar's server (WB4-1): specs-section.v1.md section 1.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createSpecsCommands, type SpecsCommands } from "./cli";

interface Handles {
  settings: { get(): Promise<{ specsOpen?: unknown }>; experimental_set(values: { specsOpen?: string | null }): Promise<{ specsOpen?: unknown }> };
  factories: { get(): Promise<{ wizdeckFactories?: unknown }> };
}

export function registerSpecs(_bb: BbPluginApi, _handles: Handles): SpecsCommands {
  return createSpecsCommands();
}
