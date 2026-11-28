<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/openwizdev/.github/main/profile/art/wiz.png">
  <img alt="The OpenWiz Wiz" src="https://raw.githubusercontent.com/openwizdev/.github/main/profile/art/wiz.png" width="56">
</picture>

# WizPlugins

**Cloudroom plugins for watching an [OpenWiz](https://github.com/openwizdev/OpenWiz) factory.** Optional: OpenWiz 0.1.0 needs no plugin, and these work only in Cloudroom.

**Status:** one plugin, [WizBar](wizbar/README.md). [0.7.0](https://github.com/openwizdev/WizPlugins/releases/tag/wizbar/v0.7.0) is the latest release, and the marketplace listing uses `^0.7.0`. The source on `main` also includes sidebar polish that is not in that release.

## Quick start

Install **WizBar** from the [BB Marketplace](https://getbb.app/marketplace/wizbar) in the BB app or Cloudroom, then pick it in **Settings → Appearance → Sidebar**.

From source: see the [WizBar README](wizbar/README.md).

## How it works

<img alt="WizBar rendered with synthetic example rows" src="docs/images/wizbar.png" width="300">

WizBar replaces Cloudroom's sidebar thread list with four sections you can reorder: Pinned, Cloud agents, Specs and Yours. Thread cards show a pull request or issue number and a child count when available. Specs shows one row per spec with tickets, with what needs you first by default. Each ticket is a dot that shows its state. The dot of a ticket whose agent is working breathes unless the ticket is done or in review. Finished or long-idle specs with nothing due now fold into a Quiet group. Open a spec to see its running builders and reviewers with their model and effort. Yours keeps eligible active threads whether read or unread, with search, sort and filters. Cloud agents shows GitHub status notes for agents without a matching sidebar thread. An "N running" line opens a steady card of the running threads and live agents seen on GitHub. A small producer keeps the specs and agents files fresh from GitHub. `room-cli wizbar` commands with JSON let agents settle, snooze, mute, pin and move threads, list threads and Cloud agents, read the running card and the specs, open or close a spec, collapse a section and set the composer footer; the saved sorts, the section order, the Quiet group and opening the parked shelves have no command.

(The picture is an earlier render of the real UI with made-up data.)

## Links

- [WizBar README](wizbar/README.md) · [BB Marketplace listing](https://getbb.app/marketplace/wizbar) · [marketplace entry](marketplace/wizbar.json)
- [OpenWiz](https://github.com/openwizdev/OpenWiz) · [openwiz.dev](https://openwiz.dev) · [all repos](https://github.com/openwizdev)

## Credit and licence

WizBar starts from [Sawyer Hood’s T3 Sidebar](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar), copied unchanged from upstream commit `d3424f24e2cebe91da4e72cb38feb023da808922`. This repository starts with a fresh history; it does not import the upstream repository’s commits or other plugins.
Source path: `plugins/t3sidebar`; version tag: `t3sidebar/v0.1.0` (a different
commit from the copied snapshot above). WizBar changes follow that initial copy.

The root `LICENSE` retains Sawyer Hood’s upstream MIT notice. `wizbar/LICENSE` retains Michael Yong’s plugin MIT notice exactly. Both originals remain intact.

See the [public privacy and attribution audit](docs/verification/public-audit.md).
