# Render the real sidebar

A screenshot tool for design work: it mounts WizBar's real thread list with the SDK's test runtime and a synthetic scene (`scene.ts`, made-up names only), writes the DOM with the compiled `dist/app.css` and dark host variables to HTML, and screenshots it at 2x with headless Chromium. It is not a live host check.

```sh
cd wizbar
npm ci
npm run build                    # optional, with the desktop build command
tools/render/shoot.sh /tmp/wizbar-shots 900
```

With no plugin build, it uses the installed host stylesheet. The script
uses `chromium` on `PATH`; set `CHROMIUM=/path/to/browser` to use another
Chromium binary. It writes `sidebar.png` (the list) and `card.png` (the "N running" card pinned open). Options by environment: `WIZBAR_RENDER_AGENTS` (running spec agents, default 24), `WIZBAR_RENDER_VIEWS` (`sidebar,card`), `WIZBAR_RENDER_SEARCH` (a search query). The test is skipped in the normal `npm test` run unless `WIZBAR_RENDER_OUT` is set. jsdom has no layout, so the footer is placed near the bottom by a stub; animations are paused.
