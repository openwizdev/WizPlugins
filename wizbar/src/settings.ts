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
export type SourceStatuses = Readonly<Record<Feature, SourceStatus>>;

/** Unknown present values fail closed; absent values preserve the declared defaults. */
export function readWizBarSettings(values: SettingValues): WizBarSettings {
  const read = (key: keyof WizBarSettings): boolean => {
    const value = values?.[key];
    return value === undefined ? wizbarSettingDescriptors[key].default : value === true;
  };
  return { footerCountEnabled: read("footerCountEnabled"), machineIconsEnabled: read("machineIconsEnabled") };
}

const defaults: SourceStatuses = { footer: "unavailable", icons: "unverified" };
interface SourceStore {
  reports: Record<Feature, Map<symbol, SourceStatus>>;
  snapshot: SourceStatuses;
  listeners: Set<() => void>;
}
const stores = new Map<string, SourceStore>();
function sourceStore(pluginId: string): SourceStore {
  let store = stores.get(pluginId);
  if (!store) {
    store = {
      reports: { footer: new Map(), icons: new Map() },
      snapshot: defaults, listeners: new Set(),
    };
    stores.set(pluginId, store);
  }
  return store;
}

/** Stable snapshots for useSyncExternalStore; status is never persisted. */
export function getSourceStatuses(pluginId: string): SourceStatuses {
  return sourceStore(pluginId).snapshot;
}
export function subscribeSourceStatuses(pluginId: string, listener: () => void): () => void {
  const store = sourceStore(pluginId);
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
}

/** A report lives exactly as long as its source adapter, independently of visibility. */
export function reportFeatureSourceStatus(pluginId: string, feature: Feature, status: SourceStatus): () => void {
  const store = sourceStore(pluginId);
  const token = Symbol();
  const reports = store.reports[feature];
  const refresh = () => {
    const statuses = [...reports.values()];
    const next = statuses.length === 0 ? defaults[feature]
      : statuses.includes("unavailable") ? "unavailable"
      : statuses.includes("unverified") ? "unverified" : "live";
    if (store.snapshot[feature] === next) return;
    store.snapshot = { ...store.snapshot, [feature]: next };
    for (const listener of store.listeners) listener();
  };
  reports.set(token, status);
  refresh();
  return () => {
    reports.delete(token);
    refresh();
  };
}
