"""WebKitGTK (real WebKit engine) helper: exact CSS-pixel viewport via calibration."""
import sys, time
from selenium import webdriver
from selenium.webdriver.common.options import ArgOptions

def driver(w=390, h=844):
    o = ArgOptions()
    o.set_capability('browserName', 'MiniBrowser')
    o.set_capability('webkitgtk:browserOptions', {'binary': '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', 'args': ['--automation']})
    d = webdriver.Remote(command_executor='http://127.0.0.1:%s' % __import__('os').environ.get('WK_PORT', '4444'), options=o)
    d.set_window_size(w, h)
    for _ in range(3):
        iw, ih = d.execute_script('return [innerWidth, innerHeight]')
        if (iw, ih) == (w, h): break
        cur = d.get_window_size()
        d.set_window_size(cur['width'] + (w - iw), cur['height'] + (h - ih))
    return d

if __name__ == '__main__':
    url, out = sys.argv[1], sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 390
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 844
    d = driver(w, h)
    d.get(url)
    time.sleep(2)
    print(d.execute_script('return [innerWidth, innerHeight, devicePixelRatio]'))
    d.save_screenshot(out)
    d.quit()
