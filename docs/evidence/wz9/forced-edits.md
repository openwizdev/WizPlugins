# Forced fixture type edits

No application implementation, existing assertion, test case, or imported API changes. `app.tsx`, `useLifecycle.ts` (including `activity.goals`), the store/RPC code, and all other runtime files remain byte-identical to the base.

| Files | Forcing evidence | Smallest edit |
| --- | --- | --- |
| `wizbar/src/ParentChip.test.tsx`, `wizbar/src/ThreadInbox.test.tsx`, `wizbar/src/inbox.test.ts` | TS2322 in the pre-edit compiler run; SDK 0.6.33's `PluginSidebarThread` adds required members | Complete each existing thread factory with `displayTitle`, `lifecycleOwnerThreadId`, `sourceThreadId`, `status`, `runtimeStatus`, `queuedWork`, `pinnedAt`, `pinSortKey`, `archivedAt`, `href`, `isHidden` |
| `wizbar/src/ParentChip.test.tsx`, `wizbar/src/ThreadInbox.test.tsx` | TS2739/TS2322: `PluginSidebarProject` requires `href` and `settingsHref` | Add synthetic project URLs to existing project fixtures; the second project also needs them once inferred fixture types are complete |
| `wizbar/src/ThreadInbox.test.tsx` | TS2739: the environment shape requires `path`, `isWorktree`, `providerId` | Add nullable defaults to the existing environment fixture |

The pre-edit run is `typecheck-red.txt`, committed before the source edits. SDK interface declarations identify all required thread members; TypeScript initially reports the first missing one, `displayTitle`. A subsequent scratch run exposed the second project's inferred URL requirement; adding the same required fields resolves it. New defaults are synthetic and neutral; the existing fixture overrides, test inputs, assertions and test meanings stay intact.

The scratch copy passed typecheck and all 82 tests before applying the same three fixture edits to the branch. No compatibility casts, invented declarations, test removals, expectation changes or new direct dependencies were used. The package already uses package-based SDK imports and TypeScript resolution, so no import or tsconfig change is needed.
