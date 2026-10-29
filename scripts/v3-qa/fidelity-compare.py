"""Side-by-side comparison images for the fidelity report: locked reference (left) and the implementation (right), both scaled to the same height.

    python3 scripts/v3-qa/fidelity-compare.py IMPL_DIR OUT_DIR [--w 390x844] [--only P1,SD2]

IMPL_DIR holds the 2x PNGs the visual spec writes (V3_FIDELITY_OUT=IMPL_DIR, files `<ID>-<W>x<H>.png`); the locked references are
docs/sift3/redesign/out/<id>.png (780x1688, 2x of 390x844). A root tab has no locked image: its implementation image is copied as is.
The 375x667 phone has no locked reference at that size; the 390x844 reference is shown beside it, scaled to the same height, as a hierarchy check only.
"""
import os
import sys
from PIL import Image, ImageDraw

REF_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'sift3', 'redesign', 'out')


def main():
    impl_dir, out_dir = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    size = args[args.index('--w') + 1] if '--w' in args else '390x844'
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    os.makedirs(out_dir, exist_ok=True)
    for f in sorted(os.listdir(impl_dir)):
        if not f.endswith(f'-{size}.png'):
            continue
        sid = f[: -len(f'-{size}.png')]
        if only and sid not in only:
            continue
        impl = Image.open(os.path.join(impl_dir, f)).convert('RGB')
        ref_path = os.path.join(REF_DIR, sid.lower() + '.png')
        out = os.path.join(out_dir, f'{sid}-{size}.jpg')
        if not os.path.exists(ref_path):
            impl.save(out, quality=78, optimize=True)
            print(out, 'impl only', impl.size)
            continue
        ref = Image.open(ref_path).convert('RGB')
        H = 960
        a = ref.resize((int(ref.width * H / ref.height), H), Image.LANCZOS)
        b = impl.resize((int(impl.width * H / impl.height), H), Image.LANCZOS)
        bar = 34
        c = Image.new('RGB', (a.width + b.width + 24, H + bar), (20, 20, 20))
        c.paste(a, (0, bar)); c.paste(b, (a.width + 24, bar))
        d = ImageDraw.Draw(c)
        d.text((8, 10), f'{sid} locked reference', fill=(220, 220, 220))
        d.text((a.width + 32, 10), f'{sid} implementation {size} (fixtures/real)', fill=(220, 220, 220))
        c.save(out, quality=78, optimize=True)
        print(out, c.size)


main()
