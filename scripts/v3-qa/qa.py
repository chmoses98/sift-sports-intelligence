"""WebKit (WebKitGTK) QA helper. The app runs inside an exact-size iframe so the CSS viewport is exactly W x H."""
import sys, time, io, json
from PIL import Image
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from wk import driver

HARNESS = 'http://127.0.0.1:%s/frame.html' % __import__('os').environ.get('WK_HARNESS_PORT', '8765')  # python3 -m http.server 8765 in a folder holding frame.html
BASE = __import__('os').environ.get('QA_BASE', 'http://localhost:5173/sift-sports-intelligence/')

class QA:
    def __init__(self, w=390, h=844):
        self.w, self.h = w, h
        self.d = driver(max(w + 60, 460), h + 20)
        self.ready = False

    def open(self, hash_path, settle=2.5, w=None, h=None):
        if w: self.w = w
        if h: self.h = h
        self.d.switch_to.default_content()
        self.d.get(f'{HARNESS}?src={BASE}&w={self.w}&h={self.h}#{hash_path}')
        self.d.execute_script('document.getElementById("f").src = arguments[0]', f'{BASE}#{hash_path}')
        time.sleep(settle)
        self.d.switch_to.frame(self.d.find_element('id', 'f'))
        self.hide_bars()

    def hide_bars(self):
        self.d.execute_script('var s=document.createElement("style");s.textContent="html{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{display:none;width:0;height:0}";document.head.appendChild(s)')

    def js(self, script, *a):
        return self.d.execute_script(script, *a)

    def shot(self, out, crop=True):
        self.d.switch_to.default_content()
        png = self.d.get_screenshot_as_png()
        im = Image.open(io.BytesIO(png)).convert('RGB')
        if crop: im = im.crop((0, 0, self.w, self.h))
        im.save(out)
        self.d.switch_to.frame(self.d.find_element('id', 'f'))
        return out

    def wait(self, s=1.0): time.sleep(s)
    def close(self):
        try: self.d.quit()
        except Exception: pass
