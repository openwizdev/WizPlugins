// Run from the repository root: node docs/evidence/wz14/serve.mjs
// Uses the locked development dependency; serves synthetic fixtures only.
import { createServer } from "../../../wizbar/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const server = await createServer({
  configFile: false, root, cacheDir: join(tmpdir(), "wizbar-wz14-vite"),
  esbuild: { jsx: "automatic" },
  define: { "process.env.NODE_ENV": '"development"' },
  resolve: { alias: { react: join(root, "wizbar/node_modules/react"),
    "react-dom": join(root, "wizbar/node_modules/react-dom") } },
  optimizeDeps: { entries: ["docs/evidence/wz14/preview.html"] },
  server: { host: "127.0.0.1", port: 4174, strictPort: true },
});
await server.listen();
server.printUrls();
