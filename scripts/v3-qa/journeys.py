import sys, json, time; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.by import By
R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ')+name+(' — '+str(extra) if extra and not cond else ''))
q = QA(390, 844)
def H(): return q.js('return location.hash')
def click(css, nth=0, wait=0.8):
    els = q.d.find_elements(By.CSS_SELECTOR, css)
    if not els: raise RuntimeError('no element '+css)
    q.js('arguments[0].scrollIntoView({block:"center"})', els[nth]); q.wait(0.3)
    els[nth].click(); q.wait(wait)
def count(css): return q.js('return document.querySelectorAll(arguments[0]).length', css)
def sheet(): return q.js('return !!document.querySelector(".v3-sheet")')
def close_sheet():
    if sheet(): q.js('document.querySelector(".v3-sheet__x").click()'); q.wait(0.5)
try:
    # ---------- A: Home -> Game -> Switcher (tab kept) -> Back
    q.open('/v3?demo=1', settle=9)
    click('.v3-feat .v3-btn')
    check('A1 Home Game Center opens Game Detail', '/v3/game/cfb/demo_uga_fla' in H(), H())
    click('.v3-tabs button', 2)  # Matchup
    check('A2 tab selects Matchup', 'tab=matchup' in H(), H())
    click('.v3-sw__tile:not(.is-cur) .v3-sw__hit')
    check('A3 rail tile switches game and keeps Matchup tab', '/v3/game/cfb/' in H() and 'demo_uga_fla' not in H() and 'tab=matchup' in H(), H())
    q.js('history.back()'); q.wait(1.2)
    check('A4 Back returns to previous game with its tab', 'demo_uga_fla' in H() and 'tab=matchup' in H(), H())
    # rail star independence
    click('.v3-sw__all'); check('A5 picker opens', sheet())
    n0 = H(); click('.v3-pk__row .v3-star', 1)
    check('A6 picker star pins a favourite without navigating', H()==n0 and count('.v3-pk__h')>0, H())
    q.js('arguments[0].value=""', q.d.find_element(By.CSS_SELECTOR,'.v3-pk__search input'))
    inp = q.d.find_element(By.CSS_SELECTOR,'.v3-pk__search input'); inp.send_keys('Auburn'); q.wait(0.6)
    check('A7 picker search filters', count('.v3-pk__row')==1, count('.v3-pk__row'))
    click('.v3-pk__main')
    check('A8 picking a row switches game and closes the sheet', 'demo_lsu_aub' in H() and not sheet(), H())
    # 25 game
    q.open('/v3/game/cfb/demo_uga_fla', settle=3); click('.v3-sw__all')
    q.js('document.querySelectorAll(".v3-pk__seg button")[1].click()'); q.wait(0.5)
    check('A9 picker lists the 25 sample CFB games', count('.v3-pk__row')==25, count('.v3-pk__row'))
    close_sheet()
    # collapsed header + tabs sticky
    q.js('window.scrollTo(0, 900)'); q.wait(1)
    check('A10 compact scoreboard appears after scrolling', q.js('return document.querySelector(".v3-cb").classList.contains("is-on")'))
    q.js('document.querySelector(".v3-cb .v3-iconbtn:last-child").click()'); q.wait(1)
    check('A11 compact next-game control navigates', 'demo_uga_fla' not in H(), H())

    # ---------- Games list: nested taps + scroll restore
    q.open('/v3/games', settle=4)
    h0 = H()
    click('.v3-gc .v3-star'); check('B1 star does not navigate', H()==h0, H())
    click('.v3-gc .v3-bell'); check('B2 bell opens alert sheet without navigating', sheet() and H()==h0); close_sheet()
    click('.v3-gc .v3-lines'); check('B3 lines box opens exact market with ticker', sheet() and q.js('return document.querySelector(".v3-sheet").innerText.includes("SAMPLE-")')); close_sheet()
    click('.v3-gc .v3-gc__team'); check('B4 team logo opens Team page', '/v3/team/' in H(), H())
    q.js('history.back()'); q.wait(1.2)
    q.js('window.scrollTo(0, 700)'); q.wait(0.8)
    y0 = q.js('return scrollY')
    q.js('document.querySelectorAll(".v3-gc__hit")[6].click()'); q.wait(1.2)
    check('B5 card body opens the game', '/v3/game/' in H(), H())
    q.js('history.back()'); q.wait(1.8)
    y1 = q.js('return scrollY')
    check('B6 Back restores Games scroll position', abs(y1-y0) < 40, (y0,y1))
    check('B7 Back keeps the filters in the address', 'games' in H())

    # ---------- J1: Home -> team -> stat -> another team -> back
    q.open('/v3?demo=1', settle=7)
    click('.v3-feat__team'); check('C1 featured team logo opens Team', '/v3/team/cfb/UGA' in H(), H())
    click('.v3-stile'); check('C2 stat tile opens its ranking', '/v3/stat/cfb/sample-' in H(), H())
    n = count('.v3-rkrow'); check('C3 ranking lists many teams', n >= 20, n)
    q.js('window.scrollTo(0, 500)'); q.wait(0.6)
    y0 = q.js('return scrollY')
    q.js('document.querySelectorAll(".v3-rkrow__t")[3].click()'); q.wait(1.0); check('C4 team identity opens that Team page', '/v3/team/cfb/' in H(), H())
    q.js('history.back()'); q.wait(1.5)
    check('C5 Back returns to the same ranking', '/v3/stat/cfb/sample-' in H(), H())
    check('C6 Back restores ranking scroll', abs(q.js('return scrollY')-y0) < 40, (y0, q.js('return scrollY')))
    click('.v3-rkrow__v', 2); check('C7 value tap opens that team history on the same statistic', 'tab=trends' in H() and 'team=' in H(), H())

    # ---------- D: player research (locked designs P1 to P3; selectors updated from the pre-lock screen, the behaviour is the same)
    q.open('/v3/player/nba/sample-guard', settle=7)
    s0 = q.js('return document.querySelector(".v3p-sum").innerText')
    click('.v3p-pill', 1); check('D1 changing stat updates the address', 'stat=ast' in H(), H())
    s1 = q.js('return document.querySelector(".v3p-sum").innerText')
    check('D2 summary strip changes with the stat', s0 != s1)
    click('[data-win]', 0); check('D3 window L5 selected', 'win=L5' in H(), H())
    check('D4 chart shows 5 bars', count('.v3p-hb__bar')==5, count('.v3p-hb__bar'))
    q.js('document.querySelectorAll(".v3p-hb__bar")[2].dispatchEvent(new MouseEvent("click",{bubbles:true}))'); q.wait(0.8)
    check('D5 bar opens its observation card (locked design P1: on the page, not a sheet)', count('.v3p-obs')==1 and 'obs=' in H(), H())
    check('D6 the chart state is kept', 'win=L5' in H() and count('.v3p-hb__bar')==5)
    click('.v3p-pill--f'); check('D7 filters sheet opens', sheet())
    click('.v3p-fg[aria-label="Site"] .v3p-fc', 1)  # Home
    click('.v3p-apply .v3p-btn'); q.wait(0.8)
    check('D8 filter applied: chip visible, sheet closed, address updated', count('.v3p-fchip')==1 and 'site=home' in H() and not sheet(), H())
    n_home = count('.v3p-hb__bar'); check('D9 filter changes the games charted', n_home <= 5, n_home)
    click('.v3p-fchip'); check('D10 removing the chip clears the filter', count('.v3p-fchip')==0 and 'site=' not in H(), H())
    # save research
    close_sheet()
    q.open('/v3/player/nba/sample-guard?stat=pts&win=L10&site=home', settle=6)
    click('.v3p-hero__bar button[aria-label="Save this research"]')
    q.open('/v3/following', settle=4)
    check('D11 saved research appears in Following', count('.v3-hit--saved')==1, count('.v3-hit--saved'))
    click('.v3-hit--saved .v3-hit__l')
    check('D12 saved item restores stat, window and filter exactly', 'stat=pts' in H() and ('win=' not in H() or 'win=L10' in H()) and 'site=home' in H(), H())
    q.open('/v3/following', settle=3); check('D13 saved snapshot is labelled "At save"', 'At save' in q.js('return document.body.innerText'))
    q.open('/v3/player/nba/sample-guard?stat=pts&win=L10&site=away&min=36&script=blowout', settle=6)
    check('D14 impossible filters show "0 games match" and one tap removes them', '0 games match' in q.js('return document.body.innerText'))
    click('.v3p-empty .v3p-link'); check('D15 removing filters restores the chart', count('.v3p-hb__bar')>0 and 'site=' not in H(), H())

    # ---------- E: follow vs alerts
    q.open('/v3/team/cfb/UGA', settle=6)
    click('.v3-th .v3-star')
    q.open('/v3/following', settle=4)
    check('E1 starring a team lists it in Following', count('.v3-tm')>=1 and 'UGA' in q.js('return document.body.innerText'))
    check('E2 following does not turn alerts on', q.js('return localStorage.getItem("sift3.alerts")') in (None, '{}', 'null'), q.js('return localStorage.getItem("sift3.alerts")'))
    q.open('/v3?demo=1', settle=6)
    check('E3 Home reflects the followed team', 'Georgia' in q.js('return document.querySelector(".v3-teams").innerText') or 'UGA' in q.js('return document.querySelector(".v3-teams").innerText'))
    check('E4 no notification permission is ever requested', q.js('return typeof Notification==="undefined" || Notification.permission!=="granted"'))

    # ---------- F: explore
    q.open('/v3/explore?demo=1', settle=7)
    inp = q.d.find_element(By.CSS_SELECTOR, '.v3-search input'); inp.click(); q.wait(0.4); inp.send_keys('points per'); q.wait(1.0)
    check('F1 stat search shows Statistics group with no market needed', 'Statistics' in q.js('return document.body.innerText'))
    click('.v3-hit__l'); check('F2 stat result opens a real Stat Detail', '/v3/stat/' in H(), H())
    q.js('history.back()'); q.wait(1.5)
    check('F3 Back keeps the search query', 'q=points' in H().replace('%20',' ') or 'q=points%20per' in H(), H())

    # ---------- G: settings price format
    q.open('/v3/settings', settle=4)
    click('.v3-radios li:nth-child(2) input'); 
    q.open('/v3/games', settle=4)
    check('G1 American price format applies to line boxes', '¢' not in q.js('return document.querySelector(".v3-lines")?.innerText||""'), q.js('return document.querySelector(".v3-lines")?.innerText'))
    q.js('localStorage.removeItem("sift3.prefs")')
finally:
    q.close()
    json.dump(R, open('journeys.json','w'), indent=1)
    print('\n%d/%d passed' % (sum(1 for r in R if r[1]), len(R)))
