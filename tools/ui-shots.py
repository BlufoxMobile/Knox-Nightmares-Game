#!/usr/bin/env python3
"""Screenshot every UI scene of tools/ui-test.html at iPhone landscape (852x393 @2x).
Usage: python3 -m http.server 8791 (from v2/) then  python3 tools/ui-shots.py [outdir] [scene ...]
"""
import sys, os, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/reviews/ui'
ONLY = set(sys.argv[2:])
BASE = 'http://localhost:8791/tools/ui-test.html'
# scene -> (delay ms before shot, extra query)
SCENES = {
    'title': (700, ''), 'title-diff': (700, ''), 'map': (500, ''), 'pause': (500, ''), 'wake': (900, ''),
    'cleared': (500, ''), 'victory': (600, ''), 'boss': (620, ''), 'boss-end': (1900, 'boss'), 'hud': (260, ''), 'dir': (200, ''), 'lefty': (300, ''),
    'settings': (500, ''), 'cold': (2000, ''),
}
os.makedirs(OUT, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 852, 'height': 393}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    for name, (delay, alias) in SCENES.items():
        if ONLY and name not in ONLY: continue
        page.goto(f'{BASE}?scene={alias or name}&guides=0')
        page.wait_for_function('window.__ready === true')
        page.wait_for_timeout(delay)
        page.screenshot(path=os.path.join(OUT, f'{name}.png'))
        print('shot', name)
    # text-size audit: any rendered text node under 12px inside #hud/#ov
    page.goto(f'{BASE}?scene=hud&guides=0'); page.wait_for_function('window.__ready === true'); page.wait_for_timeout(300)
    small = page.evaluate('''() => { const out = []; for (const el of document.querySelectorAll('#hud *, #ov *')) { if (!el.childNodes.length) continue; const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) out.push(el.id || el.className || el.tagName, fs); } return out; }''')
    print('text < 12px in HUD:', small)
    for sc in ['title-diff', 'map', 'pause', 'cleared', 'settings']:
        page.goto(f'{BASE}?scene={sc}&guides=0'); page.wait_for_function('window.__ready === true'); page.wait_for_timeout(300)
        small = page.evaluate('''() => { const out = []; for (const el of document.querySelectorAll('#ov *')) { const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) out.push(el.className || el.tagName, fs); } return out; }''')
        clipped = page.evaluate('''() => { const out = []; const H = innerHeight, W = innerWidth; for (const el of document.querySelectorAll('#ov [data-a], #ov h1, #ov h2, #ov .panel, #ov .wakep, #ov .victp')) { const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > H || r.left < 0 || r.right > W) out.push([el.className, Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]); } const p = document.querySelector('#ov .panel'); if (p && p.scrollHeight > p.clientHeight + 1 && !p.classList.contains('setp')) out.push(['PANEL SCROLLS', p.scrollHeight, p.clientHeight]); return out; }''')
        tiny = page.evaluate('''() => { const out = []; for (const el of document.querySelectorAll('#ov [data-a]')) { const r = el.getBoundingClientRect(); if (r.width < 48 || r.height < 48) out.push([el.dataset.a, Math.round(r.width), Math.round(r.height)]); } return out; }''')
        print(sc, '| text<12:', small, '| clipped:', clipped, '| targets<48:', tiny)
    b.close()
    if errors: print('ERRORS:', *errors, sep='\n  ')
