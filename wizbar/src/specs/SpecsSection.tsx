// The Specs section (WB4-1, openwizdev/OpenWiz#1435): specs-section.v1.md sections 2 to 4 and 9.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface SpecsSectionProps {
  threads: readonly PluginSidebarThread[];
  now: number;
  activeThreadId: string | null;
  onNavigate: () => void;
}

export function SpecsSection(_props: SpecsSectionProps) {
  return null;
}
