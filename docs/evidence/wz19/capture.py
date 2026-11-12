# Run from repository root: browser-harness < docs/evidence/wz19/capture.py
# Uses one dedicated tab, closes it on completion, and fails on any mismatch.
import base64
import json
from pathlib import Path

out = Path('docs/evidence/wz19/screenshots')
out.mkdir(parents=True, exist_ok=True)
base = 'http://127.0.0.1:4179/docs/evidence/wz19/render.html?models='
records = []
new_tab(base + 'none')
try:
    cdp('Emulation.setEmulatedMedia', features=[{'name': 'prefers-reduced-motion', 'value': 'reduce'}])
    for width in [320, 390]:
        cdp('Emulation.setDeviceMetricsOverride', width=width, height=844, deviceScaleFactor=2, mobile=False)
        for state in ['hover-none', 'hover-host', 'focus-host', 'escape-host', 'click-host']:
            goto_url(base + state.split('-')[1])
            wait_for_load()
            for _ in range(80):
                if js('document.documentElement.dataset.ready') == 'true':
                    break
                wait(0.1)
            cdp('Input.dispatchMouseEvent', type='mouseMoved', x=width - 2, y=840)
            chip = '3 children' if state != 'focus-host' and state != 'escape-host' else '1 child'
            box = js('''(() => {const b=[...document.querySelectorAll('button')].find(e => e.textContent === %s).getBoundingClientRect();
              return {x:b.x+b.width/2, y:b.y+b.height/2};})()''' % json.dumps(chip))
            if state.startswith('hover') or state == 'click-host':
                cdp('Input.dispatchMouseEvent', type='mouseMoved', x=box['x'], y=box['y'])
            else:
                js('[...document.querySelectorAll("button")].find(e => e.textContent === %s).focus()' % json.dumps(chip))
            wait(0.4)
            if state == 'escape-host':
                for kind in ['keyDown', 'keyUp']:
                    cdp('Input.dispatchKeyEvent', type=kind, key='Escape', code='Escape', windowsVirtualKeyCode=27)
                wait(0.2)
            data = js('''(() => {
              const d = document.querySelector('[role=dialog]');
              if (!d) return {open: false, focused: document.activeElement?.textContent};
              const b = d.getBoundingClientRect();
              return {open: true, label: d.getAttribute('aria-label'),
                rows: [...d.querySelectorAll('button')].map(e => e.getAttribute('aria-label') || e.textContent),
                text: d.innerText, box: {left: b.left, right: b.right, top: b.top, bottom: b.bottom},
                inside: b.left >= 0 && b.right <= document.documentElement.clientWidth && b.top >= 0 && b.bottom <= document.documentElement.clientHeight,
                pageOverflow: document.documentElement.scrollWidth > innerWidth};
            })()''')
            if state == 'escape-host':
                assert not data['open'] and data['focused'] == '1 child', data
            else:
                assert data['open'] and data['inside'] and not data['pageOverflow'], data
                if chip == '3 children':
                    assert data['rows'] == ['Open child: Sample audit shortcuts, working, now',
                        'Open child: Sample check focus order, waiting, 2m',
                        'Open child: Sample test search states, unread, 8m', 'Open parent'], data
                    assert ('Opus 5.5 · Medium' in data['text']) == state.endswith('host'), data
            if state == 'click-host':
                b = js('''(() => {const r=[...document.querySelectorAll('[role=dialog] button')][1].getBoundingClientRect();
                  return {x:r.x+r.width/2, y:r.y+r.height/2};})()''')
                cdp('Input.dispatchMouseEvent', type='mouseMoved', x=b['x'], y=b['y'])
                for kind in ['mousePressed', 'mouseReleased']:
                    cdp('Input.dispatchMouseEvent', type=kind, x=b['x'], y=b['y'], button='left', clickCount=1)
                wait(0.2)
                data['openCalls'] = js('window.calls().filter(c => c.method === "open").map(c => c.threadId)')
                assert data['openCalls'] == ['thr_v3_child_waiting'], data
            else:
                shot = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
                filename = f'{width}-{state}.png'
                (out / filename).write_bytes(base64.b64decode(shot['data']))
                data['screenshot'] = filename
            records.append({'width': width, 'state': state, **data})
    (out / 'capture.json').write_text(json.dumps(records, indent=1) + '\n')
    print('captured', len(records))
finally:
    close_tab()
