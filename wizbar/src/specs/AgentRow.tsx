import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { SpecAgentV4 } from "../fixtures/v4";

export interface AgentRowProps {
  agent: SpecAgentV4;
  thread: PluginSidebarThread | undefined;
  now: number;
  isActive: boolean;
  onNavigate: () => void;
}
export function AgentRow({ agent }: AgentRowProps) {
  return <li>{agent.title}</li>;
}
