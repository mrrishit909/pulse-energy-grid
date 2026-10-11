"""Before/after sheets: python3 tests/before-after-sheet.py <dir with before/<vp>/ and after/<vp>/>
One sheet per viewport folder (including <vp>-reduced): each cell is a BEFORE | AFTER pair of one shot, 3 pairs per row."""
import os, re, sys
from PIL import Image, ImageDraw

root = sys.argv[1]
for vp in sorted(d for d in os.listdir(os.path.join(root, "after")) if re.fullmatch(r"\d+x\d+(-reduced)?", d)):
    w0, h0 = map(int, vp.split("-")[0].split("x"))
    s = 300 / w0 if w0 >= 768 else 190 / w0
    W, H = int(w0 * s), int(h0 * s)
    fs = sorted(f for f in os.listdir(os.path.join(root, "after", vp)) if f.endswith((".png", ".jpg")))
    per = 3
    rows = (len(fs) + per - 1) // per
    sheet = Image.new("RGB", (per * (2 * W + 24), rows * (H + 20)), (40, 40, 40))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        x0, y0 = (i % per) * (2 * W + 24), (i // per) * (H + 20)
        for k, kind in enumerate(("before", "after")):
            p = os.path.join(root, kind, vp, f)
            x = x0 + k * (W + 4)
            if os.path.exists(p):
                sheet.paste(Image.open(p).convert("RGB").resize((W, H)), (x, y0 + 16))
            dr.text((x + 2, y0 + 2), f"{kind.upper()} {f.rsplit('.', 1)[0]}", fill=(255, 255, 0) if kind == "after" else (180, 180, 180))
    out = os.path.join(root, f"sheet-{vp}.png")
    sheet.save(out)
    print(out, len(fs))
