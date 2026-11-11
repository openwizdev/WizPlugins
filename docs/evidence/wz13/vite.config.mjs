import { fileURLToPath } from 'node:url';
const pluginRoot = fileURLToPath(new URL('../../../wizbar/', import.meta.url));
export default {
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  cacheDir: `${pluginRoot}node_modules/.vite/wz13`,
  resolve: { alias: {
    '@get-bb/plugin-sdk/testing/app': `${pluginRoot}node_modules/@get-bb/plugin-sdk/dist/testing/app.js`,
    'react-dom': `${pluginRoot}node_modules/react-dom`,
    'react': `${pluginRoot}node_modules/react`,
  } },
  optimizeDeps: {
    entries: ['docs/evidence/wz13/preview.html'],
    include: ['@get-bb/plugin-sdk/testing/app'],
  },
};
