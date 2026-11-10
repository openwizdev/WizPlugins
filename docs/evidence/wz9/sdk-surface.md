# Published SDK 0.6.33 surface

Source: [published tarball](https://registry.npmjs.org/@get-bb/plugin-sdk/-/plugin-sdk-0.6.33.tgz), `bundled-types/bb-plugin-sdk.d.ts` and `bundled-types/bb-plugin-sdk-app.d.ts`. Relevant root/app declarations agree. Archive integrity: `sha512-cqEte+M3dSmR1YIJTc/k4r4Uv8ER1gXiNbyImTLqpG8C/2qHMZSxZH1alnWVmRkTaXJB80nxWO9Y4EKaEIEs9w==`.

This is a field-name inventory for #5 and #6, not vendored declarations or a live capability claim. The existing contract remains the behavior baseline; #13's version-selection ruling supersedes its old SDK pin.

## Sidebar thread

`PluginSidebarThread`:

- `id`
- `projectId`
- `title`
- `titleFallback`
- `displayTitle`
- `parentThreadId`
- `lifecycleOwnerThreadId`
- `sourceThreadId`
- `sectionId`
- `originKind`
- `originPluginId`
- `providerId`
- `status`
- `runtimeStatus`
- `queuedWork`
- `hasPendingInteraction`
- `activity`
- `indicator`
- `indicatorLabel`
- `isUnread`
- `isPinned`
- `pinnedAt`
- `pinSortKey`
- `isArchived`
- `archivedAt`
- `href`
- `isHidden`
- `environment`
- `host`
- `createdAt`
- `updatedAt`
- `lastReadAt`
- `latestAttentionAt`

Nested fields:

- `activity`: `workflows`, `backgroundAgents`, `backgroundCommands`, `planMode`, `goals`.
- `environment`: `id`, `name`, `branchName`, `path`, `isWorktree`, `providerId`, `workspaceDisplayKind`.
- `host`: `id`, `name`.

The sidebar has nested `environment.providerId`; it has no top-level `environmentProviderId` or explicit Cloud/Local discriminator. This inventory establishes no live field mapping or global input completeness.

## Retained APIs

- `app.slots.experimental_threadHeaderAction` and `PluginThreadHeaderActionProps`.
- `experimental_useSidebarThreadActions`.
- `experimental_useSidebarThreadPullRequest`.

## Footer registration

| Surface/type | Member names |
| --- | --- |
| `app.experimental_sidebarFooter` | `register` (action and disclosure overloads) |
| `ExperimentalSidebarFooterItemBase` | `id`, `label`, `icon` |
| `ExperimentalSidebarFooterActionRegistration` | `id`, `label`, `icon`, `kind`, `onActivate` |
| `ExperimentalSidebarFooterDisclosureRegistration` | `id`, `label`, `icon`, `kind`, `component` |
| `ExperimentalSidebarFooterActionContext` | `openPluginDetails` |
| `ExperimentalSidebarFooterDisclosureProps` | `dismiss` |
| `ExperimentalSidebarFooterDisclosureController` | `open`, `close`, `toggle` |
| `PluginSidebarFooterActionRegistration` | `id`, `title`, `icon`, `run` |
| `PluginSidebarFooterActionContext` | `openSettings` |
| `app.slots` | `sidebarFooterAction` |

API presence alone does not establish rendering a live number in the footer row. #2's positive-evidence prerequisite, #6's implementation scope, and #9's owner-gated live acceptance remain separate. This upgrade registers no footer and adds no row icon.
