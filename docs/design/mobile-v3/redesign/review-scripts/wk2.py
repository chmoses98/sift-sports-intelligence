import json, time, traceback
from selenium import webdriver
from selenium.webdriver.common.by import By
S = '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/rd/'
opts = webdriver.WebKitGTKOptions()
opts.binary_location = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'
opts.add_argument('--automation')
drv = webdriver.WebKitGTK(options=opts)
out = {}
try:
    drv.set_window_size(390, 844)
    drv.get('http://localhost:8098/Props.dc.html'); time.sleep(2.2)
    drv.find_elements(By.CSS_SELECTOR, 'button.prow')[0].click(); time.sleep(0.8)
    drv.execute_script("document.getElementById('sc').scrollTop = 400"); time.sleep(0.4)
    drv.find_element(By.CSS_SELECTOR, '.anote').click(); time.sleep(1.0)
    out['sheet_half'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    drv.save_screenshot(S + 'out/wk-props-sheet.png')
    drv.find_element(By.CSS_SELECTOR, 'button.grab').click(); time.sleep(0.8)
    out['sheet_full'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
    drv.find_element(By.CSS_SELECTOR, '[data-sheet-close]').click(); time.sleep(0.6)
    out['sheet_closed'] = drv.execute_script("return Math.round(document.querySelector('.sheet').getBoundingClientRect().height)")
except Exception:
    out['error'] = traceback.format_exc()[-400:]
finally:
    print(json.dumps(out)); drv.quit()
