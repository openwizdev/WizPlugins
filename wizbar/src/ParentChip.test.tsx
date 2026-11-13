// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

// Load through the harness so the plugin's `@get-bb/plugin-sdk/app` import binds
// to the test runtime.
const app = await loadPluginApp(() => import("../app"));
const parentChip = app.threadHeaderActions.find(
  (slot) => slot.id === "parent",
)!;
const childrenChip = app.threadHeaderActions.find(
  (slot) => slot.id === "children",
)!;

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    displayTitle: "A thread",
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    sourceThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    pinnedAt: null,
    pinSortKey: null,
    isArchived: false,
    archivedAt: null,
    href: "/projects/proj_1/threads/thr_1",
    isHidden: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

function render(
  threads: PluginSidebarThread[],
  threadId: string,
  isCompactViewport = false,
  settings?: Record<string, string | number | boolean>,
  slot = parentChip,
) {
  return renderSlot(
    slot,
    { threadId, projectId: "proj_1", isCompactViewport },
    {
      settings,
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [
          {
            id: "proj_1",
            name: "bb",
            isPersonal: false,
            href: "/projects/proj_1",
            settingsHref: "/projects/proj_1/settings",
          },
        ],
      },
    },
  );
}

afterEach(cleanup);

describe("ParentChip", () => {
  // The whole reason the chip exists: the list hides the child, so this is its
  // only route back.
  it("opens the parent on click", () => {
    const rendered = render(
      [
        thread({ id: "parent", title: "Parent thread" }),
        thread({ id: "child", parentThreadId: "parent" }),
      ],
      "child",
    );
    fireEvent.click(screen.getByRole("button"));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "parent",
      options: undefined,
    });
  });

  it("renders nothing on a root thread", () => {
    render([thread({ id: "root" })], "root");
    expect(screen.queryByRole("button")).toBeNull();
  });

  // An archived parent is out of the list but still the way back.
  it("names an archived parent", () => {
    render(
      [
        thread({ id: "parent", title: "Archived parent", isArchived: true }),
        thread({ id: "child", parentThreadId: "parent" }),
      ],
      "child",
    );
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
      "Back to parent: Archived parent",
    );
  });

  // The header row is short: a phone shows the chevron and the disc only, but
  // the control keeps its name.
  it("drops the title on a compact viewport", () => {
    render(
      [
        thread({ id: "parent", title: "Parent thread" }),
        thread({ id: "child", parentThreadId: "parent" }),
      ],
      "child",
      true,
    );
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("");
    expect(button.getAttribute("aria-label")).toBe(
      "Back to parent: Parent thread",
    );
  });
});

// WZ19 (#43), V2: each header chip renders only while its own setting is on.
// No stored values: the children chip is off and the parent chip on.
describe("header-chip settings", () => {
  const family = [
    thread({ id: "parent", title: "Parent thread" }),
    thread({ id: "child", parentThreadId: "parent", title: "Child thread" }),
  ];
  const parentShown = () => screen.queryByRole("button", { name: "Back to parent: Parent thread" }) !== null;
  const childrenShown = () => screen.queryByRole("button", { name: "1 child threads" }) !== null;

  it.each<{ name: string; settings: Record<string, string | boolean> | undefined; parent: boolean; children: boolean }>([
    { name: "no stored values", settings: undefined, parent: true, children: false },
    { name: "an unrelated stored key", settings: { footerCountEnabled: false }, parent: true, children: false },
    { name: "both on", settings: { childrenChipEnabled: true, parentChipEnabled: true }, parent: true, children: true },
    { name: "both off", settings: { childrenChipEnabled: false, parentChipEnabled: false }, parent: false, children: false },
    { name: "children on only", settings: { childrenChipEnabled: true, parentChipEnabled: false }, parent: false, children: true },
    { name: "non-boolean values fail closed", settings: { childrenChipEnabled: "true", parentChipEnabled: "true" }, parent: false, children: false },
  ])("$name", ({ settings, parent, children }) => {
    render(family, "child", false, settings, parentChip);
    expect(parentShown()).toBe(parent);
    cleanup();
    render(family, "parent", false, settings, childrenChip);
    expect(childrenShown()).toBe(children);
  });
});

// #64: the children chip's label agrees in number, like the card's count.
describe("children chip label", () => {
  it.each([
    { count: 1, label: "1 child" },
    { count: 2, label: "2 children" },
  ])("$count child thread(s) read $label", ({ count, label }) => {
    const kids = Array.from({ length: count }, (_, index) =>
      thread({ id: `child_${index}`, parentThreadId: "parent" }),
    );
    render([thread({ id: "parent" }), ...kids], "parent", false, { childrenChipEnabled: true }, childrenChip);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
