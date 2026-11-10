# Run from repository root: browser-harness < docs/evidence/wz5/capture-hover.py
# Synthetic fixture only. Capture a real pointer hover, then close our tabs.
import base64
import json
from pathlib import Path

out = Path('docs/evidence/wz5/hover')
out.mkdir(exist_ok=False)
captures = []
for name, width, height in [('phone', 390, 844), ('desktop', 1440, 900)]:
    tab = new_tab()
    try:
        activate_tab(tab)
        cdp('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)
        cdp('Emulation.setEmulatedMedia', features=[{'name':'prefers-reduced-motion', 'value':'reduce'}])
        cdp('Page.navigate', url='http://127.0.0.1:4176/docs/evidence/wz5/browser.html?state=positive')
        assert wait_for_load()
        assert wait_for_element('[data-ready="true"]', timeout=10, visible=True)
        box = js('(() => { const r=document.querySelector("[role=status]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()')
        cdp('Input.dispatchMouseEvent', type='mouseMoved', x=box['x'], y=box['y'])
        assert wait_for_element('[role="tooltip"]', timeout=5, visible=True)
        assert js('document.querySelector("[role=tooltip]").textContent') == '2 threads, 3 subagents'
        cdp('Runtime.evaluate', expression='document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))', awaitPromise=True)
        measured = js('(() => { const a=document.querySelector("[role=status]"),t=document.querySelector("[role=tooltip]"),s=getComputedStyle(a);return {contentWidth:document.documentElement.scrollWidth,countColor:s.color,numberFont:s.fontSize,tooltipColor:getComputedStyle(t).color,tooltipBackground:getComputedStyle(t).backgroundColor,animation:getComputedStyle(a.querySelector("svg")).animationName}; })()')
        assert measured['contentWidth'] == width
        png = cdp('Page.captureScreenshot', format='png', captureBeyondViewport=False)
        (out/(name+'.png')).write_bytes(base64.b64decode(png['data'], validate=True))
        captures.append({'file':name+'.png', 'viewport':{'width':width,'height':height}, 'measured':measured})
    finally:
        close_tab(tab)
(out/'capture.json').write_text(json.dumps({'state':'synthetic pointer hover','deviceScaleFactor':1,'captures':captures}, indent=2)+'\n')
print('Captured synthetic pointer hover at both widths')
