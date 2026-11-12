# Run from repository root: browser-harness < docs/evidence/wz16/capture.py
# Uses one dedicated tab, closes it on completion, and fails on any mismatch.
import base64
import json
from pathlib import Path

out = Path('docs/evidence/wz16/screenshots')
out.mkdir(parents=True, exist_ok=True)
records = []
new_tab('http://127.0.0.1:4176/docs/evidence/wz16/render.html?state=positive')
try:
    cdp('Emulation.setEmulatedMedia', features=[{'name':'prefers-reduced-motion','value':'reduce'}])
    for device, width, height in [('desktop', 1280, 800), ('phone', 390, 844)]:
        cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)
        for mode in ['positive', 'hover', 'zero', 'disabled', 'unavailable']:
            goto_url('http://127.0.0.1:4176/docs/evidence/wz16/render.html?state=' + mode)
            wait_for_load()
            cdp('Input.dispatchMouseEvent', type='mouseMoved', x=width-4, y=4)
            data = js('''(() => {
              const counters = [...document.querySelectorAll('[aria-label$=" running"]')];
              const c = counters[0], scroll = document.querySelector('#slot .overflow-y-auto');
              const box = e => e ? {x:e.getBoundingClientRect().x, y:e.getBoundingClientRect().y,
                width:e.getBoundingClientRect().width, height:e.getBoundingClientRect().height,
                bottom:e.getBoundingClientRect().bottom, right:e.getBoundingClientRect().right} : null;
              return {ready:document.documentElement.dataset.ready, count:c?.textContent ?? null,
                numberCount:counters.length, countBox:box(c), scrollBox:box(scroll),
                footerBox:box(document.querySelector('#host-footer')),
                outsideScroll:c ? !scroll.contains(c) : null,
                color:c ? getComputedStyle(c).color : null,
                footerLabel:document.querySelector('#host-footer').title};
            })()''')
            assert data['ready'] == 'true', data
            expected = None if mode in ['disabled', 'unavailable'] else '0' if mode == 'zero' else '2'
            assert data['count'] == expected, data
            assert data['numberCount'] == (0 if expected is None else 1), data
            assert data['footerLabel'] == 'Running count: see the line at the bottom of the list', data
            if expected is not None:
                box = data['countBox']
                assert data['outsideScroll'] and data['scrollBox']['bottom'] <= box['y'] + 0.5, data
                assert box['bottom'] <= data['footerBox']['y'] + 0.5 and box['height'] <= 32, data
            if mode == 'zero':
                assert data['color'] == 'rgb(146, 152, 161)', data
            if mode == 'hover':
                box = data['countBox']
                cdp('Input.dispatchMouseEvent', type='mouseMoved', x=box['x']+18, y=box['y']+box['height']/2)
                tip = js('''(() => {const t=document.querySelector('[role=tooltip]'); if(!t)return null;
                  const b=t.getBoundingClientRect(); return {text:t.textContent,x:b.x,right:b.right,y:b.y};})()''')
                assert tip and tip['text'] == '2 running · subagents not counted yet · some threads may be unseen', tip
                assert tip['x'] >= 0 and tip['right'] <= width and tip['y'] >= 0, tip
                data['tooltip'] = tip
            shot = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
            filename = device + '-' + mode + '.png'
            (out / filename).write_bytes(base64.b64decode(shot['data']))
            records.append({'device':device, 'viewport':{'width':width,'height':height}, 'state':mode,
                            'screenshot':filename, **data})
    (out / 'capture.json').write_text(json.dumps(records, indent=2) + '\n')
    print('PASS: 10 synthetic captures; exact counts, list placement, dim zero, hidden states and hover bounds.')
finally:
    cdp('Emulation.clearDeviceMetricsOverride')
    close_tab()
