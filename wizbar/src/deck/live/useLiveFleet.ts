// The panel's live fleet hook (F1, #75). It reads the host's sidebar state
// once (threads and the #160 running inventory), the project's repository
// from the host's project record, and the backend's cached work links. It
// makes no GitHub read, no timeline read and no write.
import { useMemo } from "react";
import { experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import type { CacheView } from "../data/cache";
import { buildFleet, fleetLinkSource, type FleetModelV1 } from "../fleet/model";
import type { FleetLinksV1 } from "../fleet/links";
import { liveHealth } from "./health";
import { inventoryReading } from "./inventory";
import { useProjectRepository } from "./repository";

export function useLiveFleet(projectId: string | null, linkViews: readonly CacheView<FleetLinksV1>[] | undefined, now: number): FleetModelV1 | null {
  const sidebar = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  const repository = useProjectRepository(projectId);
  return useMemo(() => {
    if (!projectId) return null;
    const health = liveHealth({ inventory: inventoryReading(sidebar, connection), projectId, now });
    return buildFleet({ projectId, threads: sidebar.status === "ready" ? sidebar.threads : [], health, links: fleetLinkSource(linkViews), repository });
  }, [projectId, sidebar, connection, linkViews, now, repository]);
}
