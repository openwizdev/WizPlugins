# Documentation baseline review — FAIL

Reviewed at `0e1cecc81e9e3e9f739d99c6a970e39fcd668290`, before WZ15 edits.

- `wizbar/README.md` begins `# T3 Sidebar` and describes the upstream example,
  not WizBar in `openwizdev/wizplugins`.
- It directs readers to the archived upstream release through the legacy
  executable, rather than WizBar's prepared desktop build/install path.
- It omits WizBar's five registered lifecycle command operations.
- It lacks the copied snapshot commit and separate MIT-notice attribution.
- It does not disclose WizBar's blank production footer or pending next-iteration
  settings/mute/count work and live acceptance gaps.
- `wizbar/contracts/wizbar.v1.md` still describes SDK 0.4.4 and the historical
  build script, while the manifest/lockfile currently pin 0.6.33 and the build
  script names `room-cli plugin build .`.

This is a documentation review, not a failing behavior test or live observation.
