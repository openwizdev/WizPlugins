// WizDeck's backend readers (D1, #73): one RPC contract, one shared cache.
// The panel renews a lease and re-reads on the `wizdeck` realtime signal; it
// never polls GitHub or the host itself. Nothing here writes to GitHub, the
// host or a thread.
import { createHash } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { loadBoard, type BoardV1 } from "./board";
import { deckSettingDescriptors, readDeckFactories, type DeckFactoryV1 } from "./binding";
import { SharedReadCache, type CacheView } from "./cache";
import { GitHubReader, type Fetch } from "./github";
import { buildHomeView, type HomeViewV1 } from "./home";
import { loadQueue, type QueueReadResultV1 } from "./queue";
import { loadFleetLinks, type FleetLinksV1 } from "../fleet/links";

import { DECK_CHANNEL } from "./protocol";

export { DECK_CHANNEL };

export interface DeckProjectV1 {
  projectKey: string;
  cloudroomProjectId: string;
}

export interface DeckWatchResultV1 {
  projects: DeckProjectV1[];
  /** The factory shown: the requested one, else the current project's, else the first. */
  projectKey: string | null;
  view: HomeViewV1 | null;
  /** Plain words when no factory can be shown. */
  setup: string | null;
  /**
   * F1 (#75): each configured repository's cached fleet work links, from the
   * same shared cache, lease and 60-second schedule as the board. Absent when
   * no factory is shown.
   */
  fleetLinks?: CacheView<FleetLinksV1>[];
}

const watchInput = z.object({
  clientId: z.string().trim().min(1).max(128),
  projectKey: z.string().max(128).nullable(),
  currentProjectId: z.string().max(256).nullable(),
  timeZone: z.string().min(1).max(64),
}).strict();

export const deckRpcContract = defineRpcContract({
  deckWatch: { input: watchInput, output: z.custom<DeckWatchResultV1>((value) => typeof value === "object" && value !== null) },
  deckRefresh: { input: watchInput, output: z.custom<DeckWatchResultV1 & { started: boolean }>((value) => typeof value === "object" && value !== null) },
  deckRelease: { input: z.object({ clientId: z.string().trim().min(1).max(128) }).strict(), output: z.object({ ok: z.boolean() }) },
});

/**
 * Where one scope's plan data comes from. The engine's read-only responses
 * are preferred once a factory configures one; no binding field does yet, so
 * every scope uses the GitHub bridge, and only one source is ever polled.
 */
export function boardSourceFor(_factory: DeckFactoryV1): "github-bridge" {
  return "github-bridge";
}

export function registerDeckReaders(bb: BbPluginApi, options: { fetch?: Fetch; now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const fetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
  const settings = bb.settings.define(deckSettingDescriptors);
  const cache = new SharedReadCache(() => bb.realtime.publish(DECK_CHANNEL, {}), now);
  bb.onDispose(() => cache.dispose());

  const readers = new Map<string, GitHubReader>();
  const reader = (token: string | null) => {
    // Key by the credential, never sent anywhere: one account, one budget, one cache.
    const account = token ? `token:${createHash("sha256").update(token).digest("hex").slice(0, 16)}` : "anonymous";
    let found = readers.get(account);
    if (!found) {
      found = new GitHubReader(fetch, token, now);
      readers.set(account, found);
    }
    return { account, reader: found };
  };
  const acceptedRevision = new Map<string, number>();
  const leasesByClient = new Map<string, Set<string>>();

  const watch = async (input: z.infer<typeof watchInput>, refresh: boolean) => {
    const values = await settings.get();
    const read = readDeckFactories(values.wizdeckFactories);
    if (!read.ok) return { projects: [], projectKey: null, view: null, setup: read.detail, started: false };
    const factories = read.factories;
    const factory = factories.find((candidate) => candidate.binding.projectKey === input.projectKey)
      ?? factories.find((candidate) => candidate.binding.cloudroomProjectId === input.currentProjectId)
      ?? factories[0];
    const projects = factories.map(({ binding }) => ({ projectKey: binding.projectKey, cloudroomProjectId: binding.cloudroomProjectId }));
    const { binding } = factory;
    const token = typeof values.wizdeckGithubToken === "string" && values.wizdeckGithubToken.trim() ? values.wizdeckGithubToken.trim() : null;
    const github = reader(token);
    boardSourceFor(factory);

    const keys: string[] = [];
    let started = false;
    const lease = <T>(key: string, loader: Parameters<SharedReadCache["watch"]>[2], keepLastGood = true): CacheView<T> => {
      keys.push(key);
      const before = cache.peek(key)?.refreshing ?? false;
      const view = cache.watch(key, input.clientId, loader, { keepLastGood }) as CacheView<T>;
      if (!before && view.refreshing) started = true;
      return view;
    };

    const queueKey = `host|${binding.home.hostId}|${binding.home.rootPath}|${binding.projectKey}|needs-you`;
    const queueView = lease<QueueReadResultV1>(queueKey, async (signal) => {
      const result = await loadQueue(bb.sdk.files.read, binding, { now, previousRevision: acceptedRevision.get(queueKey) }, signal);
      acceptedRevision.set(queueKey, result.data.queue.revision);
      return result;
    }, false);

    const scope = createHash("sha256").update(JSON.stringify([binding.repositories, factory.statusWriterLogin])).digest("hex").slice(0, 12);
    const boardViews = binding.repositories.map((repository) => lease<BoardV1>(`github|${github.account}|${repository}|board|${scope}`,
      (signal) => loadBoard({ reader: github.reader, repository, repositories: binding.repositories, statusWriterLogin: factory.statusWriterLogin, now }, signal)));

    // F1 (#75): one work-link read per repository, inside the same cache, budget and back-off.
    const linkViews = binding.repositories.map((repository) => lease<FleetLinksV1>(`github|${github.account}|${repository}|fleet-links`,
      (signal) => loadFleetLinks({ reader: github.reader, repository }, signal)));

    if (refresh) for (const key of keys) started = cache.refresh(key).started || started;

    const previous = leasesByClient.get(input.clientId);
    if (previous) for (const key of previous) if (!keys.includes(key)) cache.release(key, input.clientId);
    leasesByClient.set(input.clientId, new Set(keys));

    const view = buildHomeView({
      projectKey: binding.projectKey,
      queue: cache.peek<QueueReadResultV1>(queueKey) ?? queueView,
      boards: boardViews.map((board, index) => cache.peek<BoardV1>(keys[index + 1]) ?? board),
      timeZone: input.timeZone, now: now(), authenticated: github.reader.authenticated,
    });
    const fleetLinks = linkViews.map((links, index) => cache.peek<FleetLinksV1>(keys[1 + boardViews.length + index]) ?? links);
    return { projects, projectKey: binding.projectKey, view, setup: null, fleetLinks, started };
  };

  bb.rpc.register(deckRpcContract, {
    async deckWatch(input) {
      const { started: _started, ...result } = await watch(input, false);
      return result;
    },
    async deckRefresh(input) { return watch(input, true); },
    async deckRelease({ clientId }) {
      for (const key of leasesByClient.get(clientId) ?? []) cache.release(key, clientId);
      leasesByClient.delete(clientId);
      return { ok: true };
    },
  });
  return { settings };
}
