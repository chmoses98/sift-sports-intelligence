"""Exact screenshot comparison compositor. Does not synthesize or retouch app imagery.
python3 scripts/sift2/compare.py --references DIR --captures DIR --output DIR
Requires Pillow only for this review utility, not for the application.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
p = argparse.ArgumentParser()
for name in ['references','captures','output']: p.add_argument('--'+name, type=Path, required=True)
p.add_argument('--previous',type=Path,help='Optional prior milestone captures at identical dimensions')
a = p.parse_args(); a.output.mkdir(parents=True, exist_ok=True)
font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_path, 20)
refs = {
 'games': a.references/'F10AAC23-5B37-44E0-ADB9-13222F62928B(1).jpeg',
 'command': a.references/'1A21A868-B658-48F2-AB9E-93170DBBBA31(1).jpeg',
 'mobile': a.references/'E14AABB1-CD27-4117-A5F4-B2431179851C(1).jpeg',
}
def compare(ref, actual, dest, subtitle, left='APPROVED REFERENCE'):
    actual = Image.open(actual).convert('RGB')
    assert ref.size == actual.size, (ref.size, actual.size)
    w,h = ref.size; pad,top=16,76
    sheet=Image.new('RGB',(w*2+pad*3,h+top+pad),'#07111f');d=ImageDraw.Draw(sheet)
    d.text((pad,12),left,font=font,fill='#a9d8ff')
    d.text((w+pad*2,12),'IMPLEMENTATION - NOT APPROVED',font=font,fill='#e1edf8')
    d.text((pad,43),subtitle,font=ImageFont.truetype(font_path,12),fill='#bdcee0')
    sheet.paste(ref,(pad,top));sheet.paste(actual,(w+pad*2,top));sheet.save(a.output/dest)
for ref, cap, out in [('games','matched-games','games-side-by-side.png'),('command','matched-overview','command-side-by-side.png')]:
    compare(Image.open(refs[ref]).convert('RGB'),a.captures/f'desktop-{cap}.png',out,'Both rendered at 1536 x 1024. Published fixture data differs from the illustrative reference.')
# Exclude mock phone hardware/status bar; retain the reference's actual app content and bottom navigation.
# 474 x 1416 -> 390 x 1165 with aspect ratio preserved; no stretching of the implementation capture.
mobile=Image.open(refs['mobile']).convert('RGB')
for rect,cap,out in [((24,80,498,1496),'matched-overview','mobile-overview-side-by-side.png'),((535,80,1008,1496),'matched-players','mobile-players-side-by-side.png')]:
    ref=mobile.crop(rect)
    ref=ref.resize((390,1165),Image.Resampling.LANCZOS)
    compare(ref,a.captures/f'phone-{cap}.png',out,'Mock display crop normalized to 390 x 1165; implementation uses that CSS viewport. No phone hardware.')
if a.previous:
    for cap in ['desktop-matched-games','desktop-matched-overview','phone-matched-overview','phone-matched-players','desktop-arrowhead-archive']:
        before=a.previous/f'{cap}.png';after=a.captures/f'{cap}.png'
        if before.exists() and after.exists():
            compare(Image.open(before).convert('RGB'),after,f'{cap}-before-after.png','Identical viewport / publication. Layout retained; imagery, framing and surface polish only.','PREVIOUS MILESTONE')
