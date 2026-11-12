# Run from repository root: browser-harness < docs/evidence/wz20/capture.py
# Uses one dedicated tab, closes it on completion, and fails on any mismatch.
import base64
import json
import time
from pathlib import Path

base = 'http://127.0.0.1:4177/docs/evidence/wz20/render.html?state='
out = Path('docs/evidence/wz20/screenshots')
out.mkdir(parents=True, exist_ok=True)
expected = {
    'ready': ['4 running · 2 top-level, 2 children', '1 cloud, 2 local, 1 unknown',
              'subagents not counted yet · some threads may be unseen',
              'Waiting on you: 3', 'Finished today: not available yet'],
    'unavailable': ['Stats unavailable', 'subagents not counted yet · some threads may be unseen'],
}
records = []
new_tab(base + 'ready')
try:
    cdp('Emulation.setEmulatedMedia', features=[{'name': 'prefers-reduced-motion', 'value': 'reduce'}])
    for device, width, height in [('desktop', 1440, 900), ('phone', 390, 844)]:
        cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)
        for mode in ['ready', 'unavailable']:
            goto_url(base + mode)
            wait_for_load()
            for _ in range(100):
                if js("document.documentElement.dataset.ready") == 'true':
                    break
                time.sleep(0.1)
            data = js('''(() => {
              const panel = document.querySelector('[aria-label="WizBar stats"]');
              const line = document.querySelector('#slot [aria-label$=" running"]');
              return {ready: document.documentElement.dataset.ready,
                lines: panel ? [...panel.querySelectorAll('p')].map(p => p.textContent) : null,
                listLine: line ? line.getAttribute('aria-label') : null,
                boltLabel: document.querySelector('#bolt').getAttribute('aria-label')};
            })()''')
            assert data['ready'] == 'true', data
            assert data['lines'] == expected[mode], data
            assert data['listLine'] == ('4 running' if mode == 'ready' else None), data
            assert data['boltLabel'] == 'WizBar stats', data
            shot = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
            filename = device + '-' + mode + '.png'
            (out / filename).write_bytes(base64.b64decode(shot['data']))
            records.append({'device': device, 'viewport': {'width': width, 'height': height},
                            'state': mode, 'screenshot': filename, **data})
    # The ready desktop render beside target picture C, for review.
    cdp('Emulation.setDeviceMetricsOverride', width=1600, height=560, deviceScaleFactor=1, mobile=False)
    goto_url('http://127.0.0.1:4177/docs/evidence/wz20/compare.html')
    wait_for_load()
    time.sleep(1)
    assert js("[...document.images].every(i => i.complete && i.naturalWidth > 0)"), 'comparison images missing'
    shot = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
    (out / 'beside-target-c.png').write_bytes(base64.b64decode(shot['data']))
    (out / 'capture.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
    print('PASS: 4 synthetic captures and the comparison with picture C; panel lines, list-bottom line and fixed label match the fixture.')
finally:
    cdp('Emulation.clearDeviceMetricsOverride')
    close_tab()
