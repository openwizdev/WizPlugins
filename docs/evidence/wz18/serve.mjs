import { createServer } from "../../../wizbar/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const pluginRoot = join(root, "wizbar");
const cacheDir = await mkdtemp(join(tmpdir(), "wz18-vite-"));
const server = await createServer({
  root, cacheDir, configFile: false,
  esbuild: { jsx: "automatic" },
  define: { "process.env.NODE_ENV": '"development"' },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
  resolve: { alias: {
    "@get-bb/plugin-sdk/testing/app": `${pluginRoot}/node_modules/@get-bb/plugin-sdk/dist/testing/app.js`,
    "react-dom": `${pluginRoot}/node_modules/react-dom`,
    "react": `${pluginRoot}/node_modules/react`,
  } },
  optimizeDeps: { entries: ["docs/evidence/wz18/render.html"], include: ["@get-bb/plugin-sdk/testing/app"] },
});
await server.listen();
console.log("Synthetic list fixture ready on port 4178");
const stop = async () => { await server.close(); await rm(cacheDir, { recursive: true, force: true }); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
