# Run from repository root: browser-harness < docs/evidence/wz18/capture.py
# Uses one dedicated tab, closes it on completion, and fails on any mismatch.
import base64
import json
from pathlib import Path

out = Path('docs/evidence/wz18/screenshots')
out.mkdir(parents=True, exist_ok=True)
base = 'http://127.0.0.1:4178/docs/evidence/wz18/render.html?models='
records = []
new_tab(base + 'none')
try:
    cdp('Emulation.setEmulatedMedia', features=[{'name':'prefers-reduced-motion','value':'reduce'}])
    for width in [320, 390]:
        cdp('Emulation.setDeviceMetricsOverride', width=width, height=844, deviceScaleFactor=2, mobile=False)
        for state in ['none', 'host', 'hover']:
            goto_url(base + ('none' if state == 'none' else 'host'))
            wait_for_load()
            for _ in range(50):
                if js('document.documentElement.dataset.ready') == 'true':
                    break
                wait(0.1)
            cdp('Input.dispatchMouseEvent', type='mouseMoved', x=width-2, y=840)
            if state == 'hover':
                box = js('''(() => {const b=[...document.querySelectorAll('li')][0].getBoundingClientRect();
                  return {x:b.x+b.width/2, y:b.y+12};})()''')
                cdp('Input.dispatchMouseEvent', type='mouseMoved', x=box['x'], y=box['y'])
            data = js('''(() => {
              const cards = [...document.querySelectorAll('li')].map(li => {
                const line = li.querySelector('[role=group][aria-label="Thread details"]');
                const lb = li.getBoundingClientRect();
                const chips = [...line.children].filter(c => c.textContent.trim());
                const hover = [...li.querySelectorAll('span')].find(s => s.className.includes('group-hover/card:block'));
                return {
                  title: li.querySelector('a').getAttribute('aria-label'),
                  chips: chips.map(c => c.textContent.trim()),
                  clipped: chips.filter(c => { const b = c.getBoundingClientRect();
                    return b.right > lb.right + 0.5 || b.left < lb.left - 0.5 || c.scrollWidth > c.clientWidth + 1; })
                    .map(c => c.textContent.trim()),
                  lineRows: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size,
                  hoverText: hover ? hover.textContent : null,
                  hoverVisible: hover ? getComputedStyle(hover).display !== 'none' : false,
                };
              });
              return {cards, pageOverflow: document.documentElement.scrollWidth > innerWidth};
            })()''')
            first = data['cards'][0]
            assert first['title'] == 'Sample refine command palette', first
            expect = ['#1042 → PR #1088', '3 children']
            if state != 'none':
                expect = ['Opus 5.5 · Medium'] + expect
            assert first['chips'] == expect, first
            assert not data['pageOverflow'], data
            for card in data['cards']:
                assert card['clipped'] == [], card
                assert not any('·' in chip for chip in card['chips']) or state != 'none', card
            visible = [c['title'] for c in data['cards'] if c['hoverVisible']]
            assert visible == (['Sample refine command palette'] if state == 'hover' else []), visible
            if state == 'hover':
                assert first['hoverText'] == 'room/1042-refine-command-palette-a1b2', first
            shot = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
            filename = f'{width}-{state}.png'
            (out / filename).write_bytes(base64.b64decode(shot['data']))
            records.append({'width': width, 'state': state, 'screenshot': filename, **data})
    (out / 'capture.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
    print('PASS: 6 synthetic captures at 320 and 390 px; chips wrap without clipping; branch on hover only.')
finally:
    cdp('Emulation.clearDeviceMetricsOverride')
    close_tab()
