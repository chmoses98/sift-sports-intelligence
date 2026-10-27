"""WebKit (WebKitGTK) check of the Stat Trend chart's touch selection and its observation list. Pointer-type touch actions are sent through
WebDriver (a touch pointer source), which WebKitGTK turns into touch input; this is the WebKit engine, NOT iOS Safari, and not a finger.
Needs start_driver.sh, `python3 -m http.server <port>` in scripts/v3-qa, and the dev server:
  WK_PORT=4466 WK_HARNESS_PORT=8786 QA_BASE=http://localhost:5183/sift-sports-intelligence/ python3 scripts/v3-qa/trend_wk.py
Reads the published documents through the session proxy (live), so values drift; the checks assert behaviour, not numbers.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions import interaction
from selenium.webdriver.common.actions.action_builder import ActionBuilder
from selenium.webdriver.common.actions.pointer_input import PointerInput
from selenium.webdriver.common.by import By

R = []
def check(name, cond, extra=''):
    R.append((name, bool(cond), extra)); print(('PASS ' if cond else 'FAIL ') + name + (' - ' + str(extra) if extra and not cond else ''))

q = None
def H(): return q.js('return location.hash.replace(/^#/, "")')
def obs(): return (dict(p.split('=', 1) for p in H().split('?', 1)[1].split('&') if '=' in p) if '?' in H() else {}).get('obs')
def Y(): return q.js('return Math.round(scrollY)')
def count(css): return q.js('return document.querySelectorAll(arguments[0]).length', css)
def until(css, tries=40):
    for _ in range(tries):
        if count(css): return True
        q.wait(0.5)
    return False

def touch():
    return ActionBuilder(q.d, mouse=PointerInput(interaction.POINTER_TOUCH, 'finger'))

def column(i):
    return q.d.find_element(By.CSS_SELECTOR, '.st-obs svg [data-obs-hit="%d"]' % i)

def rect(i):
    return q.js('var r=document.querySelector(\'[data-obs-hit="\'+arguments[0]+\'"]\').getBoundingClientRect(); return {l:r.left,w:r.width,t:r.top,h:r.height}', i)

def tap_col(i, f):
    """A touch tap at fraction f of column i's width (element-origin actions, so the iframe offset does not matter)."""
    r = rect(i)
    a = touch()
    a.pointer_action.move_to(column(i), int(r['w'] * (f - 0.5)), 0).pointer_down().pointer_up()
    a.perform()
    q.wait(0.5)

try:
    q = QA(390, 844)
    q.open('/v3/stat/nfl/points_for?v=1&tab=trend&sel=DAL', settle=4)
    check('T1 Trend draws 12 columns and the list', until('.st-obs svg [data-obs]') and count('.st-obs svg [data-obs]') == 12 and count('[data-obs-row]') == 12, (count('.st-obs svg [data-obs]'), count('[data-obs-row]')))
    q.js('window.__pt = []; document.querySelector(".st-obs__plot").addEventListener("pointerdown", function (e) { window.__pt.push(e.pointerType); }, true)')
    q.js('document.querySelector(".st-obs__plot").scrollIntoView({block: "center"})'); q.wait(0.5)
    n0 = q.js('return history.length')
    order = q.js('return Array.from(document.querySelectorAll("[data-obs-row]")).map(function (e) { return e.getAttribute("data-obs-row"); }).reverse()')
    ok, bad = 0, []
    for i in (0, 5, 11, 3):
        for f in (0.15, 0.5, 0.85):
            nb = 6 if i != 6 else 7
            tap_col(nb, 0.5)
            if obs() != order[nb]: bad.append(('neighbour', nb, obs())); continue
            tap_col(i, f)
            for _ in range(10):
                if obs() == order[i] and q.js('return document.querySelector(\'[data-obs="%d"]\').getAttribute("data-on")' % i) == 'true': break
                q.wait(0.2)
            if obs() == order[i] and q.js('return document.querySelector(\'[data-obs="%d"]\').getAttribute("data-on")' % i) == 'true': ok += 1
            else: bad.append((i, f, obs(), order[i]))
    kinds = q.js('return window.__pt')
    check('T2 touch taps at the left, centre and right of columns 0, 3, 5 and 11 select exactly that observation', ok == 12 and not bad, (ok, bad[:4]))
    # WebKitGTK's WebDriver turns a touch pointer source into MOUSE pointer events (it has no touch device), so this script exercises the
    # chart's pointer path (capture, drag, commit on lift) in the WebKit engine; real touch is only covered by the Chromium CDP tests.
    print('INFO pointer types the chart received through WebDriver touch actions in WebKitGTK:', sorted(set(kinds or [])))
    check('T4 history was replaced, not extended', q.js('return history.length') == n0, (q.js('return history.length'), n0))

    # press, drag across columns, hold, lift: the page records what the chart showed while the finger was down (a recorder in the page,
    # because the whole gesture is performed in one WebDriver call), then the address after the finger was lifted
    sel0 = obs()
    q.js("""window.__log = []; var snap = function (k) { var t = document.querySelector("[data-obs-tip]");
      window.__log.push({k: k, tip: t ? t.textContent : null, press: !!document.querySelector(".st-obc.is-press"), hash: location.hash,
        on: Array.from(document.querySelectorAll("[data-obs]")).map(function (e) { return e.getAttribute("data-on") === "true"; }).indexOf(true), y: Math.round(scrollY)}); };
      var p = document.querySelector(".st-obs__plot");
      p.addEventListener("pointermove", function () { setTimeout(function () { snap("move"); }, 0); }, true);
      p.addEventListener("pointerup", function () { setTimeout(function () { snap("up"); }, 60); }, true);
      p.addEventListener("pointercancel", function () { setTimeout(function () { snap("cancel"); }, 60); }, true);""")
    r2, r8 = rect(2), rect(8)
    y0 = Y()
    a = touch()
    a.pointer_action.move_to(column(2), 0, 0).pointer_down()
    for k in range(1, 7):
        a.pointer_action.move_to(column(2), int((r8['l'] - r2['l']) * k / 6), 3 if k % 2 else -3)
        a.pointer_action.pause(0.08)
    a.pointer_action.pause(0.3)
    a.pointer_action.pointer_up()
    a.perform()
    q.wait(0.6)
    log = q.js('return window.__log')
    held = [e for e in log if e['k'] == 'move' and e['press']]  # the first move is the hover before the press
    check('T5 while the pointer is down a readout names the column and the details card is in its pressed state', len(held) >= 3 and all(m['tip'] for m in held), held[:2])
    check('T5b the address did not change during the drag', all(m['hash'] == log[0]['hash'] for m in log if m['k'] == 'move'), [m['hash'][-8:] for m in log])
    seq = [m['on'] for m in held]
    check('T6 the preview followed the pointer rightwards, column by column, from 2 to the neighbourhood of 8 (snapshots lag one event)', seq == sorted(seq) and seq[0] <= 3 and seq[-1] >= 6, seq)
    check('T7 a sideways drag with a wobbling pointer did not scroll the page', all(m['y'] == y0 for m in log) and Y() == y0, ([m['y'] for m in log], y0, Y()))
    done = False
    for _ in range(20):
        if obs() == order[8] and q.js('return !document.querySelector("[data-obs-tip]") && document.querySelector(\'[data-obs="8"]\').getAttribute("data-on") === "true" && !document.querySelector(".st-obc.is-press")'): done = True; break
        q.wait(0.25)
    check('T8 lifting kept column 8 (obs in the address, outline on column 8) and the readout is gone', done, (obs(), order[8]))
except Exception:
    import traceback; traceback.print_exc(); R.append(('script error', False, ''))
finally:
    if q: q.close()
    bad = [r for r in R if not r[1]]
    print('\n%d checks, %d failed' % (len(R), len(bad)))
    sys.exit(1 if bad else 0)
