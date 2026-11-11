import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type MachineInput = Partial<Pick<PluginSidebarThread, "environment" | "host" | "runtimeStatus">>;
export type MachineKind = "Cloud" | "Local";

/** Observed projection rule approved on #29, not an SDK machine guarantee.
 * Local startup may be temporarily unmarked. Never infer Cloud from null alone.
 */
export function classifyMachine({ environment, host, runtimeStatus }: MachineInput): MachineKind | null {
  if (environment && typeof environment === "object" && !Array.isArray(environment)) {
    // Providers do not distinguish Cloud from Local; require a valid SDK value,
    // including null/empty, without guessing from the provider's name.
    return environment.providerId === null || typeof environment.providerId === "string" ? "Local" : null;
  }
  if (environment !== null || host !== null) return null;
  // Explicit allowlist: starting, provisioning, waiting-for-host, missing and
  // future runtime values must never turn a starting Local row into Cloud.
  switch (runtimeStatus) {
    case "active":
    case "idle":
    case "pending":
    case "stopping":
    case "error":
      return "Cloud";
    default:
      return null;
  }
}
