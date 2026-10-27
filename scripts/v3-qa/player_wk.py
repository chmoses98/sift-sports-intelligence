"""WebKit (WebKitGTK) checks for Player Research: the critical paths on the real engine.
   WK_PORT=4455 WK_HARNESS_PORT=8775 QA_BASE=http://localhost:5175/sift-sports-intelligence/ python3 scripts/v3-qa/player_wk.py
Sample player (demo data, always has a ladder) for scrub and filters; a real published player for the live-document paths
(what that page shows depends on the day's slate: the real checks only assert what is true either way)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
R = []
def check(name, cond, extra=''):
    R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra and not cond else ''))
q = QA(390, 844)
H = lambda: q.js('return location.hash')
count = lambda css: q.js('return document.querySelectorAll(arguments[0]).length', css)
sheet = lambda: q.js('return !!document.querySelector(".v3-sheet")')
def click(css, nth=0, wait=0.8):
    els = q.d.find_elements(By.CSS_SELECTOR, css)
    if not els: raise RuntimeError('no element ' + css)
    q.js('arguments[0].scrollIntoView({block:"center"})', els[nth]); q.wait(0.3)
    els[nth].click(); q.wait(wait)
SAMPLE = '/v3/player/nba/sample-guard'
REAL = '/v3/player/nfl/prt_4c661ae8b854ff5f66dd'
try:
    # ---- the sample player: scrub, filters sheet, tabs, Back
    q.open('/v3?demo=1', settle=5)          # sample data on (a stored preference), as the shared journeys do
    q.open(SAMPLE + '?stat=pts', settle=7)
    check('W1 five tabs', q.js('return [...document.querySelectorAll("[role=tab]")].map(t=>t.textContent.replace(/\\d+$/,"")).join(",")') == 'Overview,Props,Matchup,Trends,Log', q.js('return [...document.querySelectorAll("[role=tab]")].map(t=>t.textContent).join(",")'))
    check('W2 chart, line and three lanes render', count('.v3p-hb__bar') > 0 and count('.x-trio > *') == 3)
    q.js('window.scrollTo(0, 100)'); q.wait(0.6); y0 = q.js('return scrollY')
    g = q.d.find_element(By.CSS_SELECTOR, '.v3p-hb__grab'); v0 = g.get_attribute('aria-valuenow')
    ActionChains(q.d).click_and_hold(g).move_by_offset(0, 60).perform(); q.wait(0.5)
    check('W3 dragging the line shows the readout in place of the window chips', count('.v3p-readout') == 1 and count('.v3p-wins') == 0)
    v1 = q.d.find_element(By.CSS_SELECTOR, '.v3p-hb__grab').get_attribute('aria-valuenow')
    check('W4 the line moved to another rung (half-point line)', v1 != v0 and float(v1) % 1 == 0.5, (v0, v1))
    ActionChains(q.d).release().perform(); q.wait(0.8)
    check('W5 release commits the line to the address and restores the chips', f'line={v1}' in H() and count('.v3p-wins') == 1, H())
    check('W6 the page did not scroll while dragging', abs(q.js('return scrollY') - y0) <= 3, (y0, q.js('return scrollY')))
    n = q.js('return history.length')
    click('.v3p-pill--f'); check('W7 filters sheet opens (one history entry)', sheet() and q.js('return history.length') == n + 1)
    check('W8 locked rows are notes, not buttons', count('.v3p-fc.is-locked[role=note]') >= 4 and count('.v3p-fc.is-locked button') == 0, count('.v3p-fc.is-locked'))
    h = H(); q.js('history.back()'); q.wait(1.0)
    check('W9 Back closes the sheet and keeps line and window', not sheet() and H() == h)
    click('.x-tabs [role=tab]', 3); check('W10 Trends in place', 'tab=trends' in H() and count('.v3p-tt__r') == 5, H())
    click('.v3p-replaylink'); check('W11 Replay opens inside Trends with its address', 'view=replay' in H() and count('[aria-label="SIFT Replay"]') == 1, H())
    q.open(SAMPLE + '?tab=replay', settle=6); check('W12 legacy tab=replay opens Replay', count('[aria-label="SIFT Replay"]') == 1, H())
    q.open(SAMPLE + '?tab=log', settle=6); check('W13 legacy tab=log opens Log', count('.v3p-gl li') > 0)
    # ---- the real engine on real documents (sample data off again)
    q.open('/v3/settings', settle=4)
    q.js('localStorage.removeItem("sift3.demo"); sessionStorage.clear()')
    q.open(REAL + '?demo=0', settle=14)
    txt = q.js('return document.body.innerText')
    check('W14 a real player renders (chart or an honest state), five tabs, no horizontal overflow', count('[role=tab]') == 5 and q.js('return document.documentElement.scrollWidth - document.documentElement.clientWidth') <= 1, txt[:200])
    check('W15 no freshness words on the real page', not any(w in txt.lower() for w in (' ago', 'stale', 'last updated', 'last known')))
    if count('.v3p-hb__bar'):
        el = q.d.find_element(By.CSS_SELECTOR, '.v3p-strip-g > a[data-tap="team"]')
        q.js('arguments[0].scrollIntoView({block:"center"})', el); q.wait(0.6); ys = q.js('return scrollY')   # the offset the viewer leaves at
        el.click(); q.wait(0.8)
        check('W16 the team logo opens Team Research', '/v3/team/' in H(), H())
        q.js('history.back()'); q.wait(2.0)
        check('W17 Back restores the player, the tab and the scroll', '/v3/player/' in H() and abs(q.js('return scrollY') - ys) <= 8, (ys, q.js('return scrollY')))
        if count('.v3p-dl__r[data-tap=price]'):
            click('.v3p-dl__r'); check('W18 the price opens the exact-contract sheet', 'sheet=contract' in H() and sheet())
            q.js('history.back()'); q.wait(1.0); check('W19 Back closes the contract sheet', not sheet() and 'sheet=' not in H())
finally:
    try: q.d.quit()
    except Exception: pass
print(f'{sum(R)}/{len(R)} passed')
sys.exit(0 if all(R) else 1)
