import { experimental_useSidebarThreads as useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { useWizBarSettings } from "./SettingsPage";
import { classifyMachine, type MachineInput } from "./machine-source";

/** Suppress row markers until the sidebar source is ready. */
export function MachineIcon(input: MachineInput) {
  const { status } = useSidebarThreads();
  const { machineIconsEnabled } = useWizBarSettings();
  if (!machineIconsEnabled) return null;
  const kind = status === "ready" ? classifyMachine(input) : null;
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
