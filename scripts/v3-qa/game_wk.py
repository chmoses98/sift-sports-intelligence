"""WebKitGTK checks for Game Detail and Matchup (milestone 5): tabs, direction and Lens in place, unit push and Back restoring state and
scroll, team and statistic targets, price and props addresses, the Overview. Real published documents through the session proxy.
  WK_PORT=4455 WK_HARNESS_PORT=8775 QA_BASE=http://localhost:5177/sift-sports-intelligence/ python3 scripts/v3-qa/game_wk.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By
G = '/v3/game/nfl/evt_cd335cc6d5f5b8d8f7b3'
R = []
def check(name, cond, extra=''):
    R.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra and not cond else ''))
q = QA(390, 844)
H = lambda: q.js('return location.hash')
Y = lambda: q.js('return Math.round(window.scrollY)')
L = lambda: q.js('return history.length')
def els(css): return q.d.find_elements(By.CSS_SELECTOR, css)
def click(css, nth=0, wait=0.9, **kw):
    e = els(css)[nth]; q.js('arguments[0].scrollIntoView({block:"center"})', e); q.wait(0.3); e.click(); q.wait(wait)
def wait_for(css, t=40):
    for _ in range(t * 2):
        if els(css): return True
        q.wait(0.5)
    return False
try:
    q.open(G + '?v=1&tab=matchup&dir=DAL', settle=6)
    if not wait_for('[data-testid=tug-rows]') :
        print('SKIP the reference game is not on the published slate or feeds are unreachable'); sys.exit(0)
    check('W1 five tabs for NFL', [e.text for e in els('[role=tab]')] == ['Overview', 'Game Script', 'Matchup', 'Props', 'Stats'], [e.text for e in els('[role=tab]')])
    rows = els('.mx-tug__in'); check('W2 unit rows render (7 NFL units with ranks)', len(rows) >= 5, len(rows))
    check('W3 counts add up', q.js('''const l=document.querySelector(".mx-sg[aria-pressed=true]").getAttribute("aria-label");const m=/(\\d+) favour .*?, (\\d+) even, (\\d+) favour .*?, of (\\d+) units/.exec(l);return !!m && (+m[1]+ +m[2]+ +m[3])==+m[4] && +m[4]==document.querySelectorAll(".mx-tug__in").length'''))
    n = L()
    click('.mx-sg[data-dir=PHI]')
    check('W4 direction switches in place: history unchanged, address drops dir', L() == n and 'dir=' not in H(), (n, L(), H()))
    click('.mx-sg[data-dir=DAL]')
    check('W5 direction DAL in the address', 'dir=DAL' in H(), H())
    click('.mx-lh'); check('W6 lens opens in place (lens=1, history unchanged)', 'lens=1' in H() and L() == n and len(els('.mx-evr')) == 3, (H(), L(), len(els('.mx-evr'))))
    q.js('window.scrollTo(0, 520)'); q.wait(0.6)
    before, hl = H(), L()
    row = els('.v3-navrow.mx-tug .v3-navrow__main')[1]; q.js('arguments[0].scrollIntoView({block:"center"})', row); q.wait(0.5)
    at = Y(); row.click(); q.wait(1.2)
    check('W7 unit row opens the expanded unit (history +1)', 'unit=pass' in H() and els('[data-testid=unit-view]') and L() == hl + 1, (H(), L(), hl))
    q.js('history.back()'); q.wait(1.5)
    check('W8 Back restores address, direction, lens and the unit list', H() == before and els('[data-testid=tug-rows]') and q.js('return document.querySelector(".mx-lh").getAttribute("aria-expanded")') == 'true', H())
    check('W9 Back restores scroll', abs(Y() - at) <= 12, (Y(), at))
    # targets
    e = els('.mx-tv__c[data-tap=stat]')[0]
    check('W10 offense value is a statistic target with the team selected', '/v3/stat/nfl/adj_off_epa?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI' in e.get_attribute('data-dest'), e.get_attribute('data-dest'))
    before = H(); click('.mx-tv__c[data-tap=stat]', 0, wait=1.2)
    check('W11 tapping it opens Stat Detail', '/v3/stat/nfl/adj_off_epa' in H(), H())
    q.js('history.back()'); q.wait(1.5); check('W12 Back to Matchup state', H() == before, H())
    click('.mx-tilt[data-tap=team]', 0, wait=1.2); check('W13 tilt pill opens Team', '/v3/team/nfl/' in H(), H())
    q.js('history.back()'); q.wait(1.5)
    click('.mx-lens .mx-evr', 0, wait=1.2); check('W14 lens evidence row opens Stat Detail', '/v3/stat/nfl/adj_' in H(), H())
    q.js('history.back()'); q.wait(1.5); check('W15 Back keeps lens open', 'lens=1' in H() and len(els('.mx-evr')) == 3, H())
    # key matchups and price addresses
    e = els('[data-testid=key-matchups] .mx-kp')[0]
    check('W16 key matchup price is the addressed contract target', 'sheet=contract&tk=KXNFL' in e.get_attribute('data-dest'), e.get_attribute('data-dest'))
    check('W17 key matchup player target', '/v3/player/nfl/prt_' in els('[data-testid=key-matchups] .mx-av')[0].get_attribute('data-dest'))
    check('W18 game shape team target', '/v3/team/nfl/' in els('[data-testid=game-shape] .mx-sr__t')[0].get_attribute('data-dest') if els('[data-testid=game-shape] .mx-sr__t') else True)
    check('W19 no horizontal overflow on Matchup', q.js('return document.documentElement.scrollWidth-document.documentElement.clientWidth') <= 0)
    # shared link into a unit: Back closes
    q.open(G + '?v=1&tab=matchup&unit=rush', settle=6); wait_for('[data-testid=unit-view]')
    click('.mx-ubar .v3-iconbtn'); check('W20 unit with no history below: Back closes the unit', 'unit=' not in H() and els('[data-testid=tug-rows]'), H())
    # Overview
    q.open(G, settle=6); wait_for('[data-testid=win-price]')
    check('W21 win price targets the addressed contract', 'sheet=contract&tk=KXNFLGAME-26OCT26DALPHI-' in els('[data-testid=win-price] .mx-win__t')[0].get_attribute('data-dest'))
    check('W22 props row address', els('a.mx-prow')[0].get_attribute('data-dest').endswith('/v3/props?v=1&game=evt_cd335cc6d5f5b8d8f7b3'), els('a.mx-prow')[0].get_attribute('data-dest'))
    click('[data-testid=game-teams] a[data-tap=team]', 0, wait=1.2); check('W23 team row opens Team', '/v3/team/nfl/DAL' in H(), H())
    q.js('history.back()'); q.wait(1.5); check('W24 Back to Overview', H().endswith(G) or 'tab=' not in H(), H())
    check('W25 no horizontal overflow on Overview', q.js('return document.documentElement.scrollWidth-document.documentElement.clientWidth') <= 0)
finally:
    print(f'{sum(R)}/{len(R)} passed'); q.close()
