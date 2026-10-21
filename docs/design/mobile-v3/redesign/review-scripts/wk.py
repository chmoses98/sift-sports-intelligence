import sys, json, time
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
S = '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/rd/'
CHECKS = open(S + 'checks.js').read()
opts = webdriver.WebKitGTKOptions()
opts.binary_location = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'
opts.add_argument('--automation')
drv = webdriver.WebKitGTK(options=opts)
out = {}
def load(f, w=390, h=844):
    drv.set_window_size(w, h)
    drv.get('http://localhost:8098/' + f); time.sleep(2.2)
    drv.execute_script("document.documentElement.style.setProperty('--appw', arguments[0] + 'px'); document.documentElement.style.setProperty('--apph', arguments[1] + 'px');", w, h)
    time.sleep(0.5)
def shot(name): drv.save_screenshot(S + 'out/wk-' + name + '.png')
try:
    out['ua'] = drv.execute_script('return navigator.userAgent')
    for f, w, h in [('Home.dc.html', 390, 844), ('Home.dc.html', 375, 667), ('Game.dc.html', 390, 844), ('Game.dc.html', 375, 667), ('Props.dc.html', 390, 844), ('PropsDetail.dc.html', 375, 667), ('Signals.dc.html', 390, 844), ('GamePregame.dc.html', 375, 812), ('HomePublished.dc.html', 375, 812)]:
        load(f, w, h)
        r = drv.execute_script(CHECKS)
        out[f + '@' + str(w) + 'x' + str(h)] = {k: r[k] for k in ('off', 'trunc', 'small', 'under12', 'fonts', 'support')}
        shot(f.split('.')[0] + '-' + str(w) + 'x' + str(h))
    # interactions
    load('Home.dc.html')
    drv.find_element(By.CSS_SELECTOR, '.gr .sigchip').click(); time.sleep(0.8)
    out['home_sheet_open_height'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    shot('home-sheet')
    drv.find_element(By.CSS_SELECTOR, '[data-sheet-close]').click(); time.sleep(0.6)
    out['home_sheet_after_close'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    for t in ['Tue']:
        for b in drv.find_elements(By.CSS_SELECTOR, 'button.day'):
            if t in b.text: b.click(); time.sleep(0.5); break
    out['home_empty_day_shows'] = drv.execute_script("return !!document.querySelector('.empty')")
    load('Game.dc.html')
    for t in ['Matchups', 'Players', 'Markets']:
        for b in drv.find_elements(By.CSS_SELECTOR, 'button.gtab'):
            if t in b.text: b.click(); time.sleep(0.6); break
        out['game_tab_' + t] = drv.execute_script("return document.querySelector('[role=tabpanel]') && document.querySelector('[role=tabpanel]').id")
        out['underline_x_' + t] = drv.execute_script("return Math.round(parseFloat(getComputedStyle(document.querySelector('.gtabs')).getPropertyValue('--gi')) )")
        shot('game-' + t.lower())
    load('Props.dc.html')
    drv.find_elements(By.CSS_SELECTOR, 'button.prow')[0].click(); time.sleep(0.7)
    out['props_detail_open'] = drv.execute_script("return !!document.querySelector('.dhero')")
    shot('props-detail-click')
    drv.find_element(By.CSS_SELECTOR, '.anote').click(); time.sleep(0.9)
    out['props_sheet_height'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    g = drv.find_element(By.CSS_SELECTOR, 'button.grab'); g.click(); time.sleep(0.8)
    out['props_sheet_full'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
finally:
    print(json.dumps(out, indent=1))
    drv.quit()
