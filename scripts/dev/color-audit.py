#!/usr/bin/env python3
"""DEVELOPMENT-ONLY rendered colour audit (not part of the app or CI).

Compares a reference image (the approved mockup) with a rendered screenshot of the app by what is actually
on screen, not by CSS tokens:

  * whole-frame statistics of the dark UI field (pixels with luminance < 0.20): median RGB, luminance,
    saturation, hue, and the share of NEUTRAL dark pixels (saturation < 0.25, i.e. charcoal/gray) vs
    BLUE-BLACK pixels (hue 180-235 deg, saturation >= 0.25);
  * the share of the whole frame that is "neutral gray" at any lightness;
  * the dominant dark colour clusters (k-means, 6 clusters, dark field only);
  * optional named regions (JSON: [[name, [x0,y0,x1,y1], [x0,y0,x1,y1]], ...]) sampled from both images.

Usage: python3 scripts/dev/color-audit.py REFERENCE.png APP.png [regions.json]
Needs Pillow.
"""
import colorsys, json, random, statistics as st, sys
from PIL import Image

def load(p, w=768):
    im = Image.open(p).convert('RGB')
    return im.resize((w, round(im.height * w / im.width)))

def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return h * 360, s, v

def stats(px):
    med = tuple(int(st.median(p[i] for p in px)) for i in range(3))
    h, s, v = hsv(med)
    return med, lum(med), s, h

def frame(im):
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    dark = [p for p in px if lum(p) < 0.20]
    neutral_dark = [p for p in dark if max(p) < 6 or hsv(p)[1] < 0.25]
    blue_dark = [p for p in dark if max(p) >= 6 and hsv(p)[1] >= 0.25 and 180 <= hsv(p)[0] <= 235]
    gray_any = [p for p in px if 18 < max(p) and hsv(p)[1] < 0.15 and lum(p) < 0.6]
    return {
        'dark_share': len(dark) / len(px),
        'dark_median': stats(dark) if dark else None,
        'neutral_share_of_dark': len(neutral_dark) / max(1, len(dark)),
        'blue_black_share_of_dark': len(blue_dark) / max(1, len(dark)),
        'gray_share_of_frame': len(gray_any) / len(px),
        'vivid_share': sum(1 for p in px if hsv(p)[1] > 0.5 and lum(p) > 0.08) / len(px),
        'bright_text_share': sum(1 for p in px if lum(p) > 0.75) / len(px),
        'mid_slate_share': sum(1 for p in px if 0.012 < lum(p) < 0.08 and hsv(p)[1] < 0.45) / len(px),
        'mean_frame_luminance': st.mean(lum(p) for p in random.Random(1).sample(px, min(20000, len(px)))),
        'clusters': kmeans([p for p in random.Random(2).sample(dark, min(6000, len(dark)))], 6) if dark else [],
    }

def kmeans(px, k, it=12):
    cs = random.Random(3).sample(px, k)
    for _ in range(it):
        groups = [[] for _ in cs]
        for p in px:
            groups[min(range(len(cs)), key=lambda i: sum((p[j] - cs[i][j]) ** 2 for j in range(3)))].append(p)
        cs = [tuple(int(st.mean(q[j] for q in g)) for j in range(3)) if g else cs[i] for i, g in enumerate(groups)]
    out = sorted(((len(g) / len(px), c) for g, c in zip(groups, cs)), reverse=True)
    return [(round(sh, 3), '#%02x%02x%02x' % c) for sh, c in out]

def region(im_full, box, mode='median'):
    x0, y0, x1, y1 = box[:4]
    px = [im_full.getpixel((x, y)) for x in range(x0, x1) for y in range(y0, y1)]
    if mode == 'sat':
        px.sort(key=lambda p: max(p) - min(p)); px = px[-max(1, len(px) // 10):]
    if mode == 'bright':
        px.sort(key=lum); px = px[-max(1, len(px) // 20):]
    return stats(px)

if __name__ == '__main__':
    ref, app = sys.argv[1], sys.argv[2]
    hx = lambda c: '#%02x%02x%02x' % c
    for name, p in (('REFERENCE', ref), ('APP', app)):
        f = frame(load(p))
        m = f['dark_median']
        print(f'\n== {name}: {p}')
        print(f"  dark UI field: {f['dark_share']:.0%} of frame · median {hx(m[0])} · L {m[1]:.4f} · sat {m[2]:.2f} · hue {m[3]:.0f}°")
        print(f"  dark pixels that are blue-black: {f['blue_black_share_of_dark']:.0%} · neutral/charcoal: {f['neutral_share_of_dark']:.0%}")
        print(f"  neutral gray anywhere in frame: {f['gray_share_of_frame']:.1%} · mean frame luminance {f['mean_frame_luminance']:.4f}")
        print(f"  vivid accents (sat>0.5, L>0.08): {f['vivid_share']:.1%} · bright text/white (L>0.75): {f['bright_text_share']:.1%} · mid-dark low-saturation 'slate' (L .012-.08, sat<.45): {f['mid_slate_share']:.1%}")
        print(f"  dominant dark clusters: {f['clusters']}")
    if len(sys.argv) > 3:
        R = json.load(open(sys.argv[3]))
        a, b = Image.open(ref).convert('RGB'), Image.open(app).convert('RGB')
        print(f"\n{'region':26s} {'reference':34s} {'app':34s}")
        for name, rb, ab in R:
            r = region(a, rb, *(rb[4:] or ['median'])); q = region(b, ab, *(ab[4:] or ['median']))
            fmt = lambda s: f'{hx(s[0])} L{s[1]:.3f} s{s[2]:.2f} h{s[3]:3.0f}'
            print(f'{name:26s} {fmt(r):34s} {fmt(q):34s}')
