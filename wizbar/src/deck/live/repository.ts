// The repository a project's threads work in (F1, #75 review R1), from the
// host's own project record: `useSdk().projects.get({ projectId })`'s
// `gitRemoteUrl` (SDK 0.6.33). One read per shown project, never per row.
// A remote that is missing, unreadable or not a plain GitHub repository URL
// gives no provenance: nothing is placed by branch name alone.
import { useEffect, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import type { RepositoryProvenanceV1 } from "../fleet/model";

const NAME = "([A-Za-z0-9_.-]+)";
const remotes = [
  new RegExp(`^https://github\\.com/${NAME}/${NAME}?/?$`),
  new RegExp(`^git@github\\.com:${NAME}/${NAME}$`),
  new RegExp(`^ssh://git@github\\.com/${NAME}/${NAME}$`),
];

/** `owner/name` from a GitHub remote URL; anything else is unrecognised. */
export function repositoryFromRemote(remote: string | null | undefined): RepositoryProvenanceV1 {
  if (remote === null || remote === undefined || remote.trim() === "") return { status: "unverified", reason: "no-remote" };
  for (const pattern of remotes) {
    const match = pattern.exec(remote.trim());
    if (!match || !match[2]) continue;
    const name = match[2].replace(/\.git$/, "");
    if (!name || name === "." || name === ".." || match[1] === "." || match[1] === "..") break;
    return { status: "verified", repository: `${match[1]}/${name}` };
  }
  return { status: "unverified", reason: "unrecognised-remote" };
}

export function useProjectRepository(projectId: string | null): RepositoryProvenanceV1 {
  const sdk = useSdk();
  const [state, setState] = useState<{ projectId: string | null; value: RepositoryProvenanceV1 }>({ projectId: null, value: { status: "unverified", reason: "loading" } });
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    setState({ projectId, value: { status: "unverified", reason: "loading" } });
    Promise.resolve()
      .then(() => sdk.projects.get({ projectId }))
      .then((project) => { if (live) setState({ projectId, value: repositoryFromRemote(project?.gitRemoteUrl) }); })
      .catch(() => { if (live) setState({ projectId, value: { status: "unverified", reason: "unreadable" } }); });
    return () => { live = false; };
  }, [sdk, projectId]);
  return state.projectId === projectId ? state.value : { status: "unverified", reason: "loading" };
}
