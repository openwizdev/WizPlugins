# WizBar v0.3 live check (WZ8, #9)

**Date:** 2026-11-13. **Who:** the owner's PC keeper ("pc hands"), on the owner's PC, under the existing keeper delegation. The owner judges acceptance.
**Evidence class:** real keeper observation on the PC. Items without a live result are marked **Gap** and stay Unverified; fixture and CI results are not counted here. Real ids, machine details and raw logs are in a private record, not here.

## Installed build

| Item | Value |
| --- | --- |
| Source commit | `404ffdcf662ee843ee35bb713d3b0c2912a7104c` (merge of #57, `main`) |
| Package | `bb-plugin-wizbar` **0.3.0** (`room-cli plugin list`: WizBar 0.3.0, running) |
| SDK | built against **0.6.51** (`dist/*.meta.json`: `sdkVersion` 0.6.51, `builtWith.pluginSdkVersion` 0.6.51, host bb 152); `package.json` pins `@get-bb/plugin-sdk` **0.6.33** for types |
| Install | `npm ci --ignore-scripts`, `room-cli plugin build .`, `room-cli plugin install . --yes` from a separate checkout of the commit. The previous local-path install stays on disk for a one-step rollback (`room-cli plugin install <previous path>`). T3 Sidebar stays installed and disabled; WizBar stays the sidebar provider |

Test threads: four throwaway Local threads in a scratch project (a parent, its child, and two idle threads), archived afterwards. Only these threads were pinned, moved or muted for this check; every change was undone before archiving.

## Results

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Blockers merged; commit, package and SDK recorded | **Pass** | Table above; #39 to #44 merged (installed commit is #57's merge) |
| 2 | Cards: model/effort, issue/PR link, child count, branch on hover, normal and narrow | **Gap** | Not seen: the keeper had no screen capture (the host's whole-screen approval was not granted during the run). Data-side only: the host's thread records expose no model or effort (`children --json` gives `model: null`, `effort: null`), so the contract expects them omitted. Link, child count, hover and widths are unverified. |
| 3 | Children: hover panel, open child, open parent; chip defaults; each setting toggles its chip and persists after reload | **Partial** | CLI: `children <parent> --json` returned the one real child (status `working`). Settings: defaults read back as children chip **off** and parent chip **on**. Turning each one over (`room-cli plugin config wizbar set …`), reloading the plugin and reading back kept both new values; both were then restored. **Gap:** the hover panel, opening the child and the parent, and the chips in the UI were not seen. |
| 4 | Count and stats match real running work incl. a child and a muted fleet thread; disclosures; live updates; dim zero | **Partial** | `stats --json` equalled the host exactly: running **10** = 4 top-level + **6 children**, 7 Cloud + 3 Local, matching an independent count of working threads from `room-cli thread list` (including background work). That included the test child and the test parent while **muted**. An earlier read (14 against 12 by status alone) differed only by the two test threads' background work, which WizBar correctly counts. Disclosures are present in the JSON (`subagents: not-counted`, `unseen: possible`, `finishedToday.source: none`). Consecutive reads changed with real work (14, then 10). **Gap:** the list-bottom line, the bolt's panel, its live updates and dim zero were not seen. |
| 5 | Drag: pin, unpin, reorder; host pinned state agrees; Inbox order unchanged | **Gap** | Dragging needs the screen. CLI equivalents passed (row 6): pin, move and unpin changed the host's own pinned state and order. |
| 6 | CLI `pin`, `unpin`, `move`, `mute`, `children`, `stats` and existing commands with `--json`; stats JSON equals the panel | **Pass** (stats-equals-panel: Gap) | On throwaway threads, all with `--json`: `pin` (2 threads; the host showed both pinned), `move --before` (host pinned order B, A, matching `pinnedOrder`), `unpin` (the host showed not pinned), `mute`/`unmute` (shelf `muted`, then `active`; `list` read back `muted`), `children`, `stats`, `list`. Earlier keeper runs covered `settle`, `unsettle`, `snooze`; they were not repeated. Stats JSON equals the host's own count (row 4). Comparing it with the panel needs the screen. |
| 7 | Carried: settings-page persistence, Cloud/Local icons on known rows, footer item's real rendering | **Partial** | Settings persistence through a plugin reload: **pass** via the settings API (row 3), not the settings page UI. Cloud/Local icons and the footer item's real rendering: **Gap** (no screen capture). The `cloud`/`local` split in stats is present and matched the host. |
| 8 | Privacy: ids, machine details, raw logs private; ≥ 2 sanitised screenshots ≥ 1200 px | **Partial** | No ids, machine details or raw logs here; the private record is linked from the owner's private keeper issue. **Gap:** no screenshots, so the two 1200 px marketplace screenshots are still owed. |
| 9 | No publication, release or wider live authority | **Pass** | Nothing published or released; the PR adds this record only |

## Known unknowns carried

- A rarely shown PR badge alone is not a WizBar regression (owner note on #9).

## What is still owed

One short sitting with screen capture approved: the cards at normal and narrow widths, the children hover panel and click-to-open, the header chips, the list-bottom line and the bolt's stats panel (compared with `stats --json`), drag to pin, unpin and reorder, the settings page, the Cloud/Local icons, and the footer. Plus two sanitised screenshots at 1200 px or wider. The keeper can run these as soon as the owner approves screen capture on the PC.
