import time
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
opts = webdriver.WebKitGTKOptions(); opts.binary_location='/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser'; opts.add_argument('--automation')
d = webdriver.WebKitGTK(options=opts); d.set_window_size(447, 900)
try:
    d.get('http://localhost:8098/Game.dc.html'); time.sleep(1.8)
    sel = lambda: d.execute_script("return document.querySelector('[role=tab][aria-selected=true]').textContent.trim()")
    out=[sel()]
    for _ in range(2):
        pane = d.find_element(By.CSS_SELECTOR, '.pane')
        ActionChains(d).move_to_element_with_offset(pane, 150, 100).click_and_hold().move_by_offset(-60, 2).move_by_offset(-120, 2).release().perform(); time.sleep(0.6); out.append(sel())
    pane = d.find_element(By.CSS_SELECTOR, '.pane')
    ActionChains(d).move_to_element_with_offset(pane, -150, 100).click_and_hold().move_by_offset(60, 2).move_by_offset(120, 2).release().perform(); time.sleep(0.6); out.append(sel())
    print('webkit swipe:', ' -> '.join(out))
finally: d.quit()
