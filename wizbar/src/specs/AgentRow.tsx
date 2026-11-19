// One running agent inside an open spec (WB4-2, openwizdev/OpenWiz#1436):
// specs-section.v1.md sections 3, 5 and 6. The matrix mark, the title
// (`Role · CODE: what`) and its age; under it a quiet line with the harness
// logo, then model and effort when the `cardModels` source has them. A click
// opens the thread; hovering one with a pull request swaps the age for a
// GitHub mark that opens the pull request.
import { useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  useBbNavigate,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { modelLabel } from "../card-meta";
import { cn } from "../lib/utils";
import { MatrixMark } from "../MatrixMark";
import { ProviderGlyph } from "../ProviderGlyph";
import { relativeTimeLabel } from "../relative-time";
import { TRAILING_GLYPH_BOX_CLASS } from "../StatusSlot";
import { useCardModel } from "../ThreadCard";
import type { SpecAgentV4 } from "../fixtures/v4";

export interface AgentRowProps {
  agent: SpecAgentV4;
  thread: PluginSidebarThread | undefined;
  now: number;
  isActive: boolean;
  onNavigate: () => void;
}

export function AgentRow({ agent, thread, now, isActive, onNavigate }: AgentRowProps) {
  const actions = useSidebarThreadActions();
  const navigate = useBbNavigate();
  const { pullRequest } = useSidebarThreadPullRequest(agent.threadId);
  const served = useCardModel(agent.threadId);
  const model = modelLabel(served?.model ?? null, served?.effort ?? null);
  const [hover, setHover] = useState(false);
  return (
    <li className="relative list-none"
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(false); }}>
      <a href={thread?.href ?? "#"} data-sidebar-thread-id={agent.threadId} aria-label={agent.title}
        className={cn("absolute inset-0 rounded-md", isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}
        onClick={(event) => {
          event.preventDefault();
          actions.open(agent.threadId, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }} />
      <div className="pointer-events-none relative flex items-center gap-1.5 px-2 pt-1">
        <MatrixMark state={agent.matrix} />
        <span className="min-w-0 flex-1 truncate text-foreground">{agent.title}</span>
        <span className={cn(TRAILING_GLYPH_BOX_CLASS, "w-auto min-w-6 justify-end")}>
          {hover && pullRequest ? (
            <button type="button" aria-label={`Open pull request #${pullRequest.number} on GitHub`}
              className="pointer-events-auto text-muted-foreground hover:text-foreground"
              onClick={() => navigate.openUrl(pullRequest.url)}>
              <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
            </button>
          ) : <span className="tabular-nums text-muted-foreground">{relativeTimeLabel(agent.createdAt, now)}</span>}
        </span>
      </div>
      <div data-agent-meta="" className="pointer-events-none relative flex items-center gap-1 px-2 pb-1 pl-6 text-2xs text-muted-foreground/70">
        <span data-provider={agent.providerId} className="contents"><ProviderGlyph providerId={agent.providerId} className="justify-start" /></span>
        {model ? <span className="truncate">{model}</span> : null}
      </div>
    </li>
  );
}
