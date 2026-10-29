"""Cross-origin Date readability in a real WebKit engine (WebKitGTK MiniBrowser via WebKitWebDriver).

Same fake upstream, relay core and probe as scripts/relay-browser-date.mjs (which serves them with --serve), driven
from WebKit instead of Chromium. BEFORE = origin/main core, AFTER = the working tree.

  xvfb-run is started by this script. Ports: WK_PORT (WebDriver, default 4466), PAGE_PORT (the page origin, default 8776).
  python3 scripts/relay-webkit-date.py [--after-only]

Exit 0 only if BEFORE reads Date as null on every row and AFTER reads a current Date on every row.
"""
import json, os, signal, subprocess, sys, time
from email.utils import parsedate_to_datetime
from selenium import webdriver
from selenium.webdriver.common.options import ArgOptions

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WK_PORT = os.environ.get('WK_PORT', '4466')
PAGE_PORT = os.environ.get('PAGE_PORT', '8776')
BEFORE_REF = os.environ.get('BEFORE_REF', 'origin/main')
ENV = {k: v for k, v in os.environ.items() if 'proxy' not in k.lower()}
ENV['no_proxy'] = ENV['NO_PROXY'] = '127.0.0.1,localhost'


def start_driver():
    p = subprocess.Popen(['xvfb-run', '-a', '-s', '-screen 0 1280x1024x24', 'WebKitWebDriver', f'--port={WK_PORT}'], env=ENV,
                         stdout=open(os.path.join(os.environ.get('TMPDIR', '/tmp'), f'wkdriver{WK_PORT}.log'), 'w'), stderr=subprocess.STDOUT, preexec_fn=os.setsid)
    for _ in range(50):
        time.sleep(0.2)
        try:
            import urllib.request
            urllib.request.urlopen(f'http://127.0.0.1:{WK_PORT}/status', timeout=1).read()
            return p
        except Exception:
            continue
    raise SystemExit('WebKitWebDriver did not start')


def browser():
    o = ArgOptions()
    o.set_capability('browserName', 'MiniBrowser')
    o.set_capability('webkitgtk:browserOptions', {'binary': '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser', 'args': ['--automation']})
    return webdriver.Remote(command_executor=f'http://127.0.0.1:{WK_PORT}', options=o)


def serve(ref):
    args = ['node', os.path.join(ROOT, 'scripts/relay-browser-date.mjs'), '--serve'] + (['--ref', ref] if ref else [])
    p = subprocess.Popen(args, cwd=ROOT, env={**ENV, 'PAGE_PORT': PAGE_PORT}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return p, json.loads(p.stdout.readline())


def run(label, ref, d):
    p, info = serve(ref)
    try:
        d.get(info['pageOrigin'])
        d.set_script_timeout(40)
        rows = d.execute_async_script('const cb = arguments[arguments.length - 1]; window.probe(arguments[0]).then(cb, (e) => cb([{ name: "probe failed", error: String(e) }]));', info['relayOrigin'])
        d.get(info['otherOrigin'])
        blocked = d.execute_async_script('const cb = arguments[arguments.length - 1]; fetch(arguments[0]).then((r) => cb({ status: r.status, date: r.headers.get("Date") }), (e) => cb({ error: String(e.name) }));', f"{info['relayOrigin']}/markets?series_ticker=KXNFLGAME&status=open&limit=2")
        ua = d.execute_script('return navigator.userAgent')
    finally:
        p.send_signal(signal.SIGTERM)
        try:
            err = p.stderr.read()
        except Exception:
            err = ''
        p.wait(timeout=10)
    log = json.loads(err.strip().splitlines()[-1])['relayLog'] if err.strip() else []
    print(f"\n== {label}: page {info['pageOrigin']} -> relay {info['relayOrigin']}  [{ua}]")
    for r in rows:
        if r.get('error'):
            print(f"   {r['name']:<36} fetch error: {r['error']}")
        else:
            print(f"   {r['name']:<36} status={r['status']} Date={json.dumps(r['date'])} X-Sift-Observed-At={json.dumps(r['observedAt'])} Retry-After={json.dumps(r['retryAfter'])} Cache-Control={json.dumps(r['cacheControl'])} Vary(control)={json.dumps(r['vary'])}")
    print(f"   page on a third, disallowed origin: {json.dumps(blocked)}")
    print(f"   what the relay received from WebKit ({len(log)}): " + ' '.join(f"{l['method']}[cache-control: {l['cacheControl']}]" if l['cacheControl'] else l['method'] for l in log))
    return rows, blocked


def main():
    after_only = '--after-only' in sys.argv
    drv = start_driver()
    ok = True
    try:
        d = browser()
        try:
            if not after_only:
                rows, _ = run(f'BEFORE ({BEFORE_REF}) in WebKitGTK', BEFORE_REF, d)
                for r in rows:
                    if r['name'].startswith('custom header'):
                        if not r.get('error'): ok = False; print('   FAIL before/custom header: expected a CORS block')
                        continue
                    if r.get('error') or r['date'] is not None:
                        ok = False; print(f"   FAIL before/{r['name']}: expected Date null, got {r}")
            rows, blocked = run('AFTER (working tree) in WebKitGTK', None, d)
            by = {r['name']: r for r in rows}
            for r in rows:
                if r['name'].startswith('custom header'):
                    if not r.get('error'): ok = False; print('   FAIL after/custom header: expected a CORS block')
                    continue
                if r.get('error') or not r['date']:
                    ok = False; print(f"   FAIL after/{r['name']}: Date not readable: {r}"); continue
                skew = parsedate_to_datetime(r['date']).timestamp() * 1000 - r['pageClockMs']
                print(f"   {r['name']:<36} relay Date minus page clock = {skew:.0f} ms")
                if abs(skew) > 5000: ok = False; print('   FAIL: not the current time')
                if r['vary'] is not None: ok = False; print('   FAIL: Vary became readable')
            f, c = by['200 fresh'], by['200 cached (2.1 s later)']
            gap = parsedate_to_datetime(c['date']).timestamp() - parsedate_to_datetime(f['date']).timestamp()
            print(f"   cached answer: Date is {gap:.0f} s later than the first answer's; X-Sift-Observed-At {'unchanged' if c['observedAt'] == f['observedAt'] else 'CHANGED'}")
            if not (1 <= gap <= 4) or c['observedAt'] != f['observedAt']: ok = False; print('   FAIL: cached answer semantics')
            if by['429']['retryAfter'] != '9': ok = False; print('   FAIL: Retry-After not readable')
            if not blocked.get('error'): ok = False; print('   FAIL: disallowed origin could read the relay')
        finally:
            d.quit()
    finally:
        os.killpg(os.getpgid(drv.pid), signal.SIGTERM)
    print('\nPASS' if ok else '\nFAIL')
    sys.exit(0 if ok else 1)


main()
