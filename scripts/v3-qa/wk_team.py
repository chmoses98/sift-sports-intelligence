"""WebKit (WebKitGTK) check of the Team Research critical paths on real published documents: in-place state replaces history,
Back restores tab / Raw-Adjusted / window / expanded rows / scroll, hockey shows only the published tabs, nothing overflows."""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By
R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(extra) if extra and not cond else ''))
q = QA(390, 844)
def H(): return q.js('return location.hash')
def Y(): return q.js('return Math.round(scrollY)')
def count(css): return q.js('return document.querySelectorAll(arguments[0]).length', css)
def wait_for(css, t=40):
    for _ in range(t * 2):
        if count(css): return True
        q.wait(0.5)
    return False
def click(css, nth=0, wait=1.0):
    els = q.d.find_elements(By.CSS_SELECTOR, css)
    if len(els) <= nth: raise RuntimeError('no element ' + css)
    q.js('arguments[0].scrollIntoView({block:"center"})', els[nth]); q.wait(0.4)
    els[nth].click(); q.wait(wait)
def btn(label, group=None):
    scope = f'[aria-label="{group}"] ' if group else ''
    for b in q.d.find_elements(By.CSS_SELECTOR, scope + 'button'):
        if b.text.strip() == label: return b
    raise RuntimeError('no button ' + label)
try:
    # Overview
    q.open('/v3/team/nfl/DAL', settle=6)
    check('W1 Overview renders real identity card', wait_for('.tm-idt .idr'))
    check('W2 five tabs on football', count('.tm-tabs [role=tab], .tm [role=tab]') == 5, count('[role=tab]'))
    h0 = q.js('return history.length')
    btn('Raw', 'Statistic basis').click(); q.wait(0.8)
    check('W3 Raw switch is in the address', 'adj=0' in H(), H())
    check('W4 Raw switch adds no history', q.js('return history.length') == h0)
    # Profile: window, scroll, stat tap, Back
    q.open('/v3/team/nfl/DAL?tab=profile&adj=0&win=L6&all=1', settle=6)
    check('W6 Profile rows render', wait_for('.tm .prr'))
    n = count('.tm .prr'); url = H()
    click('.tm .prr[data-tap="stat"]', 5); 
    check('W7 row opens Stat Detail with this team selected', '/v3/stat/nfl/rnk_' in H() and 'sel=DAL' in H(), H())
    q.js('history.back()'); q.wait(1.8)
    check('W8 Back restores the Profile address (tab, basis, window, expanded list)', H() == url, H())
    check('W9 Back restores the expanded list', count('.tm .prr') == n, count('.tm .prr'))
    # scroll restore
    el = q.d.find_elements(By.CSS_SELECTOR, '.tm .prr[data-tap="stat"]')[8]
    q.js('arguments[0].scrollIntoView({block:"center"})', el); q.wait(0.6); at = Y()
    el.click(); q.wait(1.0)
    q.js('history.back()'); q.wait(2.0)
    check('W10 Back restores scroll', abs(Y() - at) <= 40, (at, Y()))
    # Form: show all in place
    q.open('/v3/team/nhl/TOR?tab=form', settle=6)
    check('W11 hockey Form results render', wait_for('.tm .res'))
    check('W12 hockey shows only Overview and Form', count('[role=tab]') == 2, count('[role=tab]'))
    six = count('.tm .res')
    for b in q.d.find_elements(By.CSS_SELECTOR, 'button'):
        if b.text.startswith('Show all'): q.js('arguments[0].scrollIntoView({block:"center"})', b); q.wait(0.3); b.click(); break
    q.wait(0.8)
    check('W13 show all is in the address and expands in place', 'all=1' in H() and count('.tm .res') > six, (six, count('.tm .res'), H()))
    url = H(); m = count('.tm .res')
    click('.tm .res > a[data-tap="game"]', 8)
    check('W14 result opens the completed game', '/v3/game/nhl/' in H(), H())
    q.js('history.back()'); q.wait(1.8)
    check('W15 Back restores the expanded results', H() == url and count('.tm .res') == m, (H(), count('.tm .res')))
    # Schedule
    q.open('/v3/team/nfl/DAL?tab=schedule', settle=6)
    check('W16 Schedule rows with opponent percentiles', wait_for('.tm .sch .op.o[data-tap="stat"]'))
    click('.tm .sch .op.o[data-tap="stat"]', 0)
    check('W17 pill opens the opponent ranking', '/v3/stat/nfl/rnk_' in H() and 'sel=' in H() and 'sel=DAL' not in H(), H())
    q.js('history.back()'); q.wait(1.8)
    check('W18 Back to Schedule', 'tab=schedule' in H(), H())
    # Players: expanded note survives Back
    q.open('/v3/team/nfl/DAL?tab=players', settle=6)
    check('W19 Players render', wait_for('.tm .plr'))
    for b in q.d.find_elements(By.CSS_SELECTOR, 'button'):
        if b.text.strip().startswith('Why'): q.js('arguments[0].scrollIntoView({block:"center"})', b); q.wait(0.3); b.click(); break
    q.wait(0.8)
    check('W20 Why expands in place and is in the address', 'exp=ol' in H() and count('.x-lock') == 1, H())
    url = H()
    click('.tm .plr > a[data-tap="player"]', 0)
    check('W21 player row opens Player Research', '/v3/player/nfl/' in H(), H())
    q.js('history.back()'); q.wait(1.8)
    check('W22 Back keeps the expansion', H() == url and count('.x-lock') == 1, H())
    # no overflow on every tab at 375
    for path in ['/v3/team/nfl/DAL', '/v3/team/nfl/DAL?tab=profile', '/v3/team/nfl/DAL?tab=form', '/v3/team/nfl/DAL?tab=schedule', '/v3/team/nfl/DAL?tab=players', '/v3/team/nhl/TOR']:
        q.open(path, settle=5, w=375, h=667)
        wait_for('.tm-body, .tm-idt')
        q.wait(2)
        over = q.js('return document.documentElement.scrollWidth - innerWidth')
        check(f'W23 no overflow at 375: {path}', over <= 0, over)
finally:
    q.d.quit()
bad = [r for r in R if not r[1]]
print(f'{len(R) - len(bad)}/{len(R)} passed')
sys.exit(1 if bad else 0)
