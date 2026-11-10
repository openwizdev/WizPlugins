// Offline synthetic component fixture only. Uses the existing locked toolchain.
import { createServer } from "../../../wizbar/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const cacheDir = await mkdtemp(join(tmpdir(), "wizbar-fixture-"));
const server = await createServer({
  root, cacheDir, configFile: false,
  server: { host: "127.0.0.1", port: 4176, strictPort: true },
  resolve: { alias: [
    { find: /^react$/, replacement: join(root, "wizbar/node_modules/react/index.js") },
    { find: /^react\/jsx-runtime$/, replacement: join(root, "wizbar/node_modules/react/jsx-runtime.js") },
    { find: /^react\/jsx-dev-runtime$/, replacement: join(root, "wizbar/node_modules/react/jsx-dev-runtime.js") },
    { find: /^react-dom\/client$/, replacement: join(root, "wizbar/node_modules/react-dom/client.js") },
  ] },
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"] },
});
await server.listen();
console.log("Synthetic fixture ready on port 4176");
const stop = async () => { await server.close(); await rm(cacheDir, { recursive: true, force: true }); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
