// B1 (#76): a parent card's expandable children. Collapsed by default; the
// toggle's summary never claims a complete total (./children). Each row opens
// through the host's own thread navigation, like every WizBar row.
import { useId } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "../components/Icon";
import { cn } from "../lib/utils";
import { threadDisplayTitle } from "../inbox";
import { childSummary, type ChildGroupV4 } from "./children";

const LIME = "#c6f432";
/** Touch-sized rows on coarse pointers and narrow screens (44 px). */
export const touchRowCss = "@media (pointer: coarse), (max-width: 480px) { .wizbar-touch-row { min-height: 44px !important; } }";

export function ChildRows({ parent, group, expanded, onToggle, onNavigate }: {
  parent: PluginSidebarThread;
  group: ChildGroupV4;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const listId = useId();
  const title = threadDisplayTitle(parent);
  return (
    <div className="pl-2.5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-label={`${expanded ? "Hide" : "Show"} children of ${title}`}
        onClick={onToggle}
        className="wizbar-touch-row flex min-h-7 w-full items-center gap-1 rounded px-1 text-left text-2xs text-muted-foreground hover:text-foreground focus-visible:ring-1"
      >
        <Icon name="ChevronDown" aria-hidden="true" className={cn("size-3 shrink-0 transition-transform", !expanded && "-rotate-90")} />
        <span>{childSummary(group)}</span>
      </button>
      {expanded ? (
        <ul id={listId} aria-label={`Children of ${title}`} className="ml-2 flex flex-col border-l border-sidebar-border">
          {group.rows.map(({ thread, running }) => {
            const name = threadDisplayTitle(thread);
            return (
              <li key={thread.id} className="list-none">
                <a
                  href={thread.href}
                  aria-label={running ? `Open ${name}, running` : `Open ${name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
                    onNavigate();
                  }}
                  className="wizbar-touch-row flex min-h-7 items-center gap-2 rounded-md px-2 text-xs hover:bg-sidebar-accent/60 focus-visible:ring-1"
                >
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {running ? <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: LIME, flexShrink: 0 }} /> : null}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
