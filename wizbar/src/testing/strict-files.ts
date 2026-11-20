// The real host's file-read rule, for tests (#153). The SDK's fake host lets a
// plugin read a relative `path`; the real host refuses it with HTTP 400 "Path
// must be absolute". Wrap a test's `files.read` in `strictRead` so the readers
// meet the same rule they meet on a real host.

/** True for a POSIX (`/…`) or Windows (`C:\…`, `C:/…`) absolute path. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/** The real host's refusal: status 400, "Path must be absolute". */
export class HostPathError extends Error {
  readonly status = 400;
  constructor() {
    super("Path must be absolute");
    this.name = "HostPathError";
  }
}

/** `read`, refusing a relative `path` before it runs, as the real host does. */
export function strictRead<A extends { path: string }, R>(read: (args: A) => Promise<R>): (args: A) => Promise<R> {
  return async (args) => {
    if (typeof args?.path !== "string" || !isAbsolutePath(args.path)) throw new HostPathError();
    return read(args);
  };
}
