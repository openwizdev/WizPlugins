<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/openwizdev/.github/main/profile/art/wiz.png">
  <img alt="The OpenWiz Wiz" src="https://raw.githubusercontent.com/openwizdev/.github/main/profile/art/wiz.png" width="56">
</picture>

# WizPlugins

**Cloudroom plugins for watching an [OpenWiz](https://github.com/openwizdev/OpenWiz) factory.** Optional: OpenWiz 0.1.0 needs no plugin, and these work only in Cloudroom.

**Status:** one plugin, [WizBar](wizbar/README.md). Version 0.5.0 is the published version: the marketplace serves it once the registry's WizBar entry has the range `^0.5.0`.

## Quick start

Install **WizBar** from the [BB Marketplace](https://getbb.app/marketplace/wizbar) in the BB app or Cloudroom, then pick it in **Settings → Appearance → Sidebar**.

From source: see the [WizBar README](wizbar/README.md).

## How it works

<img alt="WizBar rendered with synthetic example rows" src="docs/images/wizbar.png" width="300">

WizBar replaces Cloudroom's sidebar with one card per agent thread, newest first: its issue or pull request, its children, and a live "N running" line. Under the list, one row per running spec shows each ticket as a dot: done, building, in review, or needs you; open a spec to see its running builders and reviewers with their model and effort. A small producer keeps the specs file fresh from GitHub. Every WizBar action is also a `room-cli wizbar` command with JSON, so agents can use it too.

(The picture is the real UI rendered with made-up data.)

## Links

- [WizBar README](wizbar/README.md) · [BB Marketplace listing](https://getbb.app/marketplace/wizbar) · [marketplace entry](marketplace/wizbar.json)
- [OpenWiz](https://github.com/openwizdev/OpenWiz) · [openwiz.dev](https://openwiz.dev) · [all repos](https://github.com/openwizdev)

## Credit and licence

WizBar starts from [Sawyer Hood’s T3 Sidebar](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar), copied unchanged from upstream commit `d3424f24e2cebe91da4e72cb38feb023da808922`. This repository starts with a fresh history; it does not import the upstream repository’s commits or other plugins.
Source path: `plugins/t3sidebar`; version tag: `t3sidebar/v0.1.0` (a different
commit from the copied snapshot above). WizBar changes follow that initial copy.

The root `LICENSE` retains Sawyer Hood’s upstream MIT notice. `wizbar/LICENSE` retains Michael Yong’s plugin MIT notice exactly. Both originals remain intact.

See the [public privacy and attribution audit](docs/verification/public-audit.md).
