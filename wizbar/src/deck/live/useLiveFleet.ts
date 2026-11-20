// The panel's live fleet hook (F1, #75). It reads the host's sidebar state
// once (threads and the #160 running inventory) and the backend's cached
// work links. It makes no GitHub read, no timeline read and no write.
import { useMemo } from "react";
import { experimental_useSidebarThreads, useRealtimeConnectionState } from "@get-bb/plugin-sdk/app";
import type { CacheView } from "../data/cache";
import { buildFleet, fleetLinkSource, noCheckoutProvenance, type CheckoutProvenanceV1, type FleetModelV1 } from "../fleet/model";
import type { FleetLinksV1 } from "../fleet/links";
import { liveHealth } from "./health";
import { inventoryReading } from "./inventory";

/**
 * `provenance` is the per-checkout repository seam (review R1). Production
 * passes none: SDK 0.6.33 has no supported per-checkout source, so nothing is
 * placed by branch. Tests of the tree's rendering pass a fixture lookup.
 */
export function useLiveFleet(
  projectId: string | null, linkViews: readonly CacheView<FleetLinksV1>[] | undefined, now: number,
  provenance: CheckoutProvenanceV1 = noCheckoutProvenance,
): FleetModelV1 | null {
  const sidebar = experimental_useSidebarThreads();
  const connection = useRealtimeConnectionState();
  return useMemo(() => {
    if (!projectId) return null;
    const health = liveHealth({ inventory: inventoryReading(sidebar, connection), projectId, now });
    return buildFleet({ projectId, threads: sidebar.status === "ready" ? sidebar.threads : [], health, links: fleetLinkSource(linkViews), provenance });
  }, [projectId, sidebar, connection, linkViews, now, provenance]);
}
