import { useEffect, useId, useState } from "react";
import {
  useRpc,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { ProviderGlyph } from "./ProviderGlyph";
import { MachineIcon } from "./MachineIcon";
import { ChildrenPopover } from "./ChildrenPopover";
import { STATUS_SLOT_CLASS, StatusOrTime } from "./StatusSlot";
import { threadDisplayTitle } from "./inbox";
import { resolveSnoozePresets } from "./lifecycle";
import { cardLinkText, cardMeta, childCountLabel, modelLabel } from "./card-meta";
import type { t3sidebarRpcContract } from "./server";
import type { CardModelV3 } from "./v3-types";

/**
 * One thread as a three-line card: project and status, title, then model,
 * issue/PR link, child count and activity; the branch shows on hover only. The card is the whole point of this sidebar — status lives in the
 * row instead of in its position, which is what lets the list stay still.
 *
 * The row is a positioned container with a full-bleed anchor UNDER the
 * controls, the way bb's own thread row does it: a `<button>` inside an `<a>`
 * is invalid interactive nesting and breaks keyboard behaviour.
 */
export function ThreadCard({
  thread,
  projectName,
  isActive,
  canPark,
  onNavigate,
  onSettle,
  onSnooze,
  now,
}: {
  thread: PluginSidebarThread;
  projectName: string | null;
  isActive: boolean;
  /** False while the thread is working or blocked on the user. */
  canPark: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  /** Quantized clock, so every card in one render agrees on "now". */
  now: number;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  // Opt-in per row: this costs a git-host lookup, and threads sharing a
  // worktree share one.
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  // The same active-lifecycle rows the children chip reads (sidebar-v3 §3).
  const { threads } = useSidebarThreads();
  const served = useCardModel(thread.id);
  const meta = cardMeta(thread, threads, pullRequest, served);
  const model = modelLabel(meta.model, meta.effort);
  const children = childCountLabel(meta.childCount);
  // The branch, or the machine when there is no worktree, on hover only.
  const location = meta.branch ?? thread.host?.name ?? null;
  const locationId = useId();
  // Escape hides the overlay (it can cover the next card) without moving focus;
  // the next focus or hover shows it again. The description stays either way.
  const [locationDismissed, setLocationDismissed] = useState(false);

  return (
    <RowContextMenu thread={thread}>
      <li className="list-none">
        <div
          className={cn(
            "group/card relative rounded-md px-2.5 py-2 transition-colors",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            // A thread open in another pane gets a weaker tint than the active
            // row, so the two states stay distinguishable.
            !isActive && layout !== null && "bg-sidebar-accent/30",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape" && location) setLocationDismissed(true);
          }}
          onFocus={() => setLocationDismissed(false)}
          onMouseEnter={() => setLocationDismissed(false)}
        >
          <a
            // Both attributes, or bb's nine thread shortcuts stop finding rows.
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={threadDisplayTitle(thread)}
            aria-describedby={location ? locationId : undefined}
            {...splitProps}
            onClick={(event) => {
              event.preventDefault();
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
              {projectName ?? " "}
            </span>
            <MachineIcon environment={thread.environment} host={thread.host} runtimeStatus={thread.runtimeStatus} />
            {/* Status at rest, park actions on hover. Only the status yields,
                so the project name never shifts. */}
            {canPark ? (
              <span className="pointer-events-auto hidden items-center gap-0.5 group-hover/card:flex">
                <ParkButton
                  label="Snooze until tomorrow"
                  icon="Clock"
                  onActivate={() =>
                    onSnooze(resolveSnoozePresets(new Date())[2]!.snoozedUntil)
                  }
                />
                <ParkButton
                  label="Settle thread"
                  icon="Check"
                  onActivate={onSettle}
                />
              </span>
            ) : null}
            <span
              className={cn(
                STATUS_SLOT_CLASS,
                canPark && "group-hover/card:hidden",
              )}
            >
              <StatusOrTime thread={thread} now={now} />
            </span>
          </div>
          <div
            className={cn(
              // Weight alone carries unread. Fading the title — or the whole
              // card — makes a thread at rest read as disabled, and at rest is
              // what most of the list is most of the time.
              "pointer-events-none relative mt-0.5 truncate text-sm text-foreground",
              thread.isUnread && "font-medium",
            )}
          >
            {threadDisplayTitle(thread)}
          </div>
          <div
            role="group"
            aria-label="Thread details"
            className="pointer-events-none relative mt-1 flex min-w-0 flex-wrap items-center gap-1 text-2xs text-muted-foreground"
          >
            {model ? <Chip>{model}</Chip> : null}
            {meta.link && pullRequest ? (
              <a
                href={meta.link.pullRequest!.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                title={pullRequest.title}
                className={cn(
                  CHIP_CLASS,
                  "pointer-events-auto hover:underline",
                  pullRequest.state === "merged"
                    ? "text-[color:var(--pr-merged)]"
                    : pullRequest.attention === "checks_failed" ||
                        pullRequest.attention === "conflicts"
                      ? "text-destructive-text"
                      : pullRequest.attention === "ready_to_merge"
                        ? "text-success-foreground"
                        : "text-muted-foreground",
                )}
              >
                {cardLinkText(meta.link)}
              </a>
            ) : meta.link ? (
              // No source gives the issue's URL, so it is plain text.
              <Chip>{cardLinkText(meta.link)}</Chip>
            ) : null}
            {/* WZ19: hover or focus the count to list the children. */}
            {children ? <ChildrenPopover parent={thread} threads={threads} label={children} now={now} onNavigate={onNavigate} /> : null}
            {thread.activity.workflows > 0 ? (
              <ActivityCount
                label="workflows"
                count={thread.activity.workflows}
              />
            ) : null}
            {thread.activity.backgroundAgents > 0 ? (
              <ActivityCount
                label="background agents"
                count={thread.activity.backgroundAgents}
              />
            ) : null}
            <span className="ml-auto" />
            {/* Always drawn, so the line has a fixed right edge. */}
            <ProviderGlyph providerId={thread.providerId} />
          </div>
          {location ? (
            // Overlays rather than adds a line, so hovering never moves the list.
            // Keyboard focus reveals it too, and the card link describes it.
            // Escape dismisses it until the next focus or hover.
            <span
              id={locationId}
              className={cn(
                "pointer-events-none absolute left-2.5 right-2.5 top-full z-10 -mt-1 hidden truncate rounded border border-border bg-popover px-1.5 py-0.5 text-2xs text-popover-foreground shadow-sm",
                !locationDismissed && "group-hover/card:block group-focus-within/card:block",
                meta.branch && "font-mono",
              )}
            >
              {location}
            </span>
          ) : null}
        </div>
      </li>
    </RowContextMenu>
  );
}

/**
 * Model and effort from the `cardModels` RPC. Null until it answers, and on
 * failure: a missing source omits the chip, never shows placeholder text.
 */
function useCardModel(threadId: string): CardModelV3 | null {
  const rpc = useRpc<typeof t3sidebarRpcContract>();
  const [served, setServed] = useState<CardModelV3 | null>(null);
  useEffect(() => {
    let current = true;
    setServed(null);
    rpc.call("cardModels", { threadIds: [threadId] }).then(
      (result) => {
        const item = result.items.find((candidate) => candidate.threadId === threadId);
        if (current) setServed(result.source === "host" && item ? item : null);
      },
      () => undefined,
    );
    return () => { current = false; };
  }, [rpc, threadId]);
  return served;
}

const CHIP_CLASS = "max-w-full rounded border border-border px-1 leading-4 [overflow-wrap:anywhere]";

function Chip({ children }: { children: string }) {
  return <span className={CHIP_CLASS}>{children}</span>;
}

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Clock" | "Check">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}
