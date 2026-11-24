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
  childrenChipEnabled: {
    type: "boolean", label: "Children chip in thread header", default: false,
    description: "Show a parent thread's children chip in its header.",
  },
  parentChipEnabled: {
    type: "boolean", label: "Parent chip in thread header", default: true,
    description: "Show a child thread's chip back to its parent in its header.",
  },
} satisfies PluginSettingDescriptors;

/**
 * WB4-1 (#1435): which specs are open in the Specs section (specs-section.v1.md
 * section 4). Not a switch, so it stays out of `wizbarSettingDescriptors`, which
 * the settings page renders as switches (settings.v1.md); the same store and
 * write rule apply.
 */
export const specsSettingDescriptors = {
  specsOpen: {
    type: "string", label: "Open specs", default: "[]",
    description: "JSON list of the specs open in the Specs section. Every spec starts collapsed.",
  },
  // C0 (#182): the Specs section's order (specs-section.v1.md section 11).
  specsSort: {
    type: "string", label: "Specs sort", default: "needs-you",
    description: "How the Specs section is ordered: needs-you, recent, closest or newest.",
  },
} satisfies PluginSettingDescriptors;

/** The four sorts (specs-section.v1.md section 11), the default first. */
export const specsSorts = ["needs-you", "recent", "closest", "newest"] as const;
export type SpecsSort = (typeof specsSorts)[number];

/** A stored `specsSort`; anything but one of the four exact names reads as the default. */
export function readSpecsSort(raw: unknown): SpecsSort {
  return (specsSorts as readonly unknown[]).includes(raw) ? raw as SpecsSort : "needs-you";
}

/**
 * S1 (#169): which sidebar sections are collapsed (sidebar-v3.v1.md section 9).
 * Not a switch either, so it stays off the settings page; same store and write rule.
 */
export const sectionsSettingDescriptors = {
  sectionsCollapsed: {
    type: "string", label: "Collapsed sections", default: "[]",
    description: "JSON list of the collapsed sidebar sections (pinned, cloud, specs, yours). Every section starts expanded.",
  },
  // C0 (#182): the sections' order (sidebar-v3.v1.md section 10).
  sectionsOrder: {
    type: "string", label: "Section order", default: "[\"pinned\",\"cloud\",\"specs\",\"yours\"]",
    description: "JSON list of the sidebar sections in the order shown: pinned, cloud, specs and yours.",
  },
} satisfies PluginSettingDescriptors;

export const threadsSettingDescriptors = {
  threadsSort: {
    type: "string", label: "Yours sort", default: "newest",
    description: "How Yours is ordered: newest, activity, status, harness, model or effort.",
  },
  threadsFilter: {
    type: "string", label: "Yours filters", default: "{}",
    description: "JSON object with an optional status and harness ID.",
  },
} satisfies PluginSettingDescriptors;

export const composerFooterModes = ["show", "pinned", "all"] as const;
export type ComposerFooterMode = (typeof composerFooterModes)[number];

export const composerFooterSettingDescriptors = {
  composerFooter: {
    type: "string", label: "Composer footer", default: "show",
    description: "Hide the bar under the thread composer: show, pinned or all.",
  },
} satisfies PluginSettingDescriptors;

export function readComposerFooter(raw: unknown): ComposerFooterMode {
  return (composerFooterModes as readonly unknown[]).includes(raw) ? raw as ComposerFooterMode : "show";
}

export const threadSorts = ["newest", "activity", "status", "harness", "model", "effort"] as const;
export type ThreadSort = (typeof threadSorts)[number];
export const threadStatuses = ["needs-you", "failed", "working", "unread", "idle"] as const;
export type ThreadStatus = (typeof threadStatuses)[number];
export const yoursStatuses = ["working", "needs-you", "unread", "idle"] as const satisfies readonly ThreadStatus[];

export type ThreadsFilter = {
  status?: (typeof yoursStatuses)[number];
  harness?: string;
};

export function readThreadsSort(raw: unknown): ThreadSort {
  return (threadSorts as readonly unknown[]).includes(raw) ? raw as ThreadSort : "newest";
}

export function readThreadsFilter(raw: unknown): ThreadsFilter {
  if (typeof raw !== "string") return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const { status, harness } = value as Record<string, unknown>;
  return {
    ...((yoursStatuses as readonly unknown[]).includes(status) ? { status: status as ThreadsFilter["status"] } : {}),
    ...(typeof harness === "string" && harness.trim() ? { harness: harness.trim() } : {}),
  };
}

export type WizBarSettings = {
  footerCountEnabled: boolean; machineIconsEnabled: boolean;
  childrenChipEnabled: boolean; parentChipEnabled: boolean;
};
export type SettingValues = Record<string, unknown> | undefined;
export type Feature = "footer" | "icons";
export type SourceStatus = "live" | "unavailable" | "unverified";
export type SourceStatuses = Readonly<Record<Feature, SourceStatus>>;

/** Unknown present values fail closed; absent values preserve the declared defaults. */
export function readWizBarSettings(values: SettingValues): WizBarSettings {
  const read = (key: keyof WizBarSettings): boolean => {
    const value = values?.[key];
    return value === undefined ? wizbarSettingDescriptors[key].default : value === true;
  };
  return {
    footerCountEnabled: read("footerCountEnabled"), machineIconsEnabled: read("machineIconsEnabled"),
    childrenChipEnabled: read("childrenChipEnabled"), parentChipEnabled: read("parentChipEnabled"),
  };
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
