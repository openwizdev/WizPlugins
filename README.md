# WizBar

WizBar is the first plugin in WizPlugins: an agent-first OpenWiz sidebar for
Cloudroom, in `wizbar/`, now at version 0.3.0. Its cards show the issue or
pull request link and child count, with children on hover; a live "N running"
line sits below the list, with a stats panel on the footer bolt; drag pins,
unpins and reorders through the host's pins; and every WizBar action is a
`room-cli wizbar` command with JSON. See the [WizBar README](wizbar/README.md).

![WizBar rendered with synthetic example rows](docs/images/wizbar.png)

Actual React UI rendered through the SDK fixture harness, with synthetic data and
styling; this is not an installed-app screenshot. v0.3's behaviour is proved by
fixture tests in CI; on a real host it awaits the live check in
[#9](https://github.com/openwizdev/WizPlugins/issues/9).

## Install

**BB Marketplace (BB app and Cloudroom): not listed yet.** Publication waits for
Jake's go-ahead in [#45](https://github.com/openwizdev/WizPlugins/issues/45).
Once listed, install **WizBar** from the marketplace. Until then, from source
(Unverified; read the [install and rollback kit](https://github.com/openwizdev/WizPlugins/issues/9#issuecomment-6768833446) first):

```sh
git clone https://github.com/openwizdev/WizPlugins.git && cd WizPlugins/wizbar && npm ci && room-cli plugin build . && room-cli plugin install .
```

Then select WizBar in **Settings → Appearance → Sidebar**. The
[WizBar README](wizbar/README.md#install) has the full steps and rollback notes.
The draft marketplace entry is in [`marketplace/`](marketplace/wizbar.json) and
the [marketplace research](docs/discovery/marketplaces.md) records how listing works.

## Credit and licence

WizBar starts from [Sawyer Hood’s T3 Sidebar](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar), copied unchanged from upstream commit `d3424f24e2cebe91da4e72cb38feb023da808922`. This repository starts with a fresh history; it does not import the upstream repository’s commits or other plugins.
Source path: `plugins/t3sidebar`; version tag: `t3sidebar/v0.1.0` (a different
commit from the copied snapshot above). WizBar changes follow that initial copy.

The root `LICENSE` retains Sawyer Hood’s upstream MIT notice. `wizbar/LICENSE` retains Michael Yong’s plugin MIT notice exactly. Both originals remain intact.

See the [public privacy and attribution audit](docs/verification/public-audit.md).
