import { describe, expect, it, vi } from "vitest";
import { strictRead } from "./strict-files";

describe("strictRead: the real host's absolute-path rule (#153)", () => {
  const inner = vi.fn(async ({ path }: { path: string }) => ({ path }));
  const read = strictRead(inner);

  // catches: a helper that lets a relative path through, so the fake host again hides the real-host 400.
  it.each([".openwiz/specs.v1.json", "./x.json", "home/x.json", ""])("rejects relative %j with status 400", async (path) => {
    inner.mockClear();
    await expect(read({ path })).rejects.toMatchObject({ status: 400, message: "Path must be absolute" });
    expect(inner).not.toHaveBeenCalled();
  });

  // catches: a helper so strict it refuses the real host's accepted forms.
  it.each(["/synthetic/home/.openwiz/specs.v1.json", "C:\\synthetic\\home\\x.json", "D:/synthetic/x.json"])("passes absolute %j through", async (path) => {
    await expect(read({ path })).resolves.toEqual({ path });
  });
});
