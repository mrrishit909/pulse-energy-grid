"""Before/after sheet per viewport: python3 tests/before-after-sheet.py <dir with before/ and after/>"""
import os, sys
from PIL import Image, ImageDraw
root = sys.argv[1]
for vp, s in (("1440x900", 0.3), ("768x1024", 0.26), ("390x844", 0.4)):
    fs = sorted(os.listdir(os.path.join(root, "before", vp)))
    w0, h0 = map(int, vp.split("x")); W, H = int(w0 * s), int(h0 * s)
    sheet = Image.new("RGB", (len(fs) * (W + 6), 2 * (H + 18)), (50, 50, 50)); dr = ImageDraw.Draw(sheet)
    for r, kind in enumerate(("before", "after")):
        for i, f in enumerate(fs):
            im = Image.open(os.path.join(root, kind, vp, f)).convert("RGB").resize((W, H))
            x, y = i * (W + 6), r * (H + 18)
            sheet.paste(im, (x, y + 16)); dr.text((x + 2, y + 2), f"{kind.upper()} {f}", fill=(255, 255, 0))
    sheet.save(os.path.join(root, f"sheet-{vp}.png")); print(vp, len(fs))
