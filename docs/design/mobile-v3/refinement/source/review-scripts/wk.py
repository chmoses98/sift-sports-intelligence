import sys, json, time
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
S = '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/dc/'
CHECKS = open(S + 'checks.js').read()
opts = webdriver.WebKitGTKOptions()
opts.binary_location = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'
opts.add_argument('--automation')
drv = webdriver.WebKitGTK(options=opts)
out = {}
def load(f, w=390, h=844):
    drv.set_window_size(w, h)
    drv.get('http://localhost:8098/' + f); time.sleep(1.8)
    drv.execute_script("document.documentElement.style.setProperty('--appw', arguments[0] + 'px'); document.documentElement.style.setProperty('--apph', arguments[1] + 'px');", w, h)
    time.sleep(0.4)
def shot(name): drv.save_screenshot(S + 'shots/wk-' + name + '.png')
try:
    out['ua'] = drv.execute_script('return navigator.userAgent')
    for f, w, h in [('Main.dc.html', 390, 844), ('Main.dc.html', 375, 667), ('Game.dc.html', 390, 844), ('Game.dc.html', 375, 667), ('Signal.dc.html', 390, 844), ('Signal.dc.html', 375, 667), ('HomePublished.dc.html', 375, 667), ('GamePregame.dc.html', 375, 667), ('GameFinal.dc.html', 375, 667)]:
        load(f, w, h)
        r = drv.execute_script(CHECKS)
        out[f + '@' + str(w) + 'x' + str(h)] = r
        shot(f.split('.')[0] + '-' + str(w) + 'x' + str(h))
    # interactions in WebKit
    load('Main.dc.html')
    drv.find_element(By.CSS_SELECTOR, 'button.sigchip').click(); time.sleep(0.7)
    out['home_sheet_open_height'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    shot('home-sheet')
    ActionChains(drv).send_keys('').perform(); time.sleep(0.5)   # Escape
    out['home_sheet_after_escape'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    load('Game.dc.html')
    for t in ['Matchups', 'Players', 'Markets']:
        for b in drv.find_elements(By.CSS_SELECTOR, 'button.gtab'):
            if t in b.text: b.click(); time.sleep(0.5); break
        out['game_tab_' + t] = drv.execute_script("return document.querySelector('[role=tabpanel]') && document.querySelector('[role=tabpanel]').id")
        shot('game-' + t.lower())
    load('Signal.dc.html')
    g = drv.find_element(By.CSS_SELECTOR, 'button.grab'); g.click(); time.sleep(0.7)
    out['signal_sheet_full'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    shot('signal-full')
    # drag the handle down with pointer actions
    ActionChains(drv).click_and_hold(g).move_by_offset(0, 120).release().perform(); time.sleep(0.7)
    out['signal_sheet_after_drag_down'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
finally:
    print(json.dumps(out, indent=1))
    drv.quit()
