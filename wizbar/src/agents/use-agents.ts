import { useEffect, useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import type { SpecsFileReadV4 } from "../fixtures/v4";
import { boundHome } from "../specs/read";
import type { specsRpcContract } from "../specs/server";
import { readAgentsFile, type AgentsRead } from "./read";

const refreshMs = 60_000;
const missing: SpecsFileReadV4 = { kind: "missing" };

export function useAgentsRead(now: number): AgentsRead {
  const rpc = useRpc<typeof specsRpcContract>();
  const settings = useSettings();
  const home = settings.isLoading ? null : boundHome(settings.values?.wizdeckFactories);
  const key = home ? JSON.stringify([home.hostId, home.rootPath]) : null;
  const [state, setState] = useState<{ key: string; read: SpecsFileReadV4 } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const load = () => rpc.call("agentsFile", {}).then(
      (read) => { if (live) setState({ key, read }); },
      () => { if (live) setState({ key, read: { kind: "unreadable" } }); },
    );
    void load();
    const timer = setInterval(load, refreshMs);
    return () => { live = false; clearInterval(timer); };
  }, [key, rpc]);
  return readAgentsFile(state?.key === key ? state.read : missing, now);
}
