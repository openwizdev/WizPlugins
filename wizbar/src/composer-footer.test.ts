// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { v3Threads } from "./fixtures/v3";

const app = await loadPluginApp(() => import("../app"));

const HIDE_ATTR = "data-wizbar-hide-composer-footer";
const EXPECTED_RULE = "html[data-wizbar-hide-composer-footer] [data-follow-up-composer-footer] { display: none }";

const pinnedThread = v3Threads.find((thread) => thread.isPinned)!;
const unpinnedThread = v3Threads.find((thread) => !thread.isPinned && thread.parentThreadId === null)!;

let fixtureNumber = 0;

function renderInbox(options: {
  activeThreadId: string | null;
  settings?: Record<string, string | number | boolean>;
  threads?: PluginSidebarThread[];
}) {
  const slot = app.threadLists[0]!;
  return renderSlot(slot, {
    activeThreadId: options.activeThreadId,
    activeProjectId: null,
    isCompactViewport: false,
    onNavigate() {},
    searchQuery: "",
  }, {
    pluginId: `synthetic-composer-footer-${++fixtureNumber}`,
    settings: options.settings ?? {},
    sidebarThreads: { status: "ready", threads: options.threads ?? [pinnedThread, unpinnedThread], projects: [] },
    rpc: { listLifecycle: () => ({ rows: [] }), cardModels: () => ({ source: "none", items: [] }) },
  });
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute(HIDE_ATTR);
  for (const style of document.head.querySelectorAll("style")) style.remove();
});

describe("composer footer content script", () => {
  it("registers one content script that injects the stylesheet once and removes it on dispose", async () => {
    const script = app.contentScripts.find(({ id }) => id === "composer-footer");
    expect(script).toBeDefined();

    const controller = new AbortController();
    const disposeFirst = await script!.mount({
      pluginId: "wizbar",
      generation: 1,
      signal: controller.signal,
    });
    expect(typeof disposeFirst).toBe("function");

    const stylesAfterFirst = [...document.head.querySelectorAll("style")].filter(
      (node) => node.textContent?.includes(EXPECTED_RULE),
    );
    expect(stylesAfterFirst).toHaveLength(1);

    // Calling mount a second time before dispose must not duplicate the stylesheet.
    const disposeSecond = await script!.mount({
      pluginId: "wizbar",
      generation: 2,
      signal: controller.signal,
    });
    const stylesAfterSecond = [...document.head.querySelectorAll("style")].filter(
      (node) => node.textContent?.includes(EXPECTED_RULE),
    );
    expect(stylesAfterSecond).toHaveLength(1);

    await (disposeSecond as () => void | Promise<void>)();
    await (disposeFirst as () => void | Promise<void>)();
    const stylesAfterDispose = [...document.head.querySelectorAll("style")].filter(
      (node) => node.textContent?.includes(EXPECTED_RULE),
    );
    expect(stylesAfterDispose).toHaveLength(0);
  });
});

describe("composer footer attribute in ThreadInbox", () => {
  it.each([
    { mode: undefined, active: "pinned", hidden: false },
    { mode: undefined, active: "unpinned", hidden: false },
    { mode: "show", active: "pinned", hidden: false },
    { mode: "show", active: "unpinned", hidden: false },
    { mode: "show", active: "none", hidden: false },
    { mode: "pinned", active: "pinned", hidden: true },
    { mode: "pinned", active: "unpinned", hidden: false },
    { mode: "pinned", active: "none", hidden: false },
    { mode: "all", active: "pinned", hidden: true },
    { mode: "all", active: "unpinned", hidden: true },
    { mode: "all", active: "none", hidden: true },
  ] as const)("mode=$mode active=$active -> hidden=$hidden", async ({ mode, active, hidden }) => {
    const activeThreadId = active === "pinned" ? pinnedThread.id : active === "unpinned" ? unpinnedThread.id : null;
    renderInbox({
      activeThreadId,
      settings: mode === undefined ? {} : { composerFooter: mode },
    });
    await waitFor(() => {
      expect(document.documentElement.hasAttribute(HIDE_ATTR)).toBe(hidden);
    });
  });

  it("clears the attribute on unmount", async () => {
    const rendered = renderInbox({
      activeThreadId: pinnedThread.id,
      settings: { composerFooter: "all" },
    });
    await waitFor(() => {
      expect(document.documentElement.hasAttribute(HIDE_ATTR)).toBe(true);
    });
    rendered.unmount();
    expect(document.documentElement.hasAttribute(HIDE_ATTR)).toBe(false);
  });
});
