import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { experimental_usePluginId, useSdk, useSettings } from "@get-bb/plugin-sdk/app";
import manifest from "../package.json";
import {
  getSourceStatuses, readWizBarSettings, reportFeatureSourceStatus,
  subscribeSourceStatuses, wizbarSettingDescriptors,
  type Feature, type SettingValues, type SourceStatus, type WizBarSettings,
} from "./settings";

interface SettingsAcknowledgement {
  baseline: SettingValues;
  values: SettingValues;
  saveState: "idle" | "saving" | "saved" | "error";
}
const emptyAcknowledgement: SettingsAcknowledgement = {
  baseline: undefined, values: undefined, saveState: "idle",
};
interface SettingsStore {
  snapshot: SettingsAcknowledgement;
  listeners: Set<() => void>;
  consumers: number;
}
const acknowledgements = new Map<string, SettingsStore>();

function settingsStore(pluginId: string): SettingsStore {
  let store = acknowledgements.get(pluginId);
  if (!store) {
    store = {
      snapshot: emptyAcknowledgement,
      listeners: new Set(), consumers: 0,
    };
    acknowledgements.set(pluginId, store);
  }
  return store;
}

function publishSettings(store: SettingsStore, snapshot: SettingsAcknowledgement) {
  store.snapshot = store.consumers === 0 && snapshot.saveState !== "saving"
    ? emptyAcknowledgement
    : snapshot;
  for (const listener of store.listeners) listener();
}

function useSettingsSnapshot() {
  const pluginId = experimental_usePluginId();
  const host = useSettings();
  const store = settingsStore(pluginId);
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot);
  useEffect(() => {
    store.consumers++;
    return () => {
      if (--store.consumers === 0 && store.snapshot.saveState !== "saving") {
        store.snapshot = emptyAcknowledgement;
      }
    };
  }, [pluginId, store]);
  // An acknowledgement bridges host refresh only for the snapshot it saved.
  const values = snapshot.baseline === host.values ? snapshot.values ?? host.values : host.values;
  return { pluginId, host, store, values, saveState: snapshot.saveState, saving: snapshot.saveState === "saving" };
}

export function useWizBarSettings(): WizBarSettings {
  return readWizBarSettings(useSettingsSnapshot().values);
}

/** Source adapters publish even while their feature is hidden. */
export function useFeatureSourceStatus(feature: Feature, status: SourceStatus) {
  const pluginId = experimental_usePluginId();
  useEffect(() => reportFeatureSourceStatus(pluginId, feature, status), [pluginId, feature, status]);
}

export function SettingsPage() {
  const { pluginId, host, store, values, saveState, saving } = useSettingsSnapshot();
  const sdk = useSdk();
  const settings = readWizBarSettings(values);
  const latestHost = useRef(host.values);
  latestHost.current = host.values;
  const message = { idle: "", saving: "Saving…", saved: "Saved", error: "Could not save. Try again." }[saveState];
  const error = saveState === "error";
  const subscribe = useCallback((listener: () => void) => subscribeSourceStatuses(pluginId, listener), [pluginId]);
  const statuses = useSyncExternalStore(subscribe, () => getSourceStatuses(pluginId));
  const unavailable = host.isLoading || host.values === undefined;

  async function save(key: keyof WizBarSettings) {
    if (unavailable || store.snapshot.saveState === "saving") return;
    const baseline = host.values;
    publishSettings(store, { baseline, values, saveState: "saving" });
    try {
      const result = await sdk.plugins.updateSettings({ pluginId, values: { [key]: !settings[key] } });
      publishSettings(store, {
        baseline,
        values: latestHost.current === baseline ? result.values : undefined,
        saveState: "saved",
      });
    } catch {
      publishSettings(store, { baseline, values, saveState: "error" });
    }
  }

  const sourceRows = [
    { feature: "footer", label: "Footer", source: "running-count", enabled: settings.footerCountEnabled },
    { feature: "icons", label: "Icons", source: "Cloud/Local", enabled: settings.machineIconsEnabled },
  ] as const;

  return (
    <section aria-label="WizBar settings" style={{
      maxWidth: 640, padding: 24, color: "var(--foreground)",
      fontFamily: "system-ui, sans-serif", fontSize: 14, lineHeight: "20px",
    }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>WizBar</h2>
      <p style={{ color: "var(--muted-foreground)", margin: 0 }}>Version {manifest.version}</p>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 20, display: "grid", gap: 16 }}>
        {(Object.keys(wizbarSettingDescriptors) as (keyof WizBarSettings)[]).map((key) => {
          const descriptor = wizbarSettingDescriptors[key];
          return (
            <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
              <input type="checkbox" role="switch" aria-label={descriptor.label}
                checked={settings[key]} disabled={saving || unavailable}
                onChange={() => { void save(key); }}
                style={{ margin: "3px 0 0", width: 16, height: 16, flexShrink: 0 }} />
              <span>
                <strong style={{ fontWeight: 600 }}>{descriptor.label}</strong>
                <span style={{ display: "block", color: "var(--muted-foreground)" }}>{descriptor.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Data sources</h3>
        {sourceRows.map(({ feature, label, source, enabled }) => (
          <div key={feature} style={{ marginTop: 12 }}>
            <strong style={{ fontWeight: 600 }}>{label}{": "}{enabled ? "Enabled" : "Disabled"} · {statuses[feature] === "live" ? "Live" : "Not connected yet"}</strong>
            <p style={{ color: "var(--muted-foreground)", margin: 0 }}>
              {statuses[feature] === "live" ? "Connected to the current verified source."
                : statuses[feature] === "unavailable" ? `The ${source} source is not connected.`
                : `The ${source} source is still being checked.`}
            </p>
          </div>
        ))}
      </div>
      {unavailable && <p>Settings are unavailable. Changes cannot be saved.</p>}
      <div role="status" aria-label="Settings save" aria-live="polite" style={{ color: "var(--muted-foreground)", marginTop: message ? 16 : 0 }}>
        <span role={error ? "alert" : undefined}>{message}</span>
      </div>
    </section>
  );
}
