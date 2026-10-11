"""Contact sheets for an evidence folder (every WxH subfolder): python3 tests/contact-sheet.py ../artifacts/evidence/<run>"""
import os, sys
from PIL import Image, ImageDraw
root = sys.argv[1]
for vp in sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)) and __import__("re").fullmatch(r"\d+x\d+", d)):
    w0, h0 = map(int, vp.split("x"))
    cols = 6 if w0 < 800 else 4
    scale = (1800 / cols) / w0
    files = sorted(f for f in os.listdir(os.path.join(root, vp)) if f.endswith(".png"))
    if not files: continue
    w, h = int(w0 * scale), int(h0 * scale)
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + 6), rows * (h + 22)), (40, 40, 40))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(root, vp, f)).convert("RGB").resize((w, h))
        x, y = (i % cols) * (w + 6), (i // cols) * (h + 22)
        sheet.paste(im, (x, y + 18)); dr.text((x + 2, y + 3), f, fill=(255, 255, 0))
    sheet.save(os.path.join(root, f"sheet-{vp}.png"))
    print(vp, len(files))
