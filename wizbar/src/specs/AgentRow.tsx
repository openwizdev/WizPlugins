// One running agent inside an open spec (WB4-2, openwizdev/OpenWiz#1436):
// specs-section.v1.md sections 3, 5 and 6. The matrix mark, the title
// (`Role · CODE: what`) and its age; under it a quiet line with the harness
// logo, then model and effort when the `cardModels` source has them. A click
// opens the thread, from the title or the age; hovering one with a pull request,
// or keyboard focus inside it, swaps the age for a GitHub mark that opens the
// pull request. The harness is the host provider directory's logo or glyph and
// display name (WB4-9, openwizdev/OpenWiz#1584).
import { useState } from "react";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
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
  const served = useCardModel(agent.threadId, thread?.updatedAt ?? agent.updatedAt);
  const model = modelLabel(served?.model ?? null, served?.effort ?? null);
  const provider = useProviders().providers.find((p) => p.id === agent.providerId);
  // Hover and focus-within are separate, so a pointer leaving never hides the
  // action while keyboard focus is still in the row (#1552).
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const github = (hover || focusWithin) && pullRequest ? pullRequest : null;
  return (
    <li className={cn("relative list-none rounded-md", isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false); }}>
      <div className="flex items-center gap-1.5 px-2 pt-1">
        <MatrixMark state={agent.matrix} />
        {/* A stretched link: its ::before covers the whole row, both lines. */}
        <a href={thread?.href ?? "#"} data-sidebar-thread-id={agent.threadId}
          className="min-w-0 flex-1 truncate text-foreground before:absolute before:inset-0 before:rounded-md"
          onClick={(event) => {
            event.preventDefault();
            actions.open(agent.threadId, { split: event.metaKey || event.ctrlKey });
            onNavigate();
          }}>{agent.title}</a>
        {/* The trailing slot always passes pointer events through to the link,
            so the age and the space around the GitHub button open the thread;
            only the button itself is its own target above the link (#1551). */}
        <span className={cn(TRAILING_GLYPH_BOX_CLASS, "pointer-events-none w-auto min-w-6 justify-end")}>
          {github ? (
            <button type="button" aria-label={`Open pull request #${github.number} on GitHub`}
              className="pointer-events-auto relative text-muted-foreground hover:text-foreground"
              onClick={() => navigate.openUrl(github.url)}>
              <HugeiconsIcon icon={GithubIcon} className="size-3.5" />
            </button>
          ) : <span className="tabular-nums text-muted-foreground">{relativeTimeLabel(agent.createdAt, now)}</span>}
        </span>
      </div>
      <div data-agent-meta="" className="pointer-events-none relative flex items-center gap-1 px-2 pb-1 pl-6 text-2xs text-muted-foreground/70">
        <span data-provider={agent.providerId} className="contents">
          {provider ? (
            <>
              <span className={cn(TRAILING_GLYPH_BOX_CLASS, "justify-start")}>
                <ProviderIcon providerKind="agent" provider={provider} aria-hidden className="size-3" />
              </span>
              <span className="shrink-0">{provider.displayName}</span>
            </>
          ) : <ProviderGlyph providerId={agent.providerId} className="justify-start" />}
        </span>
        {model ? <span className="truncate">{model}</span> : null}
      </div>
    </li>
  );
}
