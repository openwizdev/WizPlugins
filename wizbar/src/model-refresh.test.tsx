// @vitest-environment jsdom
// #111 R1: a mounted card, agent row and pinned footer card read model and
// effort again when the host reports a newer turn for the same thread, and a
// late answer for an older turn never wins. Every row is synthetic.
import { createElement, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { v4Now, v4SpecRows, v4Threads } from "./fixtures/v4";
import { ThreadCard } from "./ThreadCard";
import { AgentRow } from "./specs/AgentRow";

type Served = { model: string | null; effort: string | null };
const id = "thr_v4_builder_a";
const first = v4Threads.find((t) => t.id === id)!;
// The host's row after a new turn in the same thread: same id, newer update.
const newer = (thread: PluginSidebarThread, by = 60_000): PluginSidebarThread => ({ ...thread, updatedAt: thread.updatedAt + by });
const agent = v4SpecRows.specs.flatMap((spec) => spec.agents).find((a) => a.threadId === id)!;

/** A host whose answer can change, or be held back and answered later. */
function host(initial: Served) {
  let served = initial;
  const held: (() => void)[] = [];
  let holding = false;
  const cardModels = ({ threadIds }: { threadIds: string[] }) => {
    const body = { source: "host", items: threadIds.map((threadId) => ({ threadId, ...(threadId === id ? served : { model: null, effort: null }) })) };
    if (!holding) return body;
    return new Promise((resolve) => held.push(() => resolve(body)));
  };
  return {
    cardModels,
    set(next: Served) { served = next; },
    hold() { holding = true; },
    release: async (index: number) => { await act(async () => { held[index]!(); }); },
  };
}

const surfaces = {
  card: (thread: PluginSidebarThread) => createElement(ThreadCard, {
    thread, projectName: null, isActive: false, canPark: false, onNavigate() {}, onSettle() {}, onSnooze() {}, now: v4Now,
  }),
  "agent row": (thread: PluginSidebarThread) => createElement(AgentRow, { agent: { ...agent, updatedAt: thread.updatedAt }, thread, now: v4Now, isActive: false, onNavigate() {} }),
};
// The pinned footer card reads a thread's model only for a new id, a new turn or after 5 minutes (#172, owner steer);
// footer-card.test.tsx owns that rule.
type Surface = keyof typeof surfaces;

/** The host's row for the thread, changed in place so the surface stays mounted. */
function rowStore(initial: PluginSidebarThread) {
  let row = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: () => row,
    set: (next: PluginSidebarThread) => act(() => { row = next; for (const listener of listeners) listener(); }),
  };
}

function mount(surface: Surface, models: ReturnType<typeof host>) {
  const draw = surfaces[surface];
  const store = rowStore(first);
  const Mounted = () => draw(useSyncExternalStore(store.subscribe, store.get));
  const rendered = renderSlot({ component: Mounted }, {}, {
    sidebarThreads: { status: "ready", threads: [first] },
    rpc: { listLifecycle: () => ({ rows: [] }), cardModels: models.cardModels } as never,
  });
  return { rendered, rerender: (thread: PluginSidebarThread) => store.set(thread) };
}
const anyModel = /Opus|Sonnet|Haiku|Sol|Terra/;
afterEach(cleanup);

describe("#111 R1: model and effort follow a new turn on a mounted surface", () => {
  // catches: the label read once per thread id, so a new turn's model or effort never shows until a remount.
  it.each(Object.keys(surfaces) as Surface[])("%s: shows the new turn's model and effort", async (surface) => {
    const models = host({ model: "claude-opus-5-5", effort: "high" });
    const view = mount(surface, models);
    await screen.findByText("Opus 5.5 · High");
    expect(view.rendered.rpcCalls.filter((c) => c.method === "cardModels")).toHaveLength(1);
    models.set({ model: "claude-sonnet-5-5", effort: "max" });
    view.rerender(newer(first));
    expect(await screen.findByText("Sonnet 5.5 · Max")).toBeTruthy();
    expect(screen.queryByText("Opus 5.5 · High")).toBeNull();
  });

  // catches: a surface mounted before the host had options staying blank after they arrive.
  it.each(Object.keys(surfaces) as Surface[])("%s: fills in once a later turn has options", async (surface) => {
    const models = host({ model: null, effort: null });
    const view = mount(surface, models);
    await act(async () => {});
    expect(screen.queryByText(anyModel)).toBeNull();
    models.set({ model: "gpt-6.1-sol", effort: "xhigh" });
    view.rerender(newer(first));
    expect(await screen.findByText("Sol 6.1 · XHigh")).toBeTruthy();
  });

  // catches: an older turn's answer arriving last and overwriting the newer one.
  it.each(Object.keys(surfaces) as Surface[])("%s: ignores a late answer for an older turn", async (surface) => {
    const models = host({ model: "claude-opus-5-5", effort: "high" });
    models.hold();
    const view = mount(surface, models);
    models.set({ model: "claude-haiku-5-5", effort: "low" });
    view.rerender(newer(first));
    expect(view.rendered.rpcCalls.filter((c) => c.method === "cardModels")).toHaveLength(2);
    await models.release(1);
    expect(await screen.findByText("Haiku 5.5 · Low")).toBeTruthy();
    await models.release(0);
    expect(screen.queryByText("Opus 5.5 · High")).toBeNull();
    expect(within(document.body).getByText("Haiku 5.5 · Low")).toBeTruthy();
  });
});
