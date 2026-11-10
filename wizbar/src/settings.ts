import type { PluginSettingDescriptors } from "@get-bb/plugin-sdk";

export const wizbarSettingDescriptors = {
  footerCountEnabled: {
    type: "boolean", label: "Footer count", default: true,
    description: "Show the running count when its source is available.",
  },
  machineIconsEnabled: {
    type: "boolean", label: "Cloud/Local row icons", default: true,
    description: "Show machine icons when classification is available.",
  },
} satisfies PluginSettingDescriptors;

export type WizBarSettings = { footerCountEnabled: boolean; machineIconsEnabled: boolean };
export type SettingValues = Record<string, string | number | boolean> | undefined;
export type Feature = "footer" | "icons";
export type SourceStatus = "live" | "unavailable" | "unverified";
export type SourceStatuses = Record<Feature, SourceStatus>;

// Contract-first stubs; completed only after their failing proofs are recorded.
export function readWizBarSettings(_values: SettingValues): WizBarSettings {
  return { footerCountEnabled: true, machineIconsEnabled: true };
}
export function getSourceStatuses(_pluginId: string): SourceStatuses {
  return { footer: "unavailable", icons: "unverified" };
}
export function reportFeatureSourceStatus(_pluginId: string, _feature: Feature, _status: SourceStatus): () => void {
  return () => {};
}
