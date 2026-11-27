# WizBar for T3: the vertical rail

Screenshots for the `t3/` board's vertical tab rail, in Chrome with the dark colour scheme, on made-up data
(`t3/board/fixtures/synthetic.ts`, the fake producer and the fake `t3`).

- `before-390.png`, `before-1440.png`: the board at commit `689e390`, before the rail.
- `after-390.png`, `after-1440.png`: the board with the rail, on its default view, Now, with two pinned links
  (`--pin 'Slack=https://example.slack.com/' --pin 'Terminal=http://localhost:7681/'`).
- `after-390-label.png`: under 420 px the rail shows icons only; the pointer is on Usage, so its name shows.
- `after-1440-usage.png`: the Usage view.

The 390 px pictures are at 2x, the 1440 px ones at 1x. Both servers ran the same command:

```sh
node t3/board/server.ts --home <empty folder> --repo example/site --producer t3/board/fixtures/fake-producer.ts \
  --t3 t3/board/fixtures/fake-t3.mjs --t3-project demo [--pin …]
```
