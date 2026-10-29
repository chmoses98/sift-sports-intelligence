"""Side-by-side: approved reference (left) vs real WebKit screenshot (right), both scaled to the same height."""
import sys
from PIL import Image
ref, shot, out = sys.argv[1], sys.argv[2], sys.argv[3]
a = Image.open(ref).convert('RGB'); b = Image.open(shot).convert('RGB')
H = 1000
a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS); b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
c = Image.new('RGB', (a.width + b.width + 24, H), (20, 20, 20)); c.paste(a, (0, 0)); c.paste(b, (a.width + 24, 0)); c.save(out)
print(c.size)
