"""Verify a HOSTED SIFT 3.0 preview (start page, sample mode, real-data mode, feed outage) in WebKit.
   QA_BASE=http://127.0.0.1:8766/sift3-preview/app.html python3 scripts/v3-qa/preview_check.py http://127.0.0.1:8766/sift3-preview/ OUTDIR"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from wk import driver
ROOT = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), str(extra))); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' — ' + str(extra)))

# ---------- 1. start page, loaded directly (not in the harness): it is what the phone opens first
d = driver(390, 844)
try:
    d.get(ROOT); time.sleep(14)
    txt = d.execute_script('return document.body.innerText')
    check('S1 start page offers sample and real data as separate links', 'Open with sample data' in txt and 'Open with real data' in txt)
    hrefs = d.execute_script('return [...document.querySelectorAll("a.mode")].map(a=>a.getAttribute("href"))')
    check('S2 links are explicit about the data mode', hrefs == ['app.html#/v3?demo=1', 'app.html#/v3?demo=0'], hrefs)
    check('S3 commit id is shown', len(d.execute_script('return document.querySelector("code").textContent')) == 40)
    f1, f2 = d.execute_script('return [document.getElementById("f1").textContent, document.getElementById("f2").textContent]')
    check('S4 feed check from this address: research registry reachable', 'reachable' in f1 and 'unreachable' not in f1, f1)
    check('S5 feed check from this address: NFL publication reachable', 'reachable' in f2 and 'unreachable' not in f2, f2)
    check('S6 start page has no horizontal scroll', d.execute_script('return document.documentElement.scrollWidth <= innerWidth'))
    d.save_screenshot(OUT + '/start.png')
finally:
    d.quit()

HOSTS = 'return [...new Set(performance.getEntriesByType("resource").map(e=>new URL(e.name).host))]'
BADIMG = 'return [...document.images].filter(i=>i.complete && i.naturalWidth===0).map(i=>i.src)'
q = QA(390, 844)
try:
    # ---------- 2. sample mode from the hosted address
    q.open('/v3?demo=1', settle=9)
    t = q.js('return document.body.innerText')
    check('M1 sample mode shows the SAMPLE DATA strip', 'SAMPLE DATA' in t)
    check('M2 four tabs only', q.js('return document.querySelectorAll(".v3-nav a, nav a").length') == 4, q.js('return document.querySelectorAll(".v3-nav a, nav a").length'))
    for route in ['/v3?demo=1', '/v3/games', '/v3/game/cfb/demo_uga_fla', '/v3/team/cfb/UGA', '/v3/stat/nfl/sample-0', '/v3/player/nba/sample-guard', '/v3/explore', '/v3/following', '/v3/settings']:
        q.open(route, settle=4)
        hosts = q.js(HOSTS); bad = q.js(BADIMG)
        check(f'M3 sample {route}: only this host is contacted, no broken image', hosts == [hosts[0]] and not bad and 'SAMPLE DATA' in q.js('return document.body.innerText'), (hosts, bad[:3]))
        check(f'M4 sample {route}: no horizontal overflow', q.js('return document.documentElement.scrollWidth <= innerWidth'))
    fonts = q.js('return [document.fonts.check("16px Geist"), document.fonts.check("700 40px Sora")]')
    check('M5 Geist and Sora load from the bundle', fonts == [True, True], fonts)
    q.open('/v3/settings', settle=3)
    check('M6 Settings shows build id and sample mode', 'v3-preview' in q.js('return document.body.innerText') and 'sample data' in q.js('return document.body.innerText'))

    # ---------- 3. real data from the hosted address
    q.open('/v3?demo=0', settle=2)
    q.js('localStorage.setItem("sift3.prefs", JSON.stringify({priceFormat:"cents",reduceMotion:false,textScale:"default",onboarded:true}))')
    q.open('/v3?demo=0', settle=18)
    t = q.js('return document.body.innerText')
    check('R1 real mode: no SAMPLE DATA strip, no sample tickers', 'SAMPLE DATA' not in t and 'SAMPLE-' not in t)
    hosts = q.js(HOSTS)
    check('R2 real mode contacts the published research host', any('raw.githubusercontent.com' in h for h in hosts), hosts)
    q.shot(OUT + '/real_home.png')
    q.open('/v3/games?demo=0', settle=14)
    cards = q.js('return document.querySelectorAll(".v3-gc").length')
    check('R3 real Games lists published games', cards > 0, cards)
    q.shot(OUT + '/real_games.png')
    clash = q.js('return [...document.querySelectorAll(".v3-gc")].filter(c=>{const l=c.querySelector(".v3-lines, .v3-gc__nolines, [class*=lines]");return l && [...c.querySelectorAll(".v3-gc__nm")].some(n=>n.getBoundingClientRect().right>l.getBoundingClientRect().left+1)}).length')
    check('R3b real Games: no team name runs under the lines box', clash == 0, clash)
    q.open('/v3/games?sport=nfl&demo=0', settle=12)
    q.js('document.querySelector(".v3-gc__hit")?.click()')
    q.wait(8)
    h = q.js('return location.hash')
    check('R4 real: a card opens a real Game Detail', '/v3/game/nfl/' in h, h)
    t = q.js('return document.body.innerText')
    check('R5 real Game Detail has no sample content', 'SAMPLE DATA' not in t and 'SAMPLE-' not in t and 'Sample' not in t, '')
    check('R5b real Game Detail renders its hero and tabs', q.js('return !!document.querySelector(".v3-gh") && document.querySelectorAll(".v3-tabs button").length >= 3'))
    nfl_hash = q.js('return location.hash')
    for tab in ['props', 'matchup']:
        q.open(nfl_hash.replace('#', '').split('?')[0] + '?tab=' + tab, settle=9)
        check(f'R5c real Game Detail tab {tab} renders without sample content', q.js('return !!document.querySelector(".v3-gd__body")') and 'SAMPLE-' not in q.js('return document.body.innerText'))
    q.shot(OUT + '/real_game.png')
    q.open('/v3/settings', settle=3)
    check('R6 Settings says real published data', 'Showing real published data' in q.js('return document.body.innerText'))
    bad = q.js(BADIMG)
    check('R7 no broken images in real mode', not bad, bad[:3])
    # real score-source labelling on the live-state list
    q.open('/v3/games?state=live&demo=0', settle=12)
    t = q.js('return document.body.innerText')
    check('R8 real score-source note present when games are in play (or none live)', ('licensed score feed' in t) or q.js('return document.querySelectorAll(".v3-gc").length') == 0, t[:200])
    q.shot(OUT + '/real_live.png')
    # ---------- 4. feed outage from a copy of the app whose fetches to the research/score hosts fail
    import re
    app = open(os.environ['PREVIEW_DIR'] + '/app.html').read()
    inject = '<script>(function(){var f=window.fetch;window.fetch=function(u){var s=String(u&&u.url||u);if(/raw\\.githubusercontent|sportscore/.test(s))return Promise.reject(new TypeError("simulated outage"));return f.apply(this,arguments)}})()</script>'
    open(os.environ['PREVIEW_DIR'] + '/app-outage.html', 'w').write(app.replace('<head>', '<head>' + inject, 1))
    try:
        base = os.environ['QA_BASE']; import qa as _qa; _qa.BASE = base.replace('app.html', 'app-outage.html')
        q.open('/v3?demo=0', settle=14)
        t = q.js('return document.body.innerText')
        check('O1 outage: real mode shows no sample data', 'SAMPLE DATA' not in t and 'SAMPLE-' not in t and 'Sample' not in t, t[:160])
        check('O2 outage: the app says data is unavailable, not blank', bool(re.search(r"unavailable|couldn.t load|not available|offline|try again|No games", t, re.I)), t[:300])
        check('O4 outage: the bundled saved copy is labelled, never silent', 'Saved copy in use' in t, t[:200])
        q.shot(OUT + '/outage_home.png')
        q.open('/v3/games?demo=0', settle=10)
        t = q.js('return document.body.innerText')
        check('O3 outage Games: no sample, honest empty/unavailable state', 'SAMPLE' not in t.upper() and q.js('return document.querySelectorAll(".v3-gc").length') == 0, t[:240])
        q.shot(OUT + '/outage_games.png')
    finally:
        os.remove(os.environ['PREVIEW_DIR'] + '/app-outage.html')
finally:
    q.close()
json.dump(R, open(OUT + '/preview_check.json', 'w'), indent=1)
print('\n%d/%d passed' % (sum(1 for r in R if r[1]), len(R)))
