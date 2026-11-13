# WizBar v0.3: a sidebar your agents can drive

**For:** Cloudroom's founder. **From:** OpenWiz. **Release:** [`wizbar/v0.3.0`](https://github.com/openwizdev/wizplugins/releases/tag/wizbar/v0.3.0).

## What it is

WizBar is a sidebar for running fleets of agent threads in Cloudroom and BB. Cards show each thread's issue or pull request link and child count, children open from a hover list, a live "N running" line sits below the list with a stats panel on the footer bolt, and dragging pins, unpins and reorders.

We'd like you to consider it as Cloudroom's default sidebar.

## Why it is agent-first

Every WizBar action in the sidebar is also a `room-cli wizbar` command, and every command takes `--json`: `settle`, `snooze`, `mute`, `pin`, `unpin`, `move`, `children`, `stats` and `list`, with their undo commands. `children` and `stats` share one computation with the hover list and the stats panel, so the JSON an agent reads is what a person sees. So agents can keep the sidebar tidy (settle finished work, mute fleet work, pin and order what matters) and read it (`stats --json` for the running count). A test fails the build if a WizBar action has no command.

The row menu's host-owned items (Archive, Mark read / Mark unread, Open in split, Delete) call Cloudroom's own actions and have no `wizbar` command. Mark read / Mark unread has no agent route at all yet ([#60](https://github.com/openwizdev/wizplugins/issues/60), for v0.4).

## Try it

In Cloudroom or the BB app, open the BB Marketplace, find **WizBar** and install it. Then choose WizBar in **Settings → Appearance → Sidebar**.

## What the live check proved

On a real desktop install of v0.3 ([record](../acceptance/wizbar-v0.3.md), with screenshots):

- Every new command with `--json` worked on real threads, and the host agreed: pins, the pinned order after `move`, mute and unmute.
- The "N running" line equalled `stats --json` on two live reads while work changed, and stats matched an independent host count that included a child and a muted thread.
- Child counts, the parent and children chips and their settings, and the Cloud and Local icons showed as designed; settings survived a plugin reload. One finding: the chip read `1 children`.
- The hover list and click-to-open, the card link, branch on hover, the narrow width, drag, the stats panel and the settings page were accepted by the owner after using them by hand, not from a recorded run.

## What it did not prove

- **Install from the marketplace:** not yet observed in either app; the check installed from source. That is the next step ([#45](https://github.com/openwizdev/wizplugins/issues/45)).
- **Model and effort** are left off the cards: the host doesn't expose them to plugins yet. A host field for them would let WizBar show them.
- **The `1 child` fix** is in v0.3.0 but came after the live check; it is proved by tests, not on a live install.
- **Mark read / Mark unread** for agents: no route yet (#60). Subagents are not counted in the stats.

## Credit

WizBar derives from [Sawyer Hood's T3 Sidebar](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar) and keeps its MIT notices. Thank you, Sawyer.
