import { useEffect, useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { SpecsFileReadV4 } from "../fixtures/v4";
import { boundHome } from "../specs/read";
import type { specsRpcContract } from "../specs/server";
import { mappedThreadIds } from "./archive";
import { readAgentsFile, type AgentsRead } from "./read";

const refreshMs = 60_000;
const missing: SpecsFileReadV4 = { kind: "missing" };

export function useAgentsRead(now: number): AgentsRead {
  const rpc = useRpc<typeof specsRpcContract>();
  const settings = useSettings();
  const home = settings.isLoading ? null : boundHome(settings.values?.wizdeckFactories);
  const key = home ? JSON.stringify([home.hostId, home.rootPath]) : null;
  const [state, setState] = useState<{ key: string; read: SpecsFileReadV4; archivedIds: readonly string[] } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const load = async () => {
      const read = await rpc.call("agentsFile", {}).catch(() => ({ kind: "unreadable" } as const));
      if (!live) return;
      const candidate = readAgentsFile(read, Date.now());
      const archivedIds = mappedThreadIds(candidate).length
        ? await rpc.call("agentsArchive", {}).catch(() => [])
        : [];
      if (live) setState({ key, read, archivedIds });
    };
    void load();
    const timer = setInterval(load, refreshMs);
    return () => { live = false; clearInterval(timer); };
  }, [key, rpc]);
  const current = state?.key === key ? state : null;
  const read = readAgentsFile(current?.read ?? missing, now);
  return read.status === "ready" && current?.archivedIds.length ? { ...read, archivedIds: current.archivedIds } : read;
}
