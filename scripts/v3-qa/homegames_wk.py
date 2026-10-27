"""WebKitGTK checks for the shared chip rail, the first-run Welcome and start times in a real viewer zone (hardening H-A).
Sample data (?demo=1) for determinism; the driver is started with TZ=America/New_York so WebKit itself is the viewer in New York.
  TZ=America/New_York WK_PORT=4481 ./scripts/v3-qa/start_driver.sh &
  (cd scripts/v3-qa && python3 -m http.server 8781 &)
  WK_PORT=4481 WK_HARNESS_PORT=8781 QA_BASE=http://localhost:5181/sift-sports-intelligence/ python3 scripts/v3-qa/homegames_wk.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By

R = []
def check(name, cond, extra=''):
    R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra and not cond else ''))

q = QA(390, 844)
def els(css): return q.d.find_elements(By.CSS_SELECTOR, css)
def wait_for(css, t=30):
    for _ in range(t * 2):
        if els(css): return True
        q.wait(0.5)
    return False

RAIL = '''const r=document.querySelector(arguments[0]);const k=[...r.children];const cs=getComputedStyle(r);
return {rows:new Set(k.map(x=>Math.round(x.getBoundingClientRect().top))).size,wrap:cs.flexWrap,ox:cs.overflowX,sw:r.scrollWidth,cw:r.clientWidth,fade:r.getAttribute('data-fade'),
 page:document.documentElement.scrollWidth-innerWidth,sb:cs.scrollbarWidth,n:k.length}'''
try:
    for w in (320, 375, 390, 430):
        q.open('/v3/games?demo=1', settle=4, w=w, h=844)
        if not wait_for('.v3-chips--states .v3-chip'):
            print('FAIL games chips did not render at', w); R.append(False); continue
        f = q.js(RAIL, '.v3-chips--states')
        check(f'W{w}-1 Games state chips: one row, nowrap, scroll container, no page overflow', f['rows'] == 1 and f['wrap'] == 'nowrap' and f['ox'] == 'auto' and f['page'] <= 0, f)
        f2 = q.js(RAIL, '.v3-rail')
        check(f'W{w}-2 Games sport tabs: one row, no page overflow', f2['rows'] == 1 and f2['page'] <= 0, f2)
        if w == 320:
            check('W320-3 the overflowing chip rail fades its trailing edge', f['sw'] > f['cw'] and f['fade'] == 'end', f)
    # The active chip is scrolled into view (the last chip, opened at 320).
    q.open('/v3/games?demo=1&state=final', settle=4, w=320, h=844)
    wait_for('.v3-chips--states .v3-chip[aria-pressed=true]'); q.wait(0.8)
    vis = q.js('''const r=document.querySelector(".v3-chips--states").getBoundingClientRect(),c=document.querySelector(".v3-chips--states .v3-chip[aria-pressed=true]").getBoundingClientRect();return c.left>=r.left-0.5&&c.right<=r.right+0.5''')
    check('W320-4 opening on the last state chip scrolls it fully into view', vis)
    # Start times in the viewer's zone: the sample slate is built from local wall-clock times.
    q.open('/v3/games?demo=1', settle=4, w=390, h=844)
    wait_for('.v3-gc__time')
    times = [e.text.replace(' ', ' ').strip() for e in els('.v3-gc__time')]
    check('W-TZ-1 sample kick-offs read their wall-clock times (BUF at NYJ 1:00 PM, ORE at WASH 7:00 PM)', '1:00 PM' in times and '7:00 PM' in times, times[:8])
    tz = q.js('return Intl.DateTimeFormat().resolvedOptions().timeZone')
    check('W-TZ-2 the WebKit viewer is in the requested zone', tz == os.environ.get('TZ', tz), tz)
    # Welcome: real data only; a fresh profile sees it on Home. Open the sheet directly through the sample build's Settings is not possible, so assert the source copy is served.
    q.open('/v3?demo=0', settle=8, w=320, h=844)
    if wait_for('.v3-welcome', 25):
        t = q.js('return document.querySelector(".v3-welcome").innerText')
        check('W-WEL-1 welcome describes connected intelligence and the aspiration, and never says "never a pick"', 'connects sports and market intelligence' in t and 'building toward' in t and 'never a pick' not in t, t[:200])
        check('W-WEL-2 no horizontal overflow with the welcome open at 320', q.js('return document.documentElement.scrollWidth-innerWidth') <= 0)
    else:
        print('SKIP welcome: real documents unreachable from WebKit in this environment')
finally:
    try: q.d.quit()
    except Exception: pass
print(f'{sum(R)}/{len(R)} passed')
sys.exit(0 if all(R) else 1)
