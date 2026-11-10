# SDK selection from published declarations

The 2026-11-10 WD6 ruling on #13 selects the newest published version preserving every required API. All 63 published versions from 0.4.50 through registry latest 0.6.136 were inspected; 34 meet the complete set. The newest is **0.6.33**. The next published version, 0.6.37, removes the sidebar action hook, and none of the later published versions restore it. No prerelease exists in this registry snapshot.

Each linked tarball was verified against its registry integrity value. TypeScript parsed the bundled declarations: interface member declarations establish the field/slot checks, and named exports establish the hook/props checks. Comments mentioning a removed name do not count. Root and app thread/activity declarations agree. Installed 0.6.33 declaration hashes match the inspected archive.

Columns: goals = `PluginSidebarThreadActivity.goals`; provider = `PluginSidebarThread.environment.providerId`; header = `PluginAppSlots.experimental_threadHeaderAction`; props = exported `PluginThreadHeaderActionProps`; actions = exported `experimental_useSidebarThreadActions`; PR = exported `experimental_useSidebarThreadPullRequest`; footer = `app.experimental_sidebarFooter.register` with both action/disclosure overloads.

| Published SDK | Goals | Provider | Header | Props | Actions | PR | Footer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [0.4.50](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.50.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.53](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.53.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.55](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.55.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.56](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.56.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.84](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.84.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.87](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.87.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.88](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.88.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.94](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.94.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.97](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.97.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.99](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.99.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.101](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.101.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.104](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.104.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.106](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.106.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.4.108](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.4.108.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.8](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.8.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.9](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.9.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.15](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.15.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.16](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.16.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.23](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.23.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.24](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.24.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.27](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.27.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.29](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.29.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.30](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.30.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.5.31](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.5.31.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.5](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.5.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.9](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.9.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.14](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.14.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.15](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.15.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.16](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.16.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.19](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.19.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.23](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.23.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.26](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.26.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.31](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.31.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.33](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.33.tgz) | yes | yes | yes | yes | yes | yes | yes |
| [0.6.37](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.37.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.39](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.39.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.42](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.42.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.43](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.43.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.49](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.49.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.52](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.52.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.54](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.54.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.59](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.59.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.60](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.60.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.65](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.65.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.68](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.68.tgz) | yes | yes | yes | yes | no | yes | yes |
| [0.6.73](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.73.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.75](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.75.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.79](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.79.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.80](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.80.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.89](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.89.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.90](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.90.tgz) | yes | yes | yes | yes | no | no | yes |
| [0.6.94](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.94.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.99](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.99.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.104](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.104.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.105](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.105.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.109](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.109.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.112](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.112.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.116](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.116.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.121](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.121.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.125](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.125.tgz) | yes | yes | no | no | no | no | yes |
| [0.6.132](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.132.tgz) | no | yes | no | no | no | no | yes |
| [0.6.133](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.133.tgz) | no | yes | no | no | no | no | yes |
| [0.6.136](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.136.tgz) | no | yes | no | no | no | no | yes |

The existing tsconfig already resolves `@get-bb/plugin-sdk` from the package, without vendored-type paths. Existing imports already use the package name. No migration CLI invocation, vendored declarations, tsconfig edit, import rename, new direct dependency, or runtime API substitution is required.
