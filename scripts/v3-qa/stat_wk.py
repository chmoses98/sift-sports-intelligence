"""WebKit (WebKitGTK) critical paths for Stat Detail and League Rankings, on REAL published documents (the browser reaches the
published feeds through the session proxy, see start_driver.sh). Needs: start_driver.sh, `python3 -m http.server 8765` in
scripts/v3-qa, the dev server (QA_BASE=http://localhost:5174/sift-sports-intelligence/).
  python3 scripts/v3-qa/stat_wk.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By

R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' - ' + str(extra) if extra and not cond else ''))

ADJ = '/v3/stat/nfl/adj_off_epa'
LAMB, PICKENS = 'prt_4c661ae8b854ff5f66dd', 'prt_74580802ab4833992610'
q = None

def H(): return q.js('return location.hash.replace(/^#/, "")')
def Y(): return q.js('return Math.round(scrollY)')
def count(css): return q.js('return document.querySelectorAll(arguments[0]).length', css)
def text(css): return q.js('var e=document.querySelector(arguments[0]); return e ? e.innerText : ""', css)
def els(css): return q.d.find_elements(By.CSS_SELECTOR, css)
def click(css, nth=0, wait=1.0, center=True):
    e = els(css)
    if not e: raise RuntimeError('no element ' + css)
    if center: q.js('arguments[0].scrollIntoView({block:"center"})', e[nth]); q.wait(0.3)
    e[nth].click(); q.wait(wait)
def js_click(css, nth=0, wait=1.0):
    q.js('arguments[0].click()', els(css)[nth]); q.wait(wait)
def until(css, tries=40):
    for _ in range(tries):
        if count(css): return True
        q.wait(0.5)
    return False
def sheet(): return q.js('return !!document.querySelector(".v3-sheet")')
def overflow(): return q.js('return document.documentElement.scrollWidth - document.documentElement.clientWidth')

try:
    q = QA(390, 844)
    # ---------- 1. Ranking: selected card, outlines, in-place highlight
    q.open(f'{ADJ}?v=1&sel=DAL&opp=PHI', settle=4)
    check('W1 ranking loads real data', until('.st-selc'))
    t = text('.st-selc')
    check('W2 selected card: 5th of 28 teams, +0.048', '5th' in t and 'of 28 teams' in t and '+0.048' in t, t)
    check('W3 selected and next-opponent rows outlined', count('.st-rkr.is-sel') == 1 and count('.st-rkr.is-opp') == 1)
    check('W4 dot plot has the selected and dashed dots', count('[data-dotplot] circle[data-role="sel"]') == 1 and count('[data-dotplot] circle[data-role="opp"]') == 1)
    n0 = q.js('return history.length')
    js_click('.st-rkr button.bw', 1)  # Lions bar
    check('W5 bar tap moves the highlight in place (sel in address, history length unchanged)', 'sel=DET' in H() and q.js('return history.length') == n0, (H(), n0, q.js('return history.length')))
    check('W6 selected card follows', '2nd' in text('.st-selc'), text('.st-selc'))

    # ---------- 2. Team identity opens Team, Back restores the state and scroll
    click('.st-more')
    check('W7 Show all expands in place', count('.st-rkr') == 28 and 'all=1' in H(), (count('.st-rkr'), H()))
    q.js('window.scrollTo(0, 700)'); q.wait(0.6)
    h0, y0 = H(), Y()
    js_click('.st-rkr a.nm', 15, wait=1.6)
    check('W8 team name opens Team Research', '/v3/team/nfl/' in H(), H())
    q.js('history.back()'); q.wait(2.0)
    check('W9 Back restores address (all=1, sel)', H() == h0, (h0, H()))
    check('W10 Back restores scroll', abs(Y() - y0) < 40, (y0, Y()))
    check('W11 Back keeps all 28 rows', count('.st-rkr') == 28)

    # ---------- 3. Raw switch opens the counterpart ranking keeping the selection
    q.open(f'{ADJ}?v=1&sel=DAL&opp=PHI', settle=4); until('.st-selc')
    click('.st-segc a')
    check('W12 raw switch opens off_epa_play with the selection kept', '/v3/stat/nfl/off_epa_play' in H() and 'sel=DAL' in H(), H())
    until('.st-selc'); check('W13 raw ranking shows DAL 6th', '6th' in text('.st-selc'), text('.st-selc'))
    q.js('history.back()'); q.wait(1.5); until('.st-selc')
    check('W14 Back returns to the adjusted ranking', '/v3/stat/nfl/adj_off_epa' in H() and 'Adjusted' in text('.st-hd h1'), (H(), text('.st-hd h1')))

    # ---------- 4. Trend: bar selection in place, Game Detail and back
    q.open('/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL', settle=4)
    check('W15 Trend draws 12 bars', until('.st-obs svg [data-obs]') and count('.st-obs svg [data-obs]') == 12, count('.st-obs svg [data-obs]'))
    n0 = q.js('return history.length')
    click('.st-obs svg [data-obs="8"] rect', 1, wait=0.8)  # SVG elements have no .click(): a real (WebDriver) tap on the bar (the hit area sits under it; the page-level handler is the same)
    check('W16 bar tap selects an observation in place', 'obs=' in H() and q.js('return history.length') == n0, (H(), n0))
    h0 = H()
    click('.st-obc a[data-tap="game"]', wait=1.8)
    check('W17 Game Detail opens a completed game', '/v3/game/nfl/evt_' in H(), H())
    q.js('history.back()'); q.wait(2.0)
    check('W18 Back restores Trend with the selected bar', H() == h0 and count('.st-obs [data-obs][data-on="true"]') == 1 and count('.st-olr.is-on') == 1, (h0, H()))
    # the observation list: a labelled list of the same observations, a row selects the same observation in place (history replaced), the result link opens the game
    check('W18a Trend lists the 12 observations as a labelled list with 44 pt rows', count('[data-obs-list] ul[aria-label] > li') == 12 and q.js('return Array.from(document.querySelectorAll(".st-olr")).every(function(r){return r.getBoundingClientRect().height >= 43.5})'), count('[data-obs-list] li'))
    n1 = q.js('return history.length')
    click('[data-obs-row] .st-olr__sel', 4, wait=0.8)
    check('W18b a list row selects that observation in place (obs= in the address, history replaced)', q.js('return history.length') == n1 and 'obs=' in H() and count('.st-obs [data-obs="7"][data-on="true"]') == 1 and count('.st-olr.is-on') == 1, (H(), q.js('return history.length'), n1))
    click('[data-obs-row] a[data-tap="game"]', 4, wait=1.8)
    check('W18c the row\'s result link opens that completed game', '/v3/game/nfl/evt_' in H(), H())
    q.js('history.back()'); q.wait(2.0)
    check('W18d Back restores the row-selected observation', 'obs=' in H() and count('.st-olr.is-on') == 1 and count('.st-obs [data-obs="7"][data-on="true"]') == 1, H())

    # ---------- 5. Compare: sheet closes on pick, picks in the address
    q.open(f'{ADJ}?v=1&tab=compare&sel=DAL&opp=PHI', settle=4)
    check('W19 Compare lists 8 rows', until('.st-cr') and count('.st-cr') == 8, count('.st-cr'))
    click('.st-wc .x', 1)  # remove PHI
    check('W20 removing a team writes b=- in the address', 'b=-' in H(), H())
    click('.st-wc--add'); q.wait(0.8)
    check('W21 the team chooser opens as a sheet', sheet())
    click('.st-pick [role="option"]', 3, wait=1.2, center=False) if count('.st-pick [role="option"]') > 3 else None
    check('W22 picking closes the sheet and lands in the address', not sheet() and 'b=' in H() and 'b=-' not in H(), H())
    q.js('history.back()'); q.wait(1.5)
    check('W23 Back leaves the screen (no ghost sheet entry)', '/v3/stat/nfl/adj_off_epa' not in H() or 'tab=compare' not in H(), H())

    # ---------- 6. About expansion survives a team tap and Back
    q.open(f'{ADJ}?v=1&tab=about&sel=DAL&opp=PHI', settle=4); until('.st-lim')
    click('.st-lim .st-more')
    check('W24 About expands in place (more=1)', 'more=1' in H() and count('.st-li .clamp') == 0, H())
    h0, y0 = H(), Y()
    js_click('.st-rel2 a[data-tap="team"]', wait=1.6)
    check('W25 team chip opens Team', '/v3/team/nfl/DAL' in H(), H())
    q.js('history.back()'); q.wait(2.0)
    check('W26 Back restores About expanded and scroll', H() == h0 and count('.st-li .clamp') == 0 and abs(Y() - y0) < 40, (h0, H(), y0, Y()))

    # ---------- 7. Compare players
    q.open(f'{ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a={LAMB}&b={PICKENS}&cs=receptions&thr=5', settle=4)
    check('W27 players: two bar charts and the locked rank row', until('.st-pbars') and count('.st-pbars') == 2 and 'not published' in text('.st-olc'), text('.st-olc'))
    click('.st-step', 1)
    check('W28 threshold steps in place', 'thr=6' in H(), H())

    # ---------- 8. Hockey
    q.open('/v3/stat/nhl/pp_pct?v=1&sel=TOR&opp=CGY', settle=4)
    check('W29 hockey ranking: TOR 5th of 32, 30.2%', until('.st-selc') and 'of 32 teams' in text('.st-selc') and '30.2%' in text('.st-selc'), text('.st-selc'))

    # ---------- 9. No horizontal overflow on every tab at both widths
    q.close()
    for (w, h) in [(390, 844), (375, 667)]:
        q = QA(w, h)
        for r in [f'{ADJ}?v=1&sel=DAL&opp=PHI&all=1', f'{ADJ}?v=1&sbs=1&sel=DAL', '/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL', f'{ADJ}?v=1&tab=compare&sel=DAL&opp=PHI',
                  f'{ADJ}?v=1&tab=compare&sel=DAL&opp=PHI&cmpm=players&a={LAMB}&b={PICKENS}', f'{ADJ}?v=1&tab=about&sel=DAL&opp=PHI&more=1', '/v3/stat/nhl/pp_pct?v=1&sel=TOR&opp=CGY']:
            q.open(r, settle=4); q.wait(2.0)
            check(f'W30 no horizontal overflow at {w}: {r[:48]}', overflow() <= 0, overflow())
        q.close()
finally:
    try: q.close()
    except Exception: pass

ok = sum(1 for _, c, _ in R if c)
print(f'{ok}/{len(R)} passed')
sys.exit(0 if ok == len(R) else 1)
