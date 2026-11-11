# Dependency record

SDK remains exactly `@get-bb/plugin-sdk` 0.6.33. No manifest, lockfile,
engine, declaration or project dependency changes. Existing `npm ci --no-audit
--no-fund` succeeded (474 locked packages); Node24.22.1/npm11.19.1.
Only the existing Vitest/TypeScript/SDK rendered-app tools are used for tests.
The fixture server uses the already locked Vite. Browser-harness and isolated
Chrome for Testing are screenshot tools outside the repository, not plugin
runtime or package dependencies. No live host or plugin build/install is run.
