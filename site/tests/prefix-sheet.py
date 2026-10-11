"""One sheet of every frame whose name starts with a prefix, one row per viewport: python3 tests/prefix-sheet.py <evidence dir> <prefix> <out.png>"""
import os, sys
from PIL import Image, ImageDraw
root, prefix, out = sys.argv[1], sys.argv[2], sys.argv[3]
rows = []
for vp, s in (("1440x900", 0.32), ("768x1024", 0.3), ("390x844", 0.42)):
    d = os.path.join(root, vp)
    if not os.path.isdir(d): continue
    fs = sorted(f for f in os.listdir(d) if f.startswith(prefix) and f.endswith(".png"))
    if not fs: continue
    ims = [Image.open(os.path.join(d, f)).convert("RGB") for f in fs]
    w, h = ims[0].size; W, H = int(w * s), int(h * s)
    row = Image.new("RGB", (len(ims) * (W + 6), H + 16), (50, 50, 50)); dr = ImageDraw.Draw(row)
    for i, (im, f) in enumerate(zip(ims, fs)):
        row.paste(im.resize((W, H)), (i * (W + 6), 16)); dr.text((i * (W + 6) + 2, 2), f, fill=(255, 255, 0))
    rows.append(row)
T = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), (50, 50, 50)); y = 0
for r in rows: T.paste(r, (0, y)); y += r.height + 6
T.save(out)
