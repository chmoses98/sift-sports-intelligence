"""WebKitGTK (real WebKit engine, not iOS Safari) smoke of the CAPTURED-DATA preview: the four root tabs and a tap path to one design of each family,
on the built bundle served statically (no network but localhost). The full 26-design crawl is scripts/v3-qa/preview-routes.mjs (Chromium).

  ./scripts/v3-qa/start_driver.sh &                      (WK_PORT=4477 to keep clear of other workers)
  node scripts/v3-preview/serve.mjs dist-v3-snapshot 8777 &
  WK_PORT=4477 python3 scripts/v3-qa/preview_wk.py http://127.0.0.1:8777/ OUTDIR
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wk import driver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

URL = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/preview_wk'
os.makedirs(OUT, exist_ok=True)
R = []


def check(name, cond, extra=''):
    R.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' - ' + str(extra)))


def wait(d, fn, timeout=40, step=0.4):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            last = fn()
            if last:
                return last
        except Exception as e:  # element not there yet
            last = e
        time.sleep(step)
    return None


def count(d, sel):
    return d.execute_script('return document.querySelectorAll(arguments[0]).length', sel)


def text(d, sel='body'):
    return d.execute_script('var e=document.querySelector(arguments[0]);return e?e.innerText.replace(/\\s+/g," "):""', sel)


def tap(d, sel, nth=0):
    els = d.find_elements(By.CSS_SELECTOR, sel)
    if len(els) <= nth:
        raise RuntimeError('no element for ' + sel)
    d.execute_script('arguments[0].scrollIntoView({block:"center"})', els[nth])
    time.sleep(0.3)
    els[nth].click()
    time.sleep(1.2)


def tap_text(d, sel, pattern):
    for el in d.find_elements(By.CSS_SELECTOR, sel):
        if pattern.lower() in (el.text or '').lower():
            d.execute_script('arguments[0].scrollIntoView({block:"center"})', el)
            time.sleep(0.3)
            el.click()
            time.sleep(1.2)
            return True
    return False


d = driver(390, 844)
try:
    d.get(URL)
    check('W1 captured banner is on screen', wait(d, lambda: count(d, '[data-capture-banner]') == 1) and 'CAPTURED DATA' in text(d, '[data-capture-banner]'))
    # the first-run Welcome appears once; a tap dismisses it
    if wait(d, lambda: count(d, '.v3-welcome') == 1, 45):
        tap_text(d, '.v3-welcome button', 'Explore without setup')
        check('W2 Welcome dismissed by a tap', count(d, '.v3-welcome') == 0)
    else:
        check('W2 Welcome shown on first visit', False)
    check('W3 Home: captured games and no sample strip', wait(d, lambda: count(d, '.v3-main a[data-tap="game"], .v3-main a[href*="/v3/game/"]') >= 3) and count(d, '.v3-demo') == 0)
    d.save_screenshot(OUT + '/W_home.png')
    tap(d, '[data-capture-about]')
    check('W4 About sheet opens from the banner', 'What is real' in (text(d, '[data-capture-sheet]') or '') or 'WHAT IS REAL' in (text(d, '[data-capture-sheet]') or '').upper())
    d.save_screenshot(OUT + '/W_about.png')
    tap_text(d, '[data-capture-sheet] button', 'Close')
    check('W5 About sheet closes', count(d, '[data-capture-sheet]') == 0)
    tap_text(d, '.v3-nav a', 'Games')
    check('W6 Games tab lists captured games', wait(d, lambda: count(d, '.v3-gc') >= 5))
    tap_text(d, '.v3-nav a', 'Explore')
    check('W7 Explore tab: Prop Discovery cards with cent prices', wait(d, lambda: count(d, '.pd-card') >= 1) and '¢' in text(d, '.pd-home'))
    d.save_screenshot(OUT + '/W_explore.png')
    tap(d, 'a.pd-seeall')
    check('W8 PD2: the list opens with rows', wait(d, lambda: count(d, '.pd-list .pd-row') >= 5))
    tap(d, '.pd-row a.pd-px[data-tap="price"]')
    check('W9 PD6: the exact-contract sheet opens', wait(d, lambda: count(d, '[role=dialog] [data-state="price"]') >= 1))
    d.save_screenshot(OUT + '/W_contract.png')
    d.back(); time.sleep(1)
    tap_text(d, '.v3-nav a', 'Home')
    wait(d, lambda: count(d, '.v3-main a[data-tap="game"], .v3-main a[href*="/v3/game/"]') >= 3)
    tap_text(d, 'a', 'Game Center')
    check('W10 Game Detail opens from Home', wait(d, lambda: count(d, '.v3-gd') >= 1))
    tap(d, 'a[data-tap="player"][data-dest*="prt_4c661ae8b854ff5f66dd"]')
    check('W11 P1: Player Research with the chart (ten bars, three lanes)', wait(d, lambda: count(d, '.v3p-hb__bar') >= 10) and count(d, '.x-trio > *') == 3)
    d.save_screenshot(OUT + '/W_player.png')
    d.back(); time.sleep(1.5)
    tap_text(d, '[role=tab]', 'Matchup')
    check('W12 G1: Matchup rows and the Lens', wait(d, lambda: count(d, '[data-testid=tug-rows] .mx-tug') >= 5) and count(d, '[data-testid=sift-lens]') == 1)
    d.save_screenshot(OUT + '/W_matchup.png')
    tap(d, 'a[data-tap="team"][data-dest="/v3/team/nfl/DAL"]')
    check('W13 TR1: Team Research opens (record, identity card)', wait(d, lambda: count(d, '.tm-hero .tm-rec') == 1) and count(d, '.tm-idt .idr') >= 4)
    tap(d, '.tm-idt .idbig .o[data-tap="stat"]')
    check('W14 SD1: ranking with the selected team card and dot plot', wait(d, lambda: count(d, '.st-selc') == 1) and count(d, '[data-dotplot] circle[data-role="sel"]') == 1)
    d.save_screenshot(OUT + '/W_stat.png')
    hosts = d.execute_script('return [...new Set(performance.getEntriesByType("resource").map(function(e){return new URL(e.name).host}))]')
    check('W15 only the local host was contacted', hosts == ['127.0.0.1:' + URL.split(':')[2].split('/')[0]] or set(h.split(':')[0] for h in hosts) <= {'127.0.0.1', 'localhost'}, hosts)
    check('W16 no horizontal scroll on the statistic screen', d.execute_script('return document.documentElement.scrollWidth <= innerWidth'))
finally:
    d.quit()

ok = sum(1 for _, c in R if c)
print('%d/%d WebKit checks passed' % (ok, len(R)))
sys.exit(0 if ok == len(R) else 1)
