WZ15 README-only scope verification
SDK manifest/lock/installed readback: 0.6.33
Node 24.22.1; npm 11.19.1

$ npm ci
npm warn deprecated prebuild-install@7.1.3: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead

added 474 packages, and audited 475 packages in 22s

53 packages are looking for funding
  run `npm fund` for details

15 vulnerabilities (2 low, 7 moderate, 6 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
npm warn install-scripts 7 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   @google/genai@1.52.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   @parcel/watcher@2.5.6 (install: node scripts/build-from-source.js)
npm warn install-scripts   better-sqlite3@12.10.0 (install: prebuild-install || node-gyp rebuild --release)
npm warn install-scripts   node-pty@1.1.0 (install: node scripts/prebuild.js || node-gyp rebuild; postinstall: node scripts/post-install.js)
npm warn install-scripts   protobufjs@7.6.5 (postinstall: node scripts/postinstall)
npm warn install-scripts   @google/genai@1.52.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   protobufjs@7.6.5 (postinstall: node scripts/postinstall)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
npm notice
npm notice New major version of npm available! 11.19.1 -> 12.2.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.2.2
npm notice To update run: npm install -g npm@12.2.2
npm notice

Exit status: 0

$ npm run typecheck

> bb-plugin-wizbar@0.1.0 typecheck
> tsc --noEmit


Exit status: 0

$ npm test -- --maxWorkers=2

> bb-plugin-wizbar@0.1.0 test
> vitest run --config vitest.config.ts --maxWorkers=2


 RUN  v4.1.10 <plugin-folder>


 Test Files  10 passed (10)
      Tests  253 passed (253)
   Start at  00:16:13
   Duration  7.54s (transform 234ms, setup 0ms, import 1.82s, tests 9.09s, environment 2.51s)


Exit status: 0

PASS manifest, lockfile, shared contract and both licence files match main.
PASS README relative links resolve to existing files.
