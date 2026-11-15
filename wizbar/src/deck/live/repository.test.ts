// F1 (#75 review R1): the project's repository comes only from a plain GitHub
// remote on the host's project record; anything else gives no provenance.
import { describe, expect, it } from "vitest";
import { repositoryFromRemote } from "./repository";

describe("project repository provenance", () => {
  // Bug caught: an unrecognised or look-alike remote accepted as a verified repository.
  it("accepts only plain GitHub remotes and refuses everything else", () => {
    const verified = (repository: string) => ({ status: "verified", repository });
    expect(repositoryFromRemote("https://github.com/example-org/sample-app.git")).toEqual(verified("example-org/sample-app"));
    expect(repositoryFromRemote("https://github.com/example-org/sample-app")).toEqual(verified("example-org/sample-app"));
    expect(repositoryFromRemote("git@github.com:example-org/sample-app.git")).toEqual(verified("example-org/sample-app"));
    expect(repositoryFromRemote("ssh://git@github.com/example-org/sample-app.git")).toEqual(verified("example-org/sample-app"));
    for (const missing of [null, undefined, "", "  "]) expect(repositoryFromRemote(missing)).toEqual({ status: "unverified", reason: "no-remote" });
    for (const bad of [
      "https://github.com.evil.example/example-org/sample-app", "https://gitlab.com/example-org/sample-app",
      "http://github.com/example-org/sample-app", "https://github.com/example-org", "https://github.com/example-org/sample-app/tree/main",
      "https://github.com/../sample-app", "file:///synthetic/repo", "example-org/sample-app",
    ]) expect(repositoryFromRemote(bad)).toEqual({ status: "unverified", reason: "unrecognised-remote" });
  });
});
