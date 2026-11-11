import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { useWizBarSettings } from "./SettingsPage";

/** WD5's observed mapping, not a general SDK guarantee. Unknown stays unmarked. */
export function MachineIcon({
  environment,
}: {
  environment: PluginSidebarThread["environment"] | undefined;
}) {
  const { machineIconsEnabled } = useWizBarSettings();
  if (!machineIconsEnabled) return null;
  if (
    !environment ||
    typeof environment !== "object" ||
    Array.isArray(environment)
  ) {
    return null;
  }
  const providerId = environment.providerId;
  const kind =
    providerId === null || providerId === ""
      ? "Cloud"
      : typeof providerId === "string"
        ? "Local"
        : null;
  if (kind === null) return null;

  return (
    <span
      role="img"
      aria-label={kind}
      title={kind}
      className="pointer-events-none relative flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
    >
      <Icon
        name={kind === "Cloud" ? "Cloud" : "Laptop"}
        className="size-3.5"
        aria-hidden="true"
      />
    </span>
  );
}
