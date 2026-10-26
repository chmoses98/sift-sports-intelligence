"""Prop Discovery critical paths in WebKitGTK (real WebKit engine, real published documents through the session proxy).
   QA_BASE=http://localhost:5178/sift-sports-intelligence/ python3 scripts/v3-qa/props_wk.py
   Checks: home renders, list is windowed, a tap and Back restore address + scroll, expand keeps state across Back, search adds no
   history entry, the filter sheet closes with Back, compare flow, no horizontal overflow at 390 and 375."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By

R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' - ' + str(extra) if extra and not cond else ''))

def run(w, h):
    q = QA(w, h)
    H = lambda: q.js('return location.hash')
    Y = lambda: q.js('return Math.round(scrollY)')
    count = lambda css: q.js('return document.querySelectorAll(arguments[0]).length', css)
    sheet = lambda: q.js('return !!document.querySelector(".v3-sheet")')
    def click(css, nth=0, wait=0.9):
        els = q.d.find_elements(By.CSS_SELECTOR, css)
        if len(els) <= nth: raise RuntimeError('no element ' + css)
        q.js('arguments[0].scrollIntoView({block:"center"})', els[nth]); q.wait(0.35)
        els[nth].click(); q.wait(wait)
    def wait_for(css, secs=60):
        for _ in range(int(secs * 2)):
            if count(css): return True
            q.wait(0.5)
        return False
    tag = f'[{w}x{h}] '
    try:
        q.open('/v3/props', settle=3)
        check(tag + 'home renders prop cards from published documents', wait_for('.pd-card'), count('.pd-card'))
        check(tag + 'home: no horizontal overflow', q.js('return document.documentElement.scrollWidth - innerWidth') <= 0)
        check(tag + 'home: lanes in order Market, History, SIFT model', q.js('return [...document.querySelector(".pd-card .pd-lanesL").querySelectorAll(".t")].map(e=>e.textContent.trim()).join("|")') == 'Market|History|SIFT model')
        h0 = H()
        click('.pd-seeall')
        check(tag + 'See all opens a list preset', 'view=list' in H() and 'preset=' in H(), H())
        q.js('history.back()'); q.wait(1.5)
        check(tag + 'Back returns to the home', H() == h0, H())

        q.open('/v3/props?v=1&view=list', settle=3)
        check(tag + 'list renders', wait_for('.pd-row'))
        n = count('.pd-row'); total = q.js('return Number(document.querySelector(".pd-list").getAttribute("aria-rowcount"))')
        check(tag + 'list is windowed (few DOM rows, many rows)', n < 40 and total > n, (n, total))
        check(tag + 'list: no horizontal overflow', q.js('return document.documentElement.scrollWidth - innerWidth') <= 0)
        docH = q.js('return document.documentElement.scrollHeight')
        q.js('window.scrollTo(0, arguments[0])', int(docH * 0.5)); q.wait(1.0)
        el = q.d.find_elements(By.CSS_SELECTOR, '.pd-row .pd-pn a[data-tap="game"]')[5]
        q.js('arguments[0].scrollIntoView({block:"center"})', el); q.wait(0.4)
        y0 = Y(); h1 = H()
        el.click(); q.wait(1.2)
        check(tag + 'game text opens Game Detail', '/v3/game/' in H(), H())
        q.js('history.back()'); q.wait(2.0)
        check(tag + 'Back restores the list address', H() == h1, (H(), h1))
        check(tag + 'Back restores a deep scroll position', y0 > 500 and abs(Y() - y0) < 8, (y0, Y()))

        # expand a row, change nothing else, tap Research/Contract and Back
        q.open('/v3/props?v=1&view=list&sport=nfl', settle=3)
        wait_for('.pd-row')
        hl = q.js('return history.length')
        click('.pd-row .pd-row__hit', 0)
        check(tag + 'a tap expands the row in place (peek, address)', count('.pd-peek') == 1 and 'exp=' in H(), H())
        check(tag + 'expanding adds no history entry', q.js('return history.length') == hl)
        h2 = H(); y2 = Y()
        links = q.d.find_elements(By.CSS_SELECTOR, '.pd-peek .pd-acts a[data-tap="player"]')
        if links:
            q.js('arguments[0].scrollIntoView({block:"center"})', links[0]); q.wait(0.3); y2 = Y(); links[0].click(); q.wait(1.5)
            check(tag + 'Research opens Player Research', '/v3/player/' in H(), H())
            q.js('history.back()'); q.wait(2.0)
            check(tag + 'Back restores the expanded row, address and scroll', H() == h2 and count('.pd-peek') == 1 and abs(Y() - y2) < 8, (H(), Y(), y2))
        price = q.d.find_elements(By.CSS_SELECTOR, '.pd-peek .pd-acts a[data-tap="price"]')
        if price:
            q.js('arguments[0].scrollIntoView({block:"center"})', price[0]); q.wait(0.3); y3 = Y(); price[0].click(); q.wait(1.0)
            check(tag + 'Contract puts the sheet in the address', 'sheet=contract' in H(), H())
            q.js('history.back()'); q.wait(1.2)
            check(tag + 'Back closes the contract sheet and restores the screen', 'sheet=' not in H() and not sheet() and abs(Y() - y3) < 8, (H(), Y(), y3))

        # search
        q.open('/v3/props?v=1&view=list', settle=3); wait_for('.pd-row')
        hl = q.js('return history.length')
        box = q.d.find_element(By.CSS_SELECTOR, '.pd-search input'); box.click(); box.send_keys('rece'); q.wait(1.2)
        check(tag + 'typing mirrors into the address', 'q=rece' in H(), H())
        check(tag + 'typing adds no history entry', q.js('return history.length') == hl)

        # filter sheet
        click('.pd-btn--sort')
        check(tag + 'sort and filter sheet opens', sheet())
        check(tag + 'locked facets are notes with reasons', 'Needs more data' in q.js('return document.querySelector(".pd-locked").innerText'))
        q.js('history.back()'); q.wait(1.0)
        check(tag + 'Back closes the sheet', not sheet() and 'q=rece' in H(), H())

        # compare
        q.open('/v3/props?v=1&view=list&cmpm=1', settle=3); wait_for('.pd-row')
        for i in range(2): click('.pd-row .pd-row__hit', i, 0.5)
        check(tag + 'two ticks give a tray with Compare', count('.pd-tray a.pd-abtn--pri') == 1 and 'cmp=' in H(), H())
        click('.pd-tray a.pd-abtn--pri')
        check(tag + 'compare screen shows two columns with Contract under each', count('.pd-crow--hd .pd-cell') == 2 and count('.pd-crow--acts a[data-tap="price"]') == 2)
        check(tag + 'compare: no horizontal overflow', q.js('return document.documentElement.scrollWidth - innerWidth') <= 0)
        q.js('history.back()'); q.wait(1.5)
        check(tag + 'Back restores the selections', count('.pd-tray') == 1 and 'cmp=' in H(), H())
    except Exception as e:
        check(tag + 'no exception', False, repr(e))
    finally:
        q.close()

if __name__ == '__main__':
    for w, h in ((390, 844), (375, 667)):
        run(w, h)
    bad = [r for r in R if not r[1]]
    print(f'\n{len(R) - len(bad)}/{len(R)} checks passed')
    sys.exit(1 if bad else 0)
