# Builds the before/after pairs: v3.2 polish screenshots beside the v4 captures (run from docs/design/mobile-v3).
from PIL import Image, ImageDraw, ImageFont
RD = '/tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/rd/out/'
SC = 'redesign/screenshots/'; P = 'polish/screenshots/'
F = ImageFont.load_default(size=30)
def card(before, after_list, out, labels):
    B = [Image.open(P + b).convert('RGB') for b in before]; A = [Image.open(RD + 'final3/' + a + '.png').convert('RGB') for a in after_list]
    H = 1688
    fit = lambda im: im.resize((int(im.width * H / im.height), H), Image.LANCZOS)
    B = [fit(i) for i in B]; A = [fit(i) for i in A]
    pad, gap, mid = 84, 40, 64
    W = sum(i.width for i in B) + sum(i.width for i in A) + gap * (len(B) + len(A) - 1) + mid - gap
    im = Image.new('RGB', (W, H + pad), (14, 17, 22)); d = ImageDraw.Draw(im); x = 0
    d.text((x + 6, 26), labels[0], fill=(170, 182, 198), font=F)
    for i in B: im.paste(i, (x, pad)); x += i.width + gap
    x += mid - gap
    d.text((x + 6, 26), labels[1], fill=(245, 247, 250), font=F)
    for i in A: im.paste(i, (x, pad)); x += i.width + gap
    im.save(SC + 'before-after/' + out + '.jpg', quality=86, optimize=True)
L = ('BEFORE   v3.2 polish', 'AFTER   v4 redesign')
card(['01-home-live-390.jpg'], ['01-home-live'], 'home', L)
card(['05-game-live-390.jpg'], ['02-game-live'], 'game-live', L)
card(['09-game-matchups-390.jpg'], ['03-game-matchups'], 'game-matchups', L)
card(['10-game-players-390.jpg'], ['04-game-players'], 'game-players', L)
card(['11-game-markets-390.jpg'], ['05-game-markets'], 'game-markets', L)
card(['10-game-players-390.jpg'], ['06-props-explorer', '06b-props-detail'], 'player-props', ('BEFORE   v3.2 (Players tab, the only prop view)', 'AFTER   v4 explorer and player detail'))
card(['12-game-signal-sheet-390.jpg'], ['02c-game-signal-sheet'], 'signal-sheet', L)
card(['14-signals-list-390.jpg'], ['07-signals'], 'signals-list', L)
